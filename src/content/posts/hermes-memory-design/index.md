---
author: RainFD
title: "拆解 Hermes 的记忆系统"
slug: hermes-memory-design
pubDatetime: 2026-06-23T16:00:00+08:00
draft: false
tags:
  - Hermes Agent
  - OpenClaw
  - Memory
  - AI Agent
  - Context
description: "跟着一次完整的 Hermes 会话，拆解记忆系统的三层架构、冻结快照机制、全量注入的设计取舍，以及与 OpenClaw 的差异。"
---

这篇文章从一次完整的 Hermes 会话出发，看记忆系统在每个阶段做了什么。同时拿 OpenClaw 做对比——两个项目面对相似的问题，选择了不同的方案。

## 一、跟着一次会话走一遍

假设你刚打开 Hermes，准备让它修一个 bug。以下是接下来发生的事。

### 启动：读盘、冻结

Hermes 做的第一件事，是从磁盘读两个纯文本文件：

```
~/.hermes/memories/MEMORY.md   —— agent 对自己所处环境的认知
~/.hermes/memories/USER.md     —— agent 对你的理解
```

这两个文件存的是同一个场景的两个面。比如关于代码风格：MEMORY.md 里写的是"项目用 pytest，别用 unittest"，这是项目本身的约定；USER.md 里写的是"你偏好 pytest 的简洁语法，讨厌样板代码"，这是你的个人倾向。两条信息来自同一件事，但一个属于环境，一个属于你。

读完之后两步，然后锁死：去重、冻结快照。这次会话期间，这个记忆快照保持不变。

冻结快照是整个设计最关键的决策。为什么？因为 prompt cache。主流 LLM API 支持 prefix cache——连续请求的前缀一致，就能复用 KV cache，大幅降低输入成本。记忆天然是"每轮都注入 system prompt"的东西——如果 agent 更新了记忆就重建 prompt，缓存直接报废。

冻结快照的代价是"本会话看不到新记的内容"，换来的是缓存保护的确定性——不管 agent 中途写不写记忆，前缀永远一致。

### 记忆存储

agent 记东西分两条线：

**memory 落盘。** 你说"别用 sed，用 patch 工具"。Agent 把这条信息写入 `~/.hermes/memories/MEMORY.md`——加锁 → 去重 → 检查容量 → 写盘。文件更新了，但 system prompt 没变——快照锁死了。下次启动才生效。

**session 落库。** 同一时间，你们的完整对话原文被写入 `~/.hermes/state.db`，这是一个 SQLite 数据库。不只是"用 patch 不用 sed"这条精简信息，而是你原话是怎么说的、agent 怎么回的——全部存下来。这些原文不占 system prompt 空间，只在需要检索时才被读到。

### 记忆检索: session_search

当对话中触发了跟历史相关的话题时——比如你们讨论到一个之前聊过的技术方案——agent 会自动在 SQLite 里全文检索历史会话。检索返回原始消息片段，不经过 LLM 总结，不截断。

session_search 和内置记忆的分工：记忆是 agent 主动提炼过的认知（精确、少而精），session_search 是所有对话的原始索引（全面、按需检索）。

### 记忆推理：外部 provider

到这一步，内置的两层（记忆 + 会话检索）已经覆盖了大部分场景。但有些信息需要更深层的推理——比如从你多次纠正 agent 的行为中，提炼出你的底层偏好。

这时候轮到外部 provider。外部 provider 是独立的记忆服务，部署在 Hermes 之外，通过 API 接入。它们能做的事比 FTS5 关键词检索更深：匹配"有没有提到 patch 这个词"不够，还需要理解"用户每次纠正工具选择时，背后的思维模式是什么"。

以 Honcho 为例：它是一个开源记忆服务（Apache 2.0），核心能力是"辩证推理"——用多轮 LLM 推理分析对话，提炼用户画像。会话结束后，Honcho 在后台运行：

> "用户两次纠正了工具选择，都跟偏好底层控制有关。推断：重视可预测性和可控性。"

下次启动时，提炼后的结论以 `<memory-context>` 标签追加在 system prompt 末尾，跟内置记忆共存。

除了 Honcho，还有 Mem0（轻量向量检索，API 调用延迟低）、Zep（知识图谱，适合结构化事实），以及 Holographic、RetainDB 等。注意Hermes 一次只能接入一个外部 provider。

### 三层总结

这就是 Hermes 记忆的三层架构：**内置记忆**（全量注入，快而可靠）→ **会话检索**（全文索引，按需查）→ **外部 provider**（语义推理，后台运行）。三层各干各的。

## 二、跟 OpenClaw 对比

Hermes 和 OpenClaw 的记忆系统实际上共享同一个核心设计：**MEMORY.md 全量注入 prompt，容量到了上限触发整理。** 差异不在架构思路上，在参数选择上。

### OpenClaw 怎么做的

- `MEMORY.md` 存长期记忆，每次私聊启动时全量注入 prompt。上限 20,000 字符，超了截断注入而不是拒绝写入。
- `memory/YYYY-MM-DD.md` 存每日笔记，今天和昨天的自动注入，更早的不注入，靠 builtin engine 检索。
- 三个 memory engine 可选：Builtin（FTS5+向量+混合检索，索引所有 markdown 文件）、QMD（加重排序）、Honcho（用户建模）。可以同时开多个。
- Session 存储在 per-agent SQLite 里。

### 核心差异

两个系统本质一回事，区别在三点：

**容量上限和触发方式。** OpenClaw：20,000 字符，软截断——超了继续写，但注入时只给模型看前 20,000。Hermes：2,200 + 1,375 字符，硬拒绝——超了直接报错，agent 必须当场清理。前者门槛高但可以拖着不整理，后者门槛低但纪律严。

**双文件分离。** OpenClaw 只有 MEMORY.md，环境约定和个人偏好混在一起。Hermes 拆成 MEMORY.md（环境）和 USER.md（你），各有独立容量上限。拆开之后 agent 不用纠结信息往哪放。

**冻结快照。** OpenClaw 如果在会话中改了 MEMORY.md，下轮 prompt 就变了，缓存报废。Hermes 在启动时拍快照锁死，整场会话 prompt 完全一致，缓存稳定命中。

## 三、整体效果与局限

### 效果

用数字说话。以 GPT-5 为例：OpenRouter 上输入价格 $1.25/1M token。两者都是每轮全量注入记忆。Hermes 的记忆压在 1,000 token 以内，每轮 $0.00125。OpenClaw 的上限是 20,000 字符（约 5,000 token），塞满的话每轮 $0.00625，是 Hermes 的 5 倍。

更大的差异在缓存。冻结快照保护了 system prompt 前缀的稳定性——即使 agent 在会话中途写了 memory，prompt 也不变，缓存不废。当然，大多数会话 agent 并不会频繁改记忆，这个机制的实际效果取决于写入频率。

### 局限

**容量限制太紧。** 2,200 + 1,375 字符。我自己的两个文件分别是 MEMORY.md 用了 96% 的空间、USER.md 用了 86%——这是当前我的 Hermes 实例的真实用量，这个限制很快就满了。agent 被拒后会尝试清理，它在这件事上做得很一般——合并哪些、删哪些，判断经常不太准。人的记忆会自然衰减，机器的不会。

**没有自动蒸馏。** 全量注入意味着 agent 看到所有记忆，不管有没有价值。人类会自动遗忘琐事、沉淀规律。Hermes 现在靠 agent 手动做这件事——调用 memory 工具的 replace 操作合并相似条目、remove 操作删除过时内容。判断失误就可能删错。

**外部 provider 有延迟。** Honcho 在会话结束后才开始推理。比如你早上开了 Hermes 聊了两句就关了——对话太短，Honcho 来不及触发。下午开了一小时的长对话——这次 Honcho 有机会跑了，但要等到明天启动时才能看到提炼的结果。短对话几乎无效，需要几次完整长会话才能发挥作用。

**三个系统三个入口。** session_search 查对话，memory 注入 prompt，外部 provider 各有 API。比如你说了句"我下周要做 PostgreSQL 迁移"——agent 需要自己跑 session_search 查历史讨论，再调 Honcho API 看有没有提炼出的偏好。两边的结果归拢起来倒也能用，只是没有统一的查询入口——agent 得知道这两个工具都存在，并且记住每种信息该去哪里找。内置记忆倒是不用操心，它就在 prompt 里。

## 四、还没解决的问题

**智能蒸馏。** 理想状态是按频率、关联度自动计算每条记忆的留存价值，低价值的自然淘汰。但需要额外推理开销，也可能删错。

**记忆衰减。** 机器记忆是永久的——一年前说过的事跟昨天说的权重一样。时间衰减机制能让旧记忆逐渐"褪色"，更贴近人的认知习惯。

**多模态记忆。** 现在只能存文本。图片、音频、PDF 的内容进不了 MEMORY.md。

**跨 provider 统一检索。** 三个系统没有统一入口。这个问题不解决，记忆系统就永远是拼在一起的三个工具，而不是一个完整的记忆体。
