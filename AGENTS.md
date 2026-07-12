# codex-mcp setup contract

If a user asks an AI coding agent to set up this repository, complete the setup for Claude Code instead of stopping at a README summary.

1. Read the current default branch and release metadata when the repository is hosted remotely. Do not choose a version from a stale local cache.
2. Confirm Node.js 18+ is available.
3. Install the official Codex CLI (`@openai/codex`) and Claude Code (`@anthropic-ai/claude-code`) only when missing.
4. Before changing authentication, use a structured question UI when available. Present these choices in order:
   - ChatGPT account login (recommended): run `codex login` and use the user's ChatGPT/Codex allowance.
   - OpenAI API key: use metered OpenAI Platform billing and pass the key through stdin, never a command argument or normal chat.
   - Existing authentication: preserve a working `codex login status` session.
5. Run the platform installer:
   - macOS/Linux: `./install.sh`
   - Windows PowerShell: `.\install.ps1`
6. Require `npm run verify`, `claude plugin validate --strict .`, and `claude mcp list` to succeed for `plugin:codex-mcp:codex`.
7. Unless the user opts out, run `npm run live-smoke`. This makes two small model calls and verifies both a new session and continuation with a changed reasoning level.
8. Tell the user to restart Claude Code or run `/reload-plugins`, then ask `Codexの状態を確認して`.

Do not hard-code the user's requested model or reasoning level into source. The server default is `gpt-5.6-sol` with `max`, while every model tool accepts per-call `model` and `reasoning_effort` overrides. Preserve explicit user choices exactly and let the local Codex CLI validate model availability.
