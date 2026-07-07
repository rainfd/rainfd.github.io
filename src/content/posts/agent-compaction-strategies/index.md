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
description: "调研 Aider、Claude Code、Codex CLI、Cline、OpenCode、OpenClaw 和 Pi 七个编程 Agent 的上下文压缩策略，用同一个模拟对话展示各自怎么压缩。"
---

AI 编程 Agent 的上下文管理有一个硬问题：对话总会长到超出模型的上下文窗口。删什么、留什么、怎么压缩——这几个决策直接决定 Agent 还能不能继续工作。

有多重要？2026 年的一篇论文 _Plans Don't Persist_ 给了一个量化答案。研究者让 Agent 执行一个多步骤任务，Agent 会在上下文中记录自己的计划（"先去厨房，再拿杯子……"）。然后他们做了件简单的事：把计划信息从上下文中删掉。结果成功率直接跌了 34.7 个百分点。计划信息占不到多少 token，但删掉它，Agent 就不知道该干嘛了。

这说明上下文压缩不是机械的"删旧的留新的"——它是一个信息取舍问题，取舍错了就会崩。Agent 的上下文管理，是整个系统的承重墙。

目前主流的编程 Agent 各自怎么解决这个问题？这篇文章覆盖七个有公开算法或文档的产品——Aider、Claude Code、Codex CLI、Cline、OpenCode、OpenClaw 和 Pi。用一个模拟的编程会话，看同一个对话在每个产品里被压缩成什么样。

## 模拟对话

场景是一个典型的编程会话。上下文窗口假设为 8000 tokens。

对话从创建 FastAPI 用户管理模块开始，经过加分页、加搜索三个需求迭代，最终有 10 轮 Assistant 回复，包含大量 tool call 和 tool output。

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

总计约 8000 tokens，接近窗口上限。下面看七个产品各自怎么处理这个局面。

## 摘要派：用 LLM 生成摘要替代旧消息

这一派的思路最直观：把旧消息喂给 LLM，让它生成一个摘要，然后用摘要替代原文。

### Aider：Head-Tail Split + 递归摘要

Aider 的算法在所有产品里最透明。当上下文总 token 数超过预设上限时，压缩逻辑启动：

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

如果摘要 + tail 仍然超出窗口上限，对摘要再次压缩——最多递归 3 层。

摘要 prompt 的设计很关键——要求以**第一人称**总结：保留函数名、库名、包名。

压缩后的上下文变成：

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

整个创建过程被压缩成一段摘要。base.py 和 items.py 的完整代码丢了，只保留了"参照了 items 模块模式"这个结论。

### Claude Code：5 阶段管线 + Forked Subagent

Claude Code 公开文档的描述很简单——"先清 tool outputs 再总结"。但泄露的源码揭示了一个远比这复杂的 5 阶段上下文管理管线。

每轮 API 调用前，上下文按顺序经历五个阶段的精炼：

```
原始上下文（工具结果可能很大）：
  ┌────────┬──────────────────┬──────────────┬──────────────┬────────────┬──────────┐
  │ 系统提示 │ 历史消息 + 旧结果   │ 超大工具结果A  │ 超大工具结果B  │ 最近4条消息 │ 用户新消息 │
  └────────┴──────────────────┴──────────────┴──────────────┴────────────┴──────────┘
                                           │
                        Stage 1: Tool Result Budgeting          │
                        超限结果替换为 2KB 预览                   │
                                           ▼
  ┌────────┬──────────────────┬───────────┬───────────┬────────────┬──────────┐
  │ 系统提示 │ 历史消息 + 旧结果   │  [预览A]   │  [预览B]   │ 最近4条消息 │ 用户新消息 │
  └────────┴──────────────────┴───────────┴───────────┴────────────┴──────────┘
                                           │
                        Stage 2: History Snipping               │
                        移除最早的消息组                           │
                                           ▼
  ┌────────┬───────────┬───────────┬────────────┬──────────┐
  │ 系统提示 │  [预览A]   │  [预览B]   │ 最近4条消息 │ 用户新消息 │
  └────────┴───────────┴───────────┴────────────┴──────────┘
                                           │
                        Stage 3: Microcompaction                │
                        清除旧的工具结果                           │
                        (热缓存: API 层删 + 保留 cache key)       │
                        (冷缓存: 直接清内容)                      │
                                           ▼
  ┌────────┬────────────┬──────────┐
  │ 系统提示 │ 最近4条消息  │ 用户新消息 │
  └────────┴────────────┴──────────┘
                                           │
                        Stage 4: Context Collapse                │
                        细粒度上下文归档                           │
                                           │
                             距上限仅剩 13K tokens？
                              ╱                  ╲
                            是                    否
                            │                      │
                            ▼                      │
                        Stage 5: Autocompact        │
                        历史消息 → 9 段结构化摘要      │
                        派生子 agent 独立完成          │
                        缓存复用，成本 ~2%             │
                            │                      │
                            ▼                      │
  ┌────────┬──────────────┬──────────┐             │
  │ 系统提示 │ 9 段结构化摘要  │ 用户新消息 │◀────────────┘
  └────────┴──────────────┴──────────┘
```

完整压缩的实现方式很特别——不是从主线程调用，而是**派生子 agent（forked subagent）**。这个子 agent 复用父 agent 的 prompt cache，压缩的 token 成本仅为独立调用的约 2%。

压缩 prompt 有严格的 9 段结构：

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

响应中有 `<analysis>` 和 `<summary>` 两个 XML 块。`<analysis>` 是 Chain-of-Thought 草稿区，LLM 用来推理但不注入上下文——压缩完成后被剥离，只保留 `<summary>`。

还有一个基于生产遥测的熔断器机制。2026 年 3 月，工程师发现每天有 25 万次 API 调用浪费在无望的压缩重试上——1279 个 session 连续失败 50 次以上。于是加了限制：连续 3 次失败后停止自动压缩。

当自动压缩失败且 API 返回 413 错误时，触发一次性反应式压缩作为最后手段，带单发守卫防死循环。压缩后还有恢复流程：最多恢复 5 个最近文件（总计 50K tokens，单个不超过 5K tokens）、刷新工具模式、恢复计划和技能。

用模拟对话展示压缩后的结果：

```
[SYSTEM]  你是一个编程助手。项目是 FastAPI + SQLAlchemy。

[SUMMARY]
  ## Primary Request and Intent
  为 FastAPI 项目添加用户管理 CRUD 模块，后追加 offset/limit 分页和用户名模糊搜索。

  ## Key Technical Concepts
  FastAPI, SQLAlchemy, APIRouter, UserService pattern, offset/limit pagination

  ## Files and Code Sections
  src/models/user.py: User 模型继承 Base（id, username, email, hashed_password, is_active）
  src/routers/users.py: prefix="/users"，GET/POST/DELETE，已加分页参数
  src/services/user_service.py: get_all(offset,limit), create, delete, search_by_username

  ## All User Messages
  1. 帮我给项目加用户管理模块，要有创建、查询、删除
  2. 给列表接口加分页，offset/limit，默认每页 20 条
  3. 加按用户名模糊搜索功能

  ## Current Work
  刚刚读取了 user_service.py，正准备添加搜索逻辑。

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] 当前 service 代码

[ASSISTANT #10] 添加搜索逻辑。
```

对比公开文档，泄露源码揭示的关键差异：压缩不只是"摘要"，是 5 阶段管线；压缩请求走 forked subagent 共享缓存而不是直接调用；有基于遥测的熔断器；有 9 段固定格式的 prompt 而非自由摘要；压缩后会自动恢复最近的文件内容。

### OpenClaw：多阶段分块 + 内存冲洗

OpenClaw 的压缩有两条独特的设计路径，是这一派里工程最完善的。

**第一条：多阶段分块。** 当历史极长时，一次全量摘要可能超出模型输入限制。OpenClaw 把历史按上下文窗口的 40% 切成多段，每段独立摘要，最后合并成一个总摘要。不是一次性压缩所有旧消息，而是流水线式的分治：

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

**第二条：压缩前内存冲洗。** 这是其他产品都没有的机制——在 compaction 之前，系统自动提醒 Agent 把关键信息写入 MEMORY.md。如果某个变量值、某段错误日志、某个临时决策对后续任务很重要，它们会先被保存到持久记忆中，不会随压缩丢失。

触发条件也远多于其他产品——不是单一阈值，而是四种独立路径：模型返回溢出错误时触发、token 接近预留阈值时触发、JSONL 文件过大时触发、工具循环中压力过高时触发。四种路径覆盖了从被动响应到主动预检的不同场景。

### Pi：LLM 摘要 + Split Turn 处理

Pi 的压缩策略本身不复杂——用 LLM 生成结构化摘要，和 Aider 同类。但它有两个工程细节值得关注。

**Split turn 处理。** 正常压缩在 turn 边界切分（一个 turn = 用户消息 + 所有后续 assistant/tool 回复）。但当单个 turn 本身就很长——比如用户给了一个复杂需求，agent 经过几十次 tool call 才完成——这个 turn 的早期部分需要被压缩，后半部分需要保留。此时压缩切点落在 turn 中间，形成"split turn"：

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

Pi 对这个问题的处理是生成两份摘要然后合并：一份是历史上下文摘要，一份是 turn 前缀摘要。两份独立生成再合成一个压缩条目。其他产品遇到超长 turn 时要么整体保留（浪费 token budget）要么整体丢弃（丢信息），Pi 是唯一做了精细拆分的。

**文件操作追踪。** 每次压缩时，Pi 提取被压缩消息中涉及的读写文件并记录在压缩条目中。下次压缩时能从上次的记录继承文件列表——即使原始消息已被摘要替代，不会丢失"操作过哪些文件"这条线索。

触发条件是上下文 token 数超过窗口减去预留空间（默认预留 16384 tokens），保留最近 20000 tokens。支持 `/compact [instructions]` 手动触发。

压缩后的样子：

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

Pi 的压缩风格介于 Aider 和 OpenCode 之间——比 Aider 的纯叙述更结构化，但不如 OpenCode 的 7 字段模板那么严格。其真正的工程价值在 split turn 处理和文件操作累积追踪这类边界 case 上。

## 结构化派：用固定模板组织压缩结果

这一派不满足于"一段话描述历史"，而是把压缩结果组织成固定格式，让接手的新上下文能更快定位关键信息。

### OpenCode：7 字段滚动摘要

OpenCode 的摘要模板包含七个固定字段：

```
## Goal           - 单句任务总结
## Constraints    - 用户约束和偏好
## Progress       - Done / In Progress / Blocked
## Key Decisions  - 关键决策及其原因
## Next Steps     - 有序的下一步
## Critical Context - 重要技术事实和已知问题
## Relevant Files - 相关文件路径
```

每次压缩时，LLM 被要求按这个模板输出。如果有前一次摘要，会基于旧摘要更新而非从头生成。

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

OpenCode 的另一个设计要点是完整历史**持久化在数据库**中，压缩只影响活跃模型看到的表示。理论上可以回溯丢失的信息，但实际检索能力有限。社区反馈（Issue #4659）直言这种"截断+摘要"模式会丢失重要上下文，"AI 生成的摘要是有损且泛化的"。

### Codex CLI：上下文检查点交接摘要

Codex CLI 把压缩表述为**交接**——提示词直接写"你正在执行上下文检查点压缩，创建一份交接摘要给接手任务的另一个 LLM"。和其他产品不同，Codex CLI 提供了四种压缩路径，各走不同的取舍：

1. **本地压缩** — 用当前模型生成摘要，保留最近用户消息（最多 20k tokens）。不产生额外 API 开销，但模型自己压缩自己的上下文，质量取决于当前模型能力。
2. **远程 V1** — 调用 OpenAI 的专用压缩 API，服务端处理。优点是压缩质量通常更好（专用模型），缺点是额外调用成本和延迟。
3. **远程 V2** — 用 Responses API 流式处理，输入中插入压缩触发标记，模型返回压缩结果。预算更大（64k tokens），适合更长的保留窗口。
4. **Token-budget** — 不生成摘要，直接清空并开启新上下文窗口。放弃所有历史，最直接也最暴力——本质上等于重新开始。

四种路径从本地到远程、从精炼到放弃，形成了"省钱 → 高质量 → 大预算 → 不要历史"的渐变。选择哪种取决于任务类型：简单任务可能 token-budget 就够了，复杂任务需要远程 V1/V2 的高质量摘要。Codex CLI 对消息角色的保留规则也比较明确：developer 消息丢弃，user 和 assistant 消息保留，compaction 条目保留，其他全丢。

## 工程优化派：在触发时机上做创新

前面几个产品的共同假设是"压缩 = LLM 调用生成摘要"。Cline 打破了此前提——问题不在怎么压缩，而在什么时候压缩。

### Cline：Double-buffer 预计算

Cline 的核心观察很简单：传统做法在上下文快满（75%）时才做压缩，此时模型注意力已经退化，摘要质量差，而且用户要干等 LLM 生成摘要。

```
传统做法：
  60% ────正常使用────▶ 75% ──[停！等 LLM 压缩...]──▶ 继续
                             用户卡住

Cline：
  60% ──[后台静默预计算摘要]──▶ 85% ──[瞬间替换]──▶ 继续
       用户无感知                       不等待
```

问题不在怎么压缩，在什么时候压缩。把 LLM 调用从"触发时"前移到"触发前"，用户感受到的就是瞬间完成。

压缩本身有两种模式：

**Basic**：标准 LLM 摘要，把旧消息喂给模型生成总结。

**Agentic**（正在成为默认）：用另一个 AI Agent 来处理压缩任务。它会分析哪些上下文是关键依赖、哪些可以安全丢弃，做出比简单摘要更智能的取舍。比如保留那段报错信息，因为它解释了后续为什么选了某个方案；丢弃那三十行没结果的 grep 输出。

在此基础上还加了一套 Budget Projection 系统：不是简单地"到了 85% 就换"，而是在 60% checkpoint 时就预测压缩后能释放多少 token、摘要质量会降到什么程度。如果预测质量太差，提前降低压缩的激进程度——本质上是一个压缩预算合同。

## 横向对比

### 触发机制

| 产品        | 触发方式                                           | 阈值                                    |
| ----------- | -------------------------------------------------- | --------------------------------------- |
| Aider       | token 总数超 max_tokens                            | 隐式                                    |
| Claude Code | 5 阶段管线，距离限制 13K tokens 时触发 autocompact | 13K tokens                              |
| OpenClaw    | 溢出恢复 + 阈值 + 文件大小 + 中途预检              | 默认 reservation 20k tokens             |
| OpenCode    | 请求 token > context - buffer                      | 默认 buffer 20k tokens                  |
| Codex CLI   | token 超限 + CompHash 变化 + 模型切换              | 可配置                                  |
| Cline       | 60% checkpoint / 85% swap                          | 可配置 per-mode                         |
| Pi          | context 超阈值时 LLM 摘要；支持 `/compact` 手动    | reserve 16384 tokens，keep 20000 tokens |

### 压缩方式

| 产品        | 压缩手段                           |     需要 LLM 调用？     |
| ----------- | ---------------------------------- | :---------------------: |
| Aider       | 递归摘要                           |           是            |
| Claude Code | 5 阶段管线 + Forked Subagent 摘要  | 是（缓存复用 ~2% 成本） |
| OpenClaw    | 多阶段分块摘要 + 内存冲洗          |           是            |
| OpenCode    | 7 字段结构化摘要                   |           是            |
| Codex CLI   | 交接摘要 / 远程 API / token-budget |         视路径          |
| Cline       | 后台预计算摘要                     |           是            |
| Pi          | LLM 结构化摘要 + Split Turn 处理   |           是            |

### 设计取舍

这七个产品的分歧集中在一个问题上：**压缩时丢不丢原始信息？**

摘要派（Aider、Claude Code、OpenClaw、Pi）选择丢掉原始消息，信息损失不可逆。他们把信任放在摘要质量上——只要 LLM 覆盖了关键信息，agent 就能继续工作。差异在于摘要的精细度：Aider 是一段叙述，Claude Code 是 9 段结构化输出，OpenClaw 加了 chunk 切分和内存冲洗，Pi 针对 split turn 做了双段落合并。

结构化派（OpenCode、Codex CLI）试图用固定模板减少损失：关键维度不被遗漏。但本质上还是"LLM 说是什么就是什么"，没有验证回路。

工程优化派（Cline）把焦点从"怎么压缩"移到"什么时候压缩"——通过 double-buffer 预计算绕开高负载下的质量下降。

没有哪个方案是完美的。摘要派信息损失大但实现简单；结构化派有模板约束但灵活性低；Cline 的预计算创新但依赖并发环境。选择哪种策略，取决于具体场景对信息保真度和压缩成本的权衡。

---

_调研方法说明：本文分析的七个产品均基于公开的源码、官方文档和 GitHub issue 讨论。参数和配置项以 2026 年 7 月初的状态为准。_
