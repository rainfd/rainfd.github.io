---
author: RainFD
title: "编程 Agent 是怎么做 Context Compaction 的"
slug: agent-compaction-strategies
pubDatetime: 2026-07-03T16:00:00+08:00
draft: false
tags:
  - AI Agent
  - Context
  - Compaction
description: "调研 Aider、Claude Code、Cline、OpenCode、OpenClaw 和 Pi 六个编程 Agent 的上下文压缩策略，用同一个模拟对话展示各自怎么压缩。"
---

AI 编程 Agent 有个挺头疼的问题：聊着聊着，对话就长到塞不进模型的上下文窗口了。删什么、留什么、怎么压缩——这几个决策直接决定 Agent 还能不能干活。

这事有个量化的答案。2026 年有篇论文叫 *Plans Don't Persist*，研究者让 Agent 执行一个多步骤任务，Agent 会在上下文里记下自己的计划（"先去厨房，再拿杯子……"）。然后他们把计划信息从上下文里删了。结果呢？成功率直接跌了 34.7 个百分点。计划信息其实占不了几个 token，但一删掉，Agent 就懵了，不知道该干嘛了。

说白了，上下文压缩不是机械地"删旧的留新的"——它是个信息取舍问题。取舍错了，整个 Agent 就崩了。上下文管理一出错，Agent 就没法继续干活。

这篇文章分析六个有公开算法或文档的产品——Aider、Claude Code、Cline、OpenCode、OpenClaw 和 Pi。用一个模拟的编程会话，看看同一个对话在每个产品里会被压成什么样。

## 模拟对话

场景很典型：一个编程会话，上下文窗口假设 8000 tokens。

对话从创建 FastAPI 用户管理模块开始，一路加了分页、加了搜索，三个需求迭代下来，总共 10 轮 Assistant 回复，里面塞满了 tool call 和 tool output。

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[USER #1] 帮我给这个项目加一个用户管理模块，要有创建、查询、删除。

[ASSISTANT #1] 好的，先看看项目结构。
  → search_files(pattern="*.py")

[TOOL OUTPUT #1] src/main.py, models/base.py, routers/items.py, ...

[ASSISTANT #2] 看到了。先看一下现有的 model 和 router。
  → read_file("src/models/base.py")
  → read_file("src/routers/items.py")

[TOOL OUTPUT #2a] Base 类：id, created_at, updated_at
[TOOL OUTPUT #2b] APIRouter prefix="/items"，有 get_all, create, delete

[ASSISTANT #3] 好，参照 items 的模式创建用户模块。
  → write_file("src/models/user.py")

[TOOL OUTPUT #3] 文件已创建

[ASSISTANT #4-6] 依次创建 schema、service、router...
  → write_file("src/schemas/user.py")
  → write_file("src/services/user_service.py")
  → write_file("src/routers/users.py")

[USER #2] 给列表接口加个分页，用 offset/limit，默认每页 20 条。

[ASSISTANT #7]
  → read_file("src/routers/users.py")
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #7a-b] 当前 router 和 service 代码

[ASSISTANT #8] 加上分页参数和逻辑。
  → write_file 更新 router 和 service

[USER #3] 再加个按用户名模糊搜索的功能。

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] 当前 service 代码（约 700 tokens）

[ASSISTANT #10] 添加搜索逻辑。
  → write_file("src/services/user_service.py")

[TOOL OUTPUT #10] 已更新
```

总共大概 8000 tokens，快顶到窗口上限了。好，下面看看六个产品各自怎么搞定这件事。

## 摘要派：用 LLM 生成摘要替代旧消息

做法很直接：把旧消息丢给 LLM，让它吐一个摘要出来，然后用摘要替掉原文。

### Aider：Head-Tail Split + 递归摘要

Aider 的算法挺清爽的。当上下文总 token 数超过预设上限，压缩逻辑就启动了：

```
压缩前（~8000 tokens）：

  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
  │ msg1 │ msg2 │ msg3 │ msg4 │ msg5 │ msg6 │ msg7 │ msg8 │ msg9 │ msg10│
  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
  ◀─────────────────────── HEAD ──────────────────────▶ ◀──── TAIL ────▶
              送 LLM 生成摘要                               直接保留

                          │
                          ▼

  ┌──────────────────────────────────────────────┐
  │  摘要：我让你给 FastAPI 项目添加用户管理模块，  │
  │  参照 items 模式创建了 model/schema/service/  │
  │  router，后续加了分页功能。                    │
  └──────────────────────────────────────────────┘

压缩后（~4000 tokens）：

  ┌──────────────────┬──────────────────────────────────────────┐
  │   摘要文本        │ msg7 │ msg8 │ msg9 │ msg10              │
  └──────────────────┴──────────────────────────────────────────┘
```

怎么分 head 和 tail 呢？简单说，head 是前面的旧消息，送进 LLM 生成摘要；tail 是最近的消息，直接保留不动。要是摘要 + tail 还是超了窗口上限呢？那就对摘要再压一次——最多递归 3 层。

摘要 prompt 要求以**第一人称**来总结，函数名、库名、包名都得留着。

压完之后上下文变成这样：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[USER]    I spoke to you previously about a number of things.
          我让你给 FastAPI 项目添加用户管理模块，包括创建、查询、删除功能。
          你查看了项目结构（src/models/base.py, src/routers/items.py），
          参照现有的 items 模块模式，创建了：
          - src/models/user.py（User 模型，继承 Base）
          - src/schemas/user.py（UserCreate, UserResponse）
          - src/services/user_service.py（UserService 类）
          - src/routers/users.py（APIRouter，prefix="/users"）
          然后我让你加 offset/limit 分页（默认每页 20 条），你修改了对应方法。
          目前 router 使用 UserService, UserCreate, UserResponse；
          service 使用 User 模型和 SQLAlchemy session。

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] 当前 service 代码

[ASSISTANT #10] 添加搜索逻辑。
  → write_file(...)

[TOOL OUTPUT #10] 已更新
```

你看，压缩后就剩一段摘要了。base.py 和 items.py 的完整代码丢了，只剩下"参照了 items 模块模式"这个结论。

### OpenClaw：多阶段分块 + 内存冲洗

OpenClaw 的压缩有两条挺独特的设计。

**第一条：多阶段分块。** 你想想，如果历史特别长，一次性全量摘要可能连模型自己的输入限制都超了。怎么办呢？OpenClaw 把历史按上下文窗口的 40% 切成多段，每段独立摘要，最后合并成一个总摘要。不是一口气全压，而是流水线式的分治：

```
超长历史（如 20 轮对话，16K tokens）：

  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │   Chunk 1    │   Chunk 2    │   Chunk 3    │   Chunk 4    │
  │  (40% 窗口)   │  (40% 窗口)   │  (40% 窗口)   │  (40% 窗口)   │
  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
    │ 摘要 1  │    │ 摘要 2  │    │ 摘要 3  │    │ 摘要 4  │
    └────┬───┘    └────┬───┘    └────┬───┘    └────┬───┘
         │              │              │              │
         └──────────────┴──────┬───────┴──────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │   合并后的总摘要   │
                      └─────────────────┘
```

**第二条：压缩前内存冲洗。** 这六个产品里，只有 OpenClaw 做了这一步。什么意思呢？在 compaction 之前，系统会自动提醒 Agent 把关键信息写到 MEMORY.md 里。比如某个变量值、某段报错日志、某个临时决策——这些东西对后续任务很重要，那就先记到持久记忆里，不会因为压缩而丢掉。

触发条件也比其他产品多——不是单一阈值，而是四种独立路径：模型返回溢出错误时触发、token 接近预留阈值时触发、JSONL 文件过大时触发、工具循环中压力过高时触发。四种路径把从被动响应到主动预检的场景都覆盖了。

压缩结果跟 Aider 差不多，但多阶段分块让摘要更完整——即使历史很长，也不会因为单次请求的 token 限制丢信息：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[SUMMARY]
  对话历史——在之前的工作中，用户要求创建 FastAPI 用户管理模块。
  参照 items 模块模式，创建了 User 模型（继承 Base，含 id, username, email 等字段）、
  UserSchema（UserCreate, UserResponse）、UserService（get_all, create, delete）、
  UserRouter（prefix="/users"，GET/POST/DELETE）。随后添加了 offset/limit 分页。
  当前正在 user_service.py 中添加按用户名模糊搜索功能。
  所有修改文件：models/user.py, schemas/user.py, services/user_service.py, routers/users.py

[ASSISTANT #9]  → read_file("src/services/user_service.py")
[TOOL OUTPUT #9] 当前 service 代码
[ASSISTANT #10] 添加搜索逻辑。
```

### Pi：LLM 摘要 + Split Turn 处理

Pi 的压缩策略本身不复杂——用 LLM 生成结构化摘要，跟 Aider 是同一类。但有两个工程细节做得挺细的。

**Split turn 处理。** 正常压缩在 turn 边界切（一个 turn = 用户消息 + 所有后续 assistant/tool 回复）。但问题来了：如果单个 turn 本身就特别长呢？比如你给了一个复杂需求，agent 经过几十次 tool call 才搞定——那这个 turn 的前半部分需要被压缩，后半部分得留着。这时候压缩切点就落在 turn 中间了，形成了所谓的 "split turn"：

```
长 turn 被切在中间：

  ┌─────────────────────────────────────────────────────┐
  │                    单个 turn                         │
  │  user → assistant → tool → assistant → tool → ...   │
  └──────────────────┬──────────────────────────────────┘
                     │ 切在这里
          ┌─────────┴──────────┐
          │   前半段（需压缩）    │   后半段（保留）  │
          └─────────┬──────────┘                   │
                    ▼                              │
            生成 turn 前缀摘要 ────── 和后半段合并 ──┘
```

Pi 怎么处理这个呢？生成两份摘要，然后合并：一份是历史上下文摘要，一份是 turn 前缀摘要。两份独立生成，再合成一个压缩条目。其他产品遇到超长 turn 的时候，要么整体保留（浪费 token budget），要么整体丢弃（丢信息）。只有 Pi 做了这种精细拆分。

**文件操作追踪。** 这也有意思。每次压缩，Pi 会提取被压缩消息里涉及到的读写文件，记在压缩条目里。下次压缩的时候，能从上次的记录继承文件列表——即使原始消息早被摘要替代了，也不会丢掉"操作过哪些文件"这条线索。

触发条件：上下文 token 数超过窗口减去预留空间（默认预留 16384 tokens），保留最近 20000 tokens。还支持 `/compact [instructions]` 手动触发。

压缩完长这样：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[COMPACTION SUMMARY]
  ## Progress
  用户管理模块 CRUD 已完成，分页功能已实现，正在添加搜索功能。

  ## Key Files
  src/models/user.py — User 模型
  src/routers/users.py — GET/POST/DELETE，已加 offset/limit 参数
  src/services/user_service.py — UserService 类，正添加 search_by_username

  ## File Operations
  读取: src/models/base.py, src/routers/items.py
  修改: src/models/user.py, src/schemas/user.py, src/services/user_service.py, src/routers/users.py

  ## Next Step
  在 UserService 添加 search_by_username 方法，router 添加相应端点

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] 当前 service 代码

[ASSISTANT #10] 添加搜索逻辑。
```

Pi 的压缩风格介于 Aider 和 OpenCode 之间——比 Aider 的纯叙述更结构化，但又不像 OpenCode 的 7 字段模板那么严格。它真正的工程价值在哪呢？就在 split turn 处理和文件操作累积追踪这些边界 case 上。

## 结构化派：用固定模板组织压缩结果

这一派不满足于"一段话描述历史"。他们把压缩结果组织成固定格式，让接手的新上下文能更快找到关键信息。

### Claude Code：预处理管线 + 9 段结构化摘要

Claude Code 公开文档说得很简单——"先清 tool outputs 再总结"。但泄露的源码告诉我们，实际远不止这么回事。背后是一套 5 阶段的上下文管理管线，相当复杂。

这五个阶段的设计逻辑是**递进式过滤**：Stage 1 到 4 每轮都跑，属于例行清理；Stage 5 才是压缩的主力，但不是每轮都触发。

```
每轮 API 调用前：

  Stage 1 → Stage 2 → Stage 3 → Stage 4
  (始终执行，零 LLM 调用；越靠后越激进)
                │
                ▼
         距上限仅剩 13K tokens？
          ╱              ╲
        否                是
         │                 │
         ▼                 ▼
      直接发送        Stage 5: Autocompact
                     (调用 LLM 生成 9 段摘要)
```

前四阶段的思路是——能零开销清理的，尽量先清掉：截断超大的工具结果、移除最老的消息组、清除旧的 tool outputs、归档碎片的上下文。这些都是只删不改，不需要 LLM。

你可能会问：为什么不能合并成一个"全清一遍"的步骤？因为这四个阶段处理的是不同类型的冗余信息，用的工具也完全不同：

- **Stage 1** 对付"单个结果太大"——比如一条日志输出 200K，截断它就行
- **Stage 2** 对付"消息太旧"——三天前的对话，整组移除
- **Stage 3** 对付"tool output 残留"——用 API 层的缓存删除，有热/冷两套策略
- **Stage 4** 对付"碎片"——零散的中间状态、无效重试、已经被覆盖的旧版本

四轮清理做完，空间还是不够？那就上第五阶段：调用 LLM，按严格的 9 段格式输出结构化摘要：

```
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections（含完整代码片段）
4. Errors and Fixes
5. Problem Solving
6. All User Messages（列出所有非工具结果的用户消息）
7. Pending Tasks
8. Current Work（特别关注最近消息）
9. Optional Next Step（逐字引用用户最新请求）
```

压缩后的结果：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[SUMMARY]
  ## Primary Request and Intent
  为 FastAPI 项目添加用户管理 CRUD 模块，后追加分页和模糊搜索。

  ## Key Technical Concepts
  FastAPI, SQLAlchemy, APIRouter, SQLAlchemy session, offset/limit pagination

  ## Files and Code Sections
  src/models/user.py: User 模型继承 Base
  src/routers/users.py: prefix="/users"，GET/POST/DELETE，已加分页
  src/services/user_service.py: get_all(offset,limit), create, delete

  ## All User Messages
  1. 帮我加用户管理模块，含创建、查询、删除
  2. 给列表接口加分页，offset/limit，默认每页 20 条
  3. 加按用户名模糊搜索功能

  ## Current Work
  正在 user_service.py 添加搜索逻辑。

[ASSISTANT #9]  → read_file("src/services/user_service.py")
[TOOL OUTPUT #9] 当前 service 代码
[ASSISTANT #10] 添加搜索逻辑。
```

Claude Code 和 OpenCode 可以算是同一个思路的两个变体——都用固定字段模板约束 LLM，确保不遗漏关键维度。区别在哪呢？Claude Code 在摘要之前多了四层不调 LLM 的清理，而 OpenCode 是直接上摘要。

### OpenCode：7 字段滚动摘要

OpenCode 的摘要模板包含七个固定字段。触发条件是上下文 token 超过窗口减去预留空间（默认预留 20k tokens），然后 LLM 按模板输出。如果有前一次摘要，就基于旧摘要更新，而不是从头生成：

```
## Goal           - 单句任务总结
## Constraints    - 用户约束和偏好
## Progress       - Done / In Progress / Blocked
## Key Decisions  - 关键决策及其原因
## Next Steps     - 有序的下一步
## Critical Context - 重要技术事实和已知问题
## Relevant Files - 相关文件路径
```

用模拟对话压缩后：

```
## Goal           为 FastAPI 项目创建用户管理 CRUD 模块
## Constraints    参照 items 模块模式，分页用 offset/limit，默认 20 条
## Progress       CRUD 已完成，分页已完成，搜索功能开发中
## Key Decisions  使用 UserService 封装数据库操作；分页参数在 router 层接收
## Next Steps     1. 在 UserService 添加 search_by_username 方法
## Critical Context  User 模型：id, username, email, hashed_password, is_active
## Relevant Files  src/models/user.py, src/services/user_service.py, src/routers/users.py, src/schemas/user.py
```

OpenCode 还有一个设计值得一提：完整历史是**持久化在数据库**里的，压缩只影响活跃模型看到的表示。理论上可以回溯丢失的信息，但实际检索能力有限。社区反馈（Issue #4659）说得很直白：这种"截断+摘要"模式会丢掉重要上下文，"AI 生成的摘要是有损且泛化的"。

## 工程优化派：在触发时机上做创新

前面几个产品有一个共同假设："压缩 = LLM 调用生成摘要"。Cline 打破了这个前提——问题不在于怎么压缩，而在于什么时候压缩。

### Cline：Double-buffer 预计算

Cline 选了一条不同的路：不在"怎么压缩"上较劲，而是在"什么时候压缩"上做文章。

```
传统做法：
  60% ────正常使用────▶ 75% ──[停！等 LLM 压缩...]──▶ 继续
                             用户卡住

Cline：
  60% ──[后台静默预计算摘要]──▶ 85% ──[替换]──▶ 继续
       用户无感知                     不等待
```

说白了，就是把 LLM 调用从"触发时"提前到"触发前"，用户根本不用等。

压缩本身有两种模式：

**Basic**：标准 LLM 摘要，把旧消息喂给模型生成总结。

**Agentic**（正在成为默认）：用另一个 AI Agent 来处理压缩任务。它会分析哪些上下文是关键依赖、哪些可以安全丢弃。比如说，那段报错信息得留着，因为它解释了后面为什么选了那个方案；那三十行没结果的 grep 输出就可以扔了。

在这基础上还加了一套 Budget Projection 系统：不是简单地"到了 85% 就换"，而是在 60% checkpoint 的时候就预测——压缩后能释放多少 token？摘要质量会降到什么程度？要是预测质量太差，就提前降低压缩的激进程度。

两种模式的输出形态不一样。Basic 模式生成标准摘要，跟 Aider 差不多；Agentic 模式会标注哪些信息被保留了、为什么保留：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[COMPACTED CONTEXT]
  ## Summary
  为 FastAPI 项目创建了用户管理 CRUD 模块（model/schema/service/router），
  后续添加了分页（offset/limit，默认 20）和模糊搜索功能。

  ## Preserved Details
  - items 模块模式被保留：它是创建用户模块的参考模板
  - 分页参数 offset/limit 被保留：router 和 service 层都需要用到
  - User 模型字段被保留：id, username, email, hashed_password, is_active

  ## Discarded
  - 30 行空搜索结果的 grep 输出
  - 被覆盖的旧版本 service 代码

[ASSISTANT #9]  → read_file("src/services/user_service.py")
[TOOL OUTPUT #9] 当前 service 代码
[ASSISTANT #10] 添加搜索逻辑。
```

## 横向对比

### 触发机制

| 产品        | 触发方式                                           | 阈值                                    |
| ----------- | -------------------------------------------------- | --------------------------------------- |
| Aider       | token 总数超 max_tokens                            | 隐式                                    |
| OpenClaw    | 溢出恢复 + 阈值 + 文件大小 + 中途预检              | 默认 reservation 20k tokens             |
| Pi          | context 超阈值时 LLM 摘要；支持 `/compact` 手动    | reserve 16384 tokens，keep 20000 tokens |
| Claude Code | 5 阶段管线，距离限制 13K tokens 时触发 autocompact | 13K tokens                              |
| OpenCode    | 请求 token > context - buffer                      | 默认 buffer 20k tokens                  |
| Cline       | 60% checkpoint / 85% swap                          | 可配置 per-mode                         |

### 压缩方式

| 产品        | 压缩手段                         |     需要 LLM 调用？     |
| ----------- | -------------------------------- | :---------------------: |
| Aider       | 递归摘要                         |           是            |
| OpenClaw    | 多阶段分块摘要 + 内存冲洗        |           是            |
| Pi          | LLM 结构化摘要 + Split Turn 处理 |           是            |
| Claude Code | 4 层预处理 + 9 段结构化摘要      |    是（Stage 5 触发）    |
| OpenCode    | 7 字段结构化摘要                 |           是            |
| Cline       | 后台预计算摘要                   |           是            |

### 设计取舍

这六个产品的分歧，归根结底集中在一个问题上：**压缩的时候，原始信息丢不丢？**

摘要派（Aider、OpenClaw、Pi）选择丢掉原始消息，信息损失不可逆。他们把信任押在摘要质量上——只要 LLM 覆盖了关键信息，agent 就能继续干活。区别在于摘要的精细度：Aider 是一段叙述，OpenClaw 加了 chunk 切分和内存冲洗，Pi 针对 split turn 做了双段落合并。

结构化派（Claude Code、OpenCode）用固定字段模板约束 LLM，确保不遗漏关键维度。区别在于 Claude Code 在摘要之前多了四层不调 LLM 的清理，OpenCode 是直接上摘要。

Cline 选了完全不同的方向——把压缩时机从"满了再说"挪到"提前算好"，用时间换体验。

从这六个产品的设计来看，一个明显的趋势是：压缩正在从被动补救转向主动预处理。但这不意味着"预处理就是更好的"——每种方案都在自己的约束下做了取舍。

---

_调研方法说明：本文分析的六个产品均基于公开的源码、官方文档和 GitHub issue 讨论。参数和配置项以 2026 年 7 月初的状态为准。_
