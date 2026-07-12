---
name: codex-consult
description: Consult OpenAI GPT/Codex from Claude Code for planning, deep reasoning, continuation, or code review. Use when the user explicitly asks GPT, Codex, GPT-5.6, Sol, Terra, or Luna to plan, answer, or review; or asks to continue a prior codex-mcp session.
---

# Codex Consult

Use the `codex` MCP tools supplied by this plugin. Codex is the read-only external architect/reviewer; Claude Code remains the implementation agent.

## Route

- Setup or authentication issue: call `gpt_status` first.
- Implementation design: call `gpt_plan`, then implement the useful parts with Claude Code.
- Difficult question or second opinion: call `gpt_ask`.
- Review after implementation: call `gpt_review`.
- Follow-up in the same external conversation: call `gpt_continue` with the exact returned `session_id`.

Do not call Codex for every ordinary request. Use it when the user explicitly asks for GPT/Codex, requests this plugin, or asks for an external quality pass.

## Model and reasoning selection

Pass a model only when the user names one. Map common names as follows:

- `GPT-5.6` -> `gpt-5.6`
- `GPT-5.6 Sol` or `Sol` -> `gpt-5.6-sol`
- `GPT-5.6 Terra` or `Terra` -> `gpt-5.6-terra`
- `GPT-5.6 Luna` or `Luna` -> `gpt-5.6-luna`

Pass `reasoning_effort` only when the user specifies a level or intent:

- quick, light, fast, 軽く, サクッと -> `low`
- balanced, normal, 普通 -> `medium`
- deep, careful, 深く, じっくり -> `high`
- very deep, 徹底的 -> `xhigh`
- maximum, max, 本気で, 最大 -> `max`
- ultra, delegation, 並列で徹底的 -> `ultra`

Explicit values win over these mappings. Valid values exposed by the MCP server are `none`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`. The local Codex model catalog is authoritative; if a combination fails, call `gpt_status` for that model and report the supported levels.

When neither setting is specified, omit both. The server default is `gpt-5.6-sol` with `max`, configurable through `CODEX_MCP_DEFAULT_MODEL` and `CODEX_MCP_DEFAULT_REASONING_EFFORT`.

## Relay and continuation

Preserve the external model's concrete findings, caveats, and file references. You may synthesize them with your own judgment, but clearly distinguish disagreements.

For a follow-up, reuse the exact `session_id`. Changing the model or reasoning level on `gpt_continue` is allowed when the user requests it.

All Codex calls run with `approval_policy=never` and `sandbox_mode=read-only`; never imply that Codex changed the repository.
