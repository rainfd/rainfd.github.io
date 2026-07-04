---
author: RainFD
title: "Dissecting Hermes' Memory System"
locale: en
translationKey: hermes-memory-design
pubDatetime: 2026-06-23T16:00:00+08:00
draft: false
tags:
  - Hermes Agent
  - OpenClaw
  - Memory
  - AI Agent
  - Context
description: "Walking through a complete Hermes session to dissect its three-layer memory architecture, the frozen snapshot mechanism, the design trade-offs of full-context injection, and how it differs from OpenClaw."
---

This article follows a complete Hermes session to see what the memory system does at each stage, and compares it with OpenClaw — two projects facing similar problems but choosing different approaches.

## 1. Following a Session Step by Step

Let's say you've just opened Hermes and want it to fix a bug. Here's what happens next.

### Startup: Read, Freeze

The first thing Hermes does is read two plain text files from disk:

```
~/.hermes/memories/MEMORY.md   — the agent's understanding of its environment
~/.hermes/memories/USER.md     — the agent's understanding of you
```

These two files capture two sides of the same picture. Take code style, for example: MEMORY.md says "the project uses pytest, not unittest" — that's a project convention. USER.md says "you prefer pytest's concise syntax and hate boilerplate" — that's your personal preference. Both pieces of information come from the same event, but one belongs to the environment, the other to you.

After reading, two things happen, then it locks: deduplication and a frozen snapshot. For the duration of this session, this memory snapshot stays unchanged.

The frozen snapshot is the most critical design decision. Why? Because of prompt caching. Mainstream LLM APIs support prefix caching — if the prefix of consecutive requests remains identical, the KV cache can be reused, dramatically reducing input costs. Memory is inherently the kind of thing injected into every system prompt — if the agent updates memory and rebuilds the prompt, the cache goes out the window.

The cost of a frozen snapshot is that "this session doesn't see newly written memories." The benefit is guaranteed cache stability — the prefix is always identical regardless of whether the agent writes memory mid-session.

### Memory Storage

The agent stores things along two tracks:

**Memory to disk.** You say "don't use sed, use the patch tool." The agent writes this to `~/.hermes/memories/MEMORY.md` — lock → deduplicate → check capacity → write. The file updates, but the system prompt doesn't change — the snapshot is locked. It takes effect next session.

**Session to database.** At the same time, your entire conversation transcript is written to `~/.hermes/state.db`, a SQLite database. Not just the distilled "use patch, not sed" — it stores your exact words and the agent's exact responses. These transcripts don't take up system prompt space; they're only read when retrieval is needed.

### Memory Retrieval: session_search

When a conversation touches on a historically relevant topic — say you're discussing a technical approach you've talked about before — the agent automatically runs a full-text search across the SQLite history. The search returns raw message fragments — no LLM summarization, no truncation.

The division of labor: memory is what the agent has actively distilled (precise, sparse, high-signal). session_search is a raw index of all conversations (comprehensive, on-demand).

### Memory Reasoning: External Providers

At this point, the built-in two layers (memory + session retrieval) cover most scenarios. But some information requires deeper reasoning — for example, distilling your underlying preferences from repeated corrections you've made to the agent's behavior.

This is where external providers come in. External providers are independent memory services deployed outside Hermes, connected via API. They can do things that go deeper than FTS5 keyword matching: matching "did they mention the word patch" isn't enough — you need to understand "what's the thinking pattern behind the user's repeated corrections on tool choice."

Take Honcho as an example: it's an open-source memory service (Apache 2.0) whose core capability is "dialectical reasoning" — using multi-turn LLM inference to analyze conversations and distill user profiles. After a session ends, Honcho runs in the background:

> "The user corrected tool choice twice, both times related to a preference for low-level control. Inference: values predictability and controllability."

At the next startup, the distilled conclusions are appended to the system prompt inside `<memory-context>` tags, coexisting with built-in memory.

Beyond Honcho, there's Mem0 (lightweight vector retrieval, low API latency), Zep (knowledge graph, suited for structured facts), as well as Holographic, RetainDB, and others. Note that Hermes can only connect to one external provider at a time.

### The Three Layers, Summarized

This is Hermes' three-layer memory architecture: **built-in memory** (full-context injection, fast and reliable) → **session retrieval** (full-text index, on-demand) → **external provider** (semantic reasoning, background). Each layer does its own thing.

## 2. Comparison with OpenClaw

Hermes and OpenClaw actually share the same core design: **MEMORY.md injected fully into the prompt, triggering compaction when capacity is reached.** The differences aren't in architectural philosophy — they're in parameter choices.

### How OpenClaw Does It

- `MEMORY.md` stores long-term memory, injected fully into every private chat prompt. Cap: 20,000 characters. If exceeded, injection is truncated rather than refused.
- `memory/YYYY-MM-DD.md` stores daily notes. Today's and yesterday's are auto-injected; older ones rely on the builtin engine for retrieval.
- Three memory engines available: Builtin (FTS5 + vector + hybrid retrieval, indexing all markdown files), QMD (adds reranking), Honcho (user modeling). Multiple can run simultaneously.
- Sessions stored in per-agent SQLite.

### Key Differences

The two systems are fundamentally the same thing. The differences boil down to three points:

**Capacity limits and trigger behavior.** OpenClaw: 20,000 characters, soft truncation — writes still go through when over capacity, but injection only shows the model the first 20,000. Hermes: 2,200 + 1,375 characters, hard rejection — exceeds the limit and it errors out; the agent must compact immediately. The former has a higher bar but lets you delay cleanup; the latter has a lower bar but strict discipline.

**Dual-file separation.** OpenClaw only has MEMORY.md, mixing environment conventions and personal preferences. Hermes splits them into MEMORY.md (environment) and USER.md (you), each with independent capacity limits. Splitting them means the agent never has to decide where to put information.

**Frozen snapshot.** If OpenClaw modifies MEMORY.md during a session, the next prompt changes and the cache is invalidated. Hermes takes a snapshot at startup and locks it — the entire session's prompts are completely identical, guaranteeing stable cache hits.

## 3. Results and Limitations

### Results

Let's talk numbers. Using GPT-5 as an example: on OpenRouter, input pricing is $1.25/1M tokens. Both systems inject memory fully every turn. Hermes keeps memory under 1,000 tokens, costing $0.00125 per turn. OpenClaw's cap is 20,000 characters (~5,000 tokens) — maxed out, that's $0.00625 per turn, 5× Hermes.

The bigger difference is in caching. The frozen snapshot protects system prompt prefix stability — even if the agent writes memory mid-session, the prompt doesn't change, and the cache isn't invalidated. Of course, in most sessions the agent doesn't frequently modify memory, so the real impact of this mechanism depends on write frequency.

### Limitations

**Capacity is too tight.** 2,200 + 1,375 characters. My own two files are at 96% for MEMORY.md and 86% for USER.md — these are my Hermes instance's actual current usage levels. This limit fills up fast. When the agent gets rejected, it tries to compact, and it does a mediocre job — deciding what to merge and what to delete, the judgment is often off. Human memory naturally decays; machine memory doesn't.

**No automatic distillation.** Full-context injection means the agent sees all memories, regardless of value. Humans automatically forget trivia and distill patterns. Hermes currently relies on the agent to do this manually — using the memory tool's replace operation to merge similar entries and remove to delete stale content. Wrong judgments mean wrong deletions.

**External provider latency.** Honcho only starts reasoning after a session ends. Say you open Hermes in the morning, chat briefly, and close it — the conversation is too short for Honcho to trigger. In the afternoon you have an hour-long conversation — this time Honcho gets to run, but you won't see the distilled results until tomorrow's startup. Short conversations are nearly useless; it takes several full-length sessions to make a difference.

**Three systems, three entry points.** session_search for conversations, memory injection for prompts, external providers each with their own API. Say you mention "I'm doing a PostgreSQL migration next week" — the agent needs to run session_search for historical discussions, then call the Honcho API for any distilled preferences. The results from both sides can be stitched together and work, but there's no unified query interface — the agent has to know both tools exist and remember which type of information lives where. Built-in memory is the exception — it's already in the prompt.

## 4. Unsolved Problems

**Intelligent distillation.** The ideal approach would auto-calculate each memory's retention value based on frequency and relevance, with low-value entries naturally fading out. But this requires additional inference overhead and could still delete the wrong things.

**Memory decay.** Machine memory is permanent — something you said a year ago carries the same weight as something you said yesterday. A time-decay mechanism could let old memories gradually "fade," better matching human cognitive habits.

**Multimodal memory.** Currently only text can be stored. Images, audio, and PDF content can't make it into MEMORY.md.

**Cross-provider unified retrieval.** Three systems, no unified entry point. Until this is solved, the memory system will always be three tools glued together rather than a cohesive memory entity.
