---
author: RainFD
title: "How Coding Agents Handle Context Compaction"
pubDatetime: 2026-07-03T16:00:00+08:00
draft: false
locale: en
tags:
  - AI Agent
  - Context
  - Compaction
description: "A survey of context compaction strategies across seven coding agents—Aider, Claude Code, Codex CLI, Cline, OpenCode, OpenClaw, and Pi—showing how each compresses the same simulated session."
translationKey: agent-compaction-strategies
---

AI coding agents have a context problem: conversations grow until they exceed the model's window. What to delete, what to keep, how to compress—these decisions decide whether the agent can keep working. Get them wrong and the agent forgets what it was doing.

A 2026 paper, *Plans Don't Persist*, found that simply evicting an agent's plan information dropped ALFWorld success rate by 34.7 percentage points. Context management isn't "drop the old stuff." It's structural.

I wanted to see how the major coding agents actually handle this. So I looked at seven with public algorithms or docs—Aider, Claude Code, Codex CLI, Cline, OpenCode, OpenClaw, and Pi—and ran the same simulated coding session through each one's compaction logic.

## The Simulated Session

A typical coding session. Context window capped at 8,000 tokens.

The conversation starts with building a FastAPI user management module, goes through adding pagination and search across three feature requests, and ends with 10 assistant turns full of tool calls and tool outputs.

```
[SYSTEM]  You are a coding assistant. The project uses FastAPI + SQLAlchemy.

[USER #1] Add a user management module—create, query, delete.

[ASSISTANT #1] Let me check the project structure first.
  → search_files(pattern="*.py")

[TOOL OUTPUT #1] src/main.py, models/base.py, routers/items.py, ...

[ASSISTANT #2] Got it. Let me read the existing model and router.
  → read_file("src/models/base.py")
  → read_file("src/routers/items.py")

[TOOL OUTPUT #2a] Base class: id, created_at, updated_at
[TOOL OUTPUT #2b] APIRouter prefix="/items", has get_all, create, delete

[ASSISTANT #3] Following the items pattern for the user module.
  → write_file("src/models/user.py")

[TOOL OUTPUT #3] File created

[ASSISTANT #4-6] Creating schema, service, router in sequence...
  → write_file("src/schemas/user.py")
  → write_file("src/services/user_service.py")
  → write_file("src/routers/users.py")

[USER #2] Add pagination to the list endpoint—offset/limit, default 20 per page.

[ASSISTANT #7]
  → read_file("src/routers/users.py")
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #7a-b] Current router and service code

[ASSISTANT #8] Adding pagination params and logic.
  → write_file updates to router and service

[USER #3] Add fuzzy search by username.

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] Current service code (~700 tokens)

[ASSISTANT #10] Adding search logic.
  → write_file("src/services/user_service.py")

[TOOL OUTPUT #10] Updated
```

Total: ~8,000 tokens, near the window limit.

## The Summarizers: LLM-Generated Summaries Replace Old Messages

The obvious approach: feed old messages to an LLM, get a summary back, replace the originals.

### Aider: Head-Tail Split + Recursive Summarization

Aider's algorithm is the most clearly documented. `ChatSummary.too_big()` detects overflow, then `summarize_real()` kicks in:

1. Scan from the tail backward, keep the last half (max_tokens) of recent messages as the tail
2. The remaining old messages become the head, sent to the LLM for summarization
3. If summary + tail still overflows, recurse (up to 3 levels deep)

The prompt design matters—it asks for a **first-person** summary, preserving function names, library names, and package names.

After compression, the context becomes:

```
[SYSTEM]  You are a coding assistant. The project uses FastAPI + SQLAlchemy.

[USER]    I spoke to you previously about a number of things.
          I asked you to add a user management module with create, query, and delete
          to a FastAPI project. You examined the project structure
          (src/models/base.py, src/routers/items.py), then followed the existing
          items module pattern to create:
          - src/models/user.py (User model, extends Base)
          - src/schemas/user.py (UserCreate, UserResponse)
          - src/services/user_service.py (UserService class)
          - src/routers/users.py (APIRouter, prefix="/users")
          Then I asked for offset/limit pagination (default 20 per page), and you
          updated the relevant methods. The router uses UserService, UserCreate,
          UserResponse; the service uses the User model and SQLAlchemy session.

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] Current service code

[ASSISTANT #10] Adding search logic.
  → write_file(...)

[TOOL OUTPUT #10] Updated
```

The entire creation process became one paragraph. The full contents of base.py and items.py are gone—only the conclusion "followed the items module pattern" remains.

### Claude Code: Layered Cleanup

Claude Code's priority is **kill tool outputs first, then summarize**. Tool outputs are the largest but least information-dense, so clearing them gives the best bang for the buck.

Round one: delete old tool outputs. Project structure listings, base.py code, items.py code, "file created" confirmations—all gone. Keep the most recent file read/write results, since later operations are more likely to reference them.

If clearing tool outputs isn't enough, round two: conversation summarization. Claude Code lets you control what survives via the "Compact Instructions" section in `CLAUDE.md`.

After compression:

```
[SYSTEM]  You are a coding assistant. The project uses FastAPI + SQLAlchemy.

[SUMMARY] Previous conversation: user requested a user management CRUD module for a
          FastAPI project. A complete user module was created following the items
          module pattern. Then offset/limit pagination was added (default 20/page).
          Most recent action: read user_service.py to prepare adding fuzzy search.

[ASSISTANT #9]
  → read_file("src/services/user_service.py")

[TOOL OUTPUT #9] Current service code

[ASSISTANT #10] Adding search logic.
  → write_file(...)

[TOOL OUTPUT #10] Updated
```

Claude Code's summary is shorter than Aider's. Tool outputs were already cleared, so the summary doesn't need to cover them. There's also a debounce guard: if a single oversized file causes immediate re-overflow after compaction, it stops auto-compacting after a few attempts and raises an error instead of looping forever.

### OpenClaw: Multi-Stage Chunking + Memory Flush

OpenClaw's compaction system is the most elaborate in this category. It doesn't summarize all old messages at once—it splits history into chunks (40% of the context window each), summarizes them separately, then merges. Processing very long histories never exceeds a single compaction request's token budget.

One mechanism nobody else has: **pre-compaction memory flush**. Before compaction triggers, OpenClaw silently reminds the agent to write critical information to MEMORY.md. The user never sees this happen.

Trigger conditions are broad too: overflow recovery (error signature matching), threshold maintenance (token count exceeded), file byte guard (JSONL file too large), and mid-flight pre-check (prompt pressure check during tool loops). Most other products use a single threshold.

## The Structuralists: Fixed Templates for Compaction Output

These products aren't satisfied with "a paragraph describing history." They organize compaction output into fixed formats so incoming context can find key information faster.

### OpenCode: Seven-Field Rolling Summary

OpenCode's summary template has seven fixed fields:

```
## Goal           - Single-sentence task summary
## Constraints    - User constraints and preferences
## Progress       - Done / In Progress / Blocked
## Key Decisions  - Key decisions and their rationale
## Next Steps     - Ordered next steps
## Critical Context - Important technical facts and known issues
## Relevant Files - Relevant file paths
```

Each compaction asks the LLM to output in this template. If a previous summary exists, it updates from that rather than generating from scratch.

The simulated session compressed:

```
## Goal           Create user management CRUD module for a FastAPI project
## Constraints    Follow items module pattern, pagination with offset/limit, default 20
## Progress       CRUD done, pagination done, search in development
## Key Decisions  Use UserService to encapsulate DB operations; pagination params at router layer
## Next Steps     1. Add search_by_username method to UserService
## Critical Context  User model: id, username, email, hashed_password, is_active
## Relevant Files  src/models/user.py, src/services/user_service.py, src/routers/users.py, src/schemas/user.py
```

OpenCode persists full history **in a database**. Compaction only affects what the active model sees. In theory you could recover lost information, but retrieval is limited in practice. Community feedback (Issue #4659) is blunt: "truncate + summarize" loses critical context. "AI-generated summaries are lossy and generic."

### Codex CLI: Context Checkpoint Handoff Summary

Codex CLI frames compaction as a **handoff**—"a summary for another LLM that will resume the task." The local compaction prompt puts it directly:

> "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task."

Codex CLI has four compaction paths:

1. **Local**: generate summary with the current model, keep recent user messages (up to 20k tokens)
2. **Remote V1**: call OpenAI's `POST /responses/compact` API, server-side processing
3. **Remote V2**: use Responses API streaming, insert a `CompactionTrigger` in the input, model returns compaction result. Recent message budget: 64k tokens
4. **Token-budget**: skip summarization entirely, open a fresh context window

Codex CLI also has explicit rules for which message roles survive: developer messages are dropped, user and assistant messages kept, agent messages kept, compaction entries kept, everything else discarded.

## The Engineers: Innovation in Timing and Compression Method

The previous five products share one assumption: "compaction = LLM call for summarization." The two in this section break it.

### Cline: Double-Buffer Precomputation

Cline's bet: when you trigger compaction at 75% context usage, model attention quality has already degraded. Summary quality suffers. Compute ahead instead.

Two phases:

1. **Checkpoint (60%)**: context quality is still high, so silently generate a summary in the background
2. **Swap (85%)**: replace old messages with the precomputed summary. No stop-the-world compaction wait

This is based on the *Hopping Context Windows* algorithm. Cline extends it with Budget Projection—a formal compaction budget contract covering budget actions, warning levels, real-time tail processing, chunk classification, and a telemetry pipeline.

Cline supports two compaction modes: Basic (simple summarization) and Agentic (AI agent-driven, smarter context retention). As of mid-2026, Agentic is being set as the default.

### Pi: Snapcompact Bitmap Frames—Compaction Without LLM Calls

Pi has more strategies than any other product—five compaction strategies, six trigger paths. The one to pay attention to is the default: **Snapcompact**.

Snapcompact doesn't summarize text. It serializes old conversation history into high-density PNG bitmap frames, rendered with pixel fonts, letting vision-capable models "read the image" directly. Everything runs locally—no LLM call, no API key.

Frame dimensions adapt to the vision model:
- Anthropic Claude: 11×16 monochrome, 1932px wide
- Google Gemini: 8×22 monochrome, 2048px wide (fixed 1,120 token/image budget)
- OpenAI: 8×22 monochrome, 1,568px wide (area-based billing)

In a 200k-token evaluation, Snapcompact's bitmap frames **outperformed raw text** on QA recall while using fewer billed tokens—because vision tokens are charged differently from text tokens.

Pi's other four strategies:
- **context-full**: traditional LLM summarization
- **handoff**: generate a handoff document and create a new session
- **shake**: surgically remove heavyweight content (tool results)
- **off**: disable automatic compaction

Pi also has a full Hook extension system (`session_before_compact`, `session.compacting`, `session_compact`). The community has built plugins on top: pi-smart-compact (relevance filtering), pi-live-compaction (in-flight compaction management), pi-scope (AST skeleton injection, saving 85-96% tokens), and more.

## Side-by-Side Comparison

### Trigger Mechanisms

| Product | Trigger | Threshold |
|---------|---------|-----------|
| Aider | Token count exceeds max_tokens | Implicit |
| Claude Code | Near context limit | Undisclosed |
| OpenClaw | Overflow recovery + threshold + file size + mid-flight pre-check | Default 20k token reservation |
| OpenCode | Request tokens > context - buffer | Default 20k token buffer |
| Codex CLI | Token overflow + CompHash change + model switch | Configurable |
| Cline | 60% checkpoint / 85% swap | Configurable per-mode |
| Pi | Manual + overflow + incomplete output + threshold + mid-flight + idle | Default 85% window |

### Compaction Method

| Product | Method | Requires LLM Call? |
|---------|--------|:---:|
| Aider | Recursive summarization | Yes |
| Claude Code | Layered cleanup + summarization | Yes |
| OpenClaw | Multi-stage chunked summarization + memory flush | Yes |
| OpenCode | 7-field structured summary | Yes |
| Codex CLI | Handoff summary / remote API / token-budget | Depends on path |
| Cline | Background precomputed summary | Yes |
| Pi | Snapcompact bitmap frames (default) | **No** |

### Design Trade-offs

These seven products split on one question: **do you discard original information during compaction?**

Summarizers (Aider, Claude Code, OpenClaw) throw away original messages. The loss is irreversible. They trust the summary to cover what matters, and most of the time that works.

Structuralists (OpenCode, Codex CLI) try to limit the damage with templates, making sure key dimensions don't get dropped. But it's still an LLM deciding what to keep—there's no verification.

The Engineers (Cline, Pi) go further. Cline moves the question from "how to compress" to "when to compress," precomputing summaries before quality drops. Pi's Snapcompact is the biggest departure—bitmap frames keep the full information density of the original text, and vision models read them directly instead of relying on another LLM to summarize.

I don't think there's a right answer here. Summarization is simple and usually good enough. Templates give you consistency at the cost of flexibility. Bitmap frames are clever but only work if your model can see. Pick based on how much information you're willing to lose for the cost you're willing to pay.

---

*Methodology note: all seven products analyzed are based on public source code, official documentation, and GitHub issue discussions. Parameters and configuration options reflect their state as of early July 2026.*
