# codex-mcp

[![CI](https://github.com/sam-mountainman/codex-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sam-mountainman/codex-mcp/actions/workflows/ci.yml)

Use OpenAI Codex models as read-only planning, deep-reasoning, and code-review agents from Claude Code. This is the reverse-direction companion to [fable-mcp](https://github.com/sam-mountainman/fable-mcp): Claude Code implements, while Codex provides an external architecture or review pass.

## One-sentence setup

Paste this into Claude Code or another coding agent:

```text
Set up https://github.com/sam-mountainman/codex-mcp.
```

The repository's `AGENTS.md` is the setup contract. The receiving agent should check Node.js, install missing official CLIs, preserve or configure Codex authentication, install the Claude Code plugin, validate the MCP server, and run the live check unless you opt out.

## Tools

- `gpt_plan`: inspect a repository read-only and produce an implementation plan
- `gpt_ask`: deep technical consultation and second opinions
- `gpt_review`: review the current working tree with findings first
- `gpt_continue`: continue the same Codex session by `session_id`
- `gpt_status`: inspect local CLI, auth, defaults, and model support without a model call

The defaults are `gpt-5.6-sol` and `max`. Every model call accepts per-call `model` and `reasoning_effort` overrides. All calls force `approval_policy=never` and `sandbox_mode=read-only`.

## Manual setup

```sh
git clone https://github.com/sam-mountainman/codex-mcp.git
cd codex-mcp
./install.sh
```

On Windows PowerShell:

```powershell
git clone https://github.com/sam-mountainman/codex-mcp.git
Set-Location codex-mcp
.\install.ps1
```

The installer reuses working Codex authentication. When authentication is missing, use ChatGPT login (recommended) or an OpenAI API key supplied through `OPENAI_API_KEY`/`CODEX_API_KEY`. Keys are sent to `codex login --with-api-key` through stdin, never command arguments.

Restart Claude Code or run `/reload-plugins`, then ask `Check the Codex status`.

## Model controls

Examples:

```text
Ask GPT-5.6 Terra with low reasoning to plan this change.
Have Sol review the implementation at max reasoning.
Continue the previous session with Luna at medium reasoning.
```

The server accepts `none`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`; the selected local Codex model catalog remains authoritative for valid combinations.

Environment defaults:

```sh
export CODEX_MCP_DEFAULT_MODEL=gpt-5.6-terra
export CODEX_MCP_DEFAULT_REASONING_EFFORT=medium
```

## Development

```sh
npm ci
npm run verify
npm run live-smoke
claude plugin validate --strict .
```

Only `live-smoke` calls a model. The remaining checks are local.

## License

MIT
