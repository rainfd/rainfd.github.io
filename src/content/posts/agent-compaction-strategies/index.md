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

2026 年的一篇论文 *Plans Don't Persist* 做了个实验：简单驱逐 Agent 的计划信息，结果是 ALFWorld 成功率下降 34.7 个百分点。上下文管理不是简单的"删旧留新"，它是整个 Agent 系统的承重结构。

目前主流的编程 Agent 各自怎么解决这个问题？这篇文章调研了七个有公开算法或文档的产品——Aider、Claude Code、Codex CLI、Cline、OpenCode、OpenClaw 和 Pi。用一个模拟的编程会话做试金石，看看同一个对话在每个产品里被压缩成什么样。

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

Aider 的算法在所有产品里最透明。`ChatSummary.too_big()` 检测到超限后，`summarize_real()` 启动：

1. 从尾部向前扫描，保留后一半 max_tokens 的最近消息作为 tail
2. 剩余旧消息作为 head，送 LLM 生成摘要
3. 如果摘要 + tail 仍超出，递归压缩（最多 3 层）

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

每轮 API 调用前，会话经历五个阶段：

1. **Tool result budgeting**：每个工具结果上限 50K 字符，每消息 200K 字符。超限结果持久化到磁盘并替换为 2KB 预览包装器
2. **History snipping**：移除最早的消息组以释放 token
3. **Microcompaction**：通过 `cache_edits` API 清除旧的工具结果。热缓存时用 API 层删除（保留 prompt cache），冷缓存时直接清内容，冷却周期约 60 分钟
4. **Context collapse**：完整压缩前的细粒度上下文归档
5. **Autocompact**：距离上下文限制仅剩 13K tokens 时触发完整会话摘要

完整压缩的实现方式很特别——不是从主线程调用，而是**派生子 agent（forked subagent）**。这个子 agent 通过 `createCacheSafeParams()` 复用父 agent 的 prompt cache，压缩的 token 成本仅为独立调用的约 2%。

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

响应中有 `<analysis>` 和 `<summary>` 两个 XML 块。`<analysis>` 是 Chain-of-Thought 草稿区，LLM 用来推理但不注入上下文——压缩完成后由 `formatCompactSummary()` 剥离，只保留 `<summary>`。

还有一个基于生产遥测的熔断器机制。2026 年 3 月，工程师发现每天有 25 万次 API 调用浪费在无望的压缩重试上——1279 个 session 连续失败 50 次以上。于是加了 `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`，三次失败后停止自动压缩。

当 autocompact 失败且 API 返回 `prompt-too-long` (413) 时，触发一次性反应式压缩作为最后手段，带单发守卫防死循环。压缩后还有恢复流程：最多恢复 5 个最近文件（总计 50K tokens，单个不超过 5K tokens）、刷新工具模式、恢复计划和技能。

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

OpenClaw 的压缩系统是这一派里最完整的。它不是一次性压缩所有旧消息，而是把历史按上下文窗口的 40% 切分成 chunk，分别摘要再合并——这样处理超长历史时不会超出单个压缩请求的 token 限制。

还有一个其他产品都没有的机制：**压缩前内存冲洗**。在 compaction 之前，OpenClaw 自动提醒 Agent 把关键信息写入 MEMORY.md，防止压缩过程丢失重要上下文。这个步骤是静默的，用户无感知。

OpenClaw 的触发条件也是最丰富的：溢出恢复（错误签名匹配）、阈值维护（token 超阈值）、文件字节守卫（JSONL 文件过大）、中途预检（工具循环中检查 prompt 压力）——四种触发，远多于其他产品的单一阈值。

### Pi：LLM 摘要 + Split Turn 双段落合并

Pi 的压缩只有一个策略——LLM 结构化摘要。和 Aider、OpenClaw 同类。

但它有一个独特的设计：**split turn 拆分处理**。正常情况下压缩在 turn 边界切分（一个 turn = 用户消息 + 所有后续 assistant/tool 回复），但当单个 turn 本身就很长——比如用户给了一个复杂需求，agent 经几十次 tool call 才完成——这个 turn 会超过保留预算。此时压缩切点落在 turn 中间，形成一个"split turn"：

```
单 turn 超预算时的 split turn：

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)
```

Pi 对这个问题的处理方式是生成两份摘要然后合并：一份是历史上下文摘要（如果有前次压缩），一份是 turn 前缀摘要（split turn 的前半部分）。两份独立生成再合并成一个 `CompactionEntry`。

另一个值得注意的机制是**文件操作追踪**。每次压缩时，Pi 提取被压缩消息中涉及的读写文件，并累加到 `CompactionEntry.details` 里。下次压缩时能从上次的 details 继承文件列表，不会因为文件信息被摘要吞掉而丢失追踪。

触发阈值为 `contextTokens > contextWindow - reserveTokens`，默认 reserve 16384 tokens，保留最近 20000 tokens。支持 `/compact [instructions]` 手动触发。

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

Codex CLI 把压缩表述为**交接**——"一份给另一个 LLM 接手工作的 handoff 摘要"。本地压缩的 prompt 是这样写的：

> "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task."

Codex CLI 有四种压缩路径：

1. **本地压缩**：用当前模型生成摘要，保留最近用户消息（最多 20k tokens）
2. **远程 V1**：调用 OpenAI 的 `POST /responses/compact` API，服务端处理
3. **远程 V2**：用 Responses API 流式，输入中插入 `CompactionTrigger`，模型返回压缩结果。保留最近消息预算 64k tokens
4. **Token-budget**：跳过摘要，直接开启新上下文窗口

Codex CLI 对哪些角色消息保留也有明确规则：developer 消息丢弃，user 和 assistant 消息保留，agent message 保留，compaction 条目保留，其他全丢。

## 工程优化派：在触发时机上做创新

前面几个产品的共同假设是"压缩 = LLM 调用生成摘要"。Cline 打破了此前提——问题不在怎么压缩，而在什么时候压缩。

### Cline：Double-buffer 预计算

Cline 的核心观察是：在上下文窗口快满的 75% 阈值做压缩时，模型注意力已经退化，摘要质量差。不如提前算好。

它的 double-buffer 策略分两阶段：

1. **Checkpoint（60%）**：上下文质量仍高时，后台静默触发摘要生成
2. **Swap（85%）**：直接使用预计算的摘要替换旧消息，不需要 stop-the-world 的压缩等待

这个设计的理论基础是 *Hopping Context Windows* 算法。Cline 在此基础上还加了 Budget Projection（压缩预算预测系统）：定义正式的压缩预算合同，包含预算动作、警告级别、实时尾处理、分块分类和遥测管线。

Cline 同时支持两种压缩模式：Basic（简单摘要）和 Agentic（用 AI Agent 做更智能的上下文保留）。2026 年中，Agentic 正在被设为默认。

## 横向对比

### 触发机制

| 产品 | 触发方式 | 阈值 |
|------|---------|------|
| Aider | token 总数超 max_tokens | 隐式 |
| Claude Code | 5 阶段管线，距离限制 13K tokens 时触发 autocompact | 13K tokens |
| OpenClaw | 溢出恢复 + 阈值 + 文件大小 + 中途预检 | 默认 reservation 20k tokens |
| OpenCode | 请求 token > context - buffer | 默认 buffer 20k tokens |
| Codex CLI | token 超限 + CompHash 变化 + 模型切换 | 可配置 |
| Cline | 60% checkpoint / 85% swap | 可配置 per-mode |
| Pi | context 超阈值时 LLM 摘要；支持 `/compact` 手动 | reserve 16384 tokens，keep 20000 tokens |

### 压缩方式

| 产品 | 压缩手段 | 需要 LLM 调用？ |
|------|---------|:---:|
| Aider | 递归摘要 | 是 |
| Claude Code | 5 阶段管线 + Forked Subagent 摘要 | 是（缓存复用 ~2% 成本） |
| OpenClaw | 多阶段分块摘要 + 内存冲洗 | 是 |
| OpenCode | 7 字段结构化摘要 | 是 |
| Codex CLI | 交接摘要 / 远程 API / token-budget | 视路径 |
| Cline | 后台预计算摘要 | 是 |
| Pi | LLM 结构化摘要 + Split Turn 处理 | 是 |

### 设计取舍

这七个产品的分歧集中在一个问题上：**压缩时丢不丢原始信息？**

摘要派（Aider、Claude Code、OpenClaw、Pi）选择丢掉原始消息，信息损失不可逆。他们把信任放在摘要质量上——只要 LLM 覆盖了关键信息，agent 就能继续工作。差异在于摘要的精细度：Aider 是一段叙述，Claude Code 是 9 段结构化输出，OpenClaw 加了 chunk 切分和内存冲洗，Pi 针对 split turn 做了双段落合并。

结构化派（OpenCode、Codex CLI）试图用固定模板减少损失：关键维度不被遗漏。但本质上还是"LLM 说是什么就是什么"，没有验证回路。

工程优化派（Cline）把焦点从"怎么压缩"移到"什么时候压缩"——通过 double-buffer 预计算绕开高负载下的质量下降。

没有哪个方案是完美的。摘要派信息损失大但实现简单；结构化派有模板约束但灵活性低；Cline 的预计算创新但依赖并发环境。选择哪种策略，取决于具体场景对信息保真度和压缩成本的权衡。

---

*调研方法说明：本文分析的七个产品均基于公开的源码、官方文档和 GitHub issue 讨论。参数和配置项以 2026 年 7 月初的状态为准。*
