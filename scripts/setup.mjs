#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  return match ? [match[1], match[2] ?? true] : [arg, true];
}));
const authMode = String(args.get("auth") || "auto");
const installScope = String(args.get("scope") || "user");
const skipLiveCheck = args.has("skip-live-check");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: options.encoding === undefined ? "utf8" : options.encoding,
    input: options.input,
    stdio: options.stdio,
    windowsHide: true,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const details = String(result.stderr || result.stdout || result.error?.message || "unknown error").trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed: ${details}`);
  }
  return result;
}

function exists(command) {
  const probe = process.platform === "win32" ? ["where", [command]] : ["sh", ["-lc", `command -v ${command}`]];
  return run(probe[0], probe[1], { allowFailure: true }).status === 0;
}

function ensureRuntime() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 18) throw new Error(`Node.js 18+ is required (found ${process.version}).`);
  if (!exists("npm")) throw new Error("npm is required.");
  if (!exists("codex")) {
    console.log("Codex CLI is missing; installing @openai/codex globally...");
    run("npm", ["install", "-g", "@openai/codex"], { stdio: "inherit", encoding: null });
  }
  if (!exists("claude")) {
    console.log("Claude Code is missing; installing @anthropic-ai/claude-code globally...");
    run("npm", ["install", "-g", "@anthropic-ai/claude-code"], { stdio: "inherit", encoding: null });
  }
}

async function chooseAuth() {
  if (["chatgpt", "api", "existing", "skip"].includes(authMode)) return authMode;
  if (authMode !== "auto") throw new Error("--auth must be auto, chatgpt, api, existing, or skip.");
  const status = run("codex", ["login", "status"], { allowFailure: true });
  if (status.status === 0) return "existing";
  if (!stdin.isTTY) return "skip";
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("Authentication: [1] ChatGPT login (recommended)  [2] OpenAI API key  [3] Skip\nChoose 1-3 [1]: ")).trim();
  rl.close();
  return answer === "2" ? "api" : answer === "3" ? "skip" : "chatgpt";
}

async function configureAuth(mode) {
  if (mode === "existing") {
    console.log(String(run("codex", ["login", "status"]).stdout).trim());
    return;
  }
  if (mode === "chatgpt") {
    run("codex", ["login"], { stdio: "inherit", encoding: null });
    return;
  }
  if (mode === "api") {
    const key = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY;
    if (!key) {
      throw new Error("API-key mode requires OPENAI_API_KEY or CODEX_API_KEY in the environment. The installer never asks you to paste a key into normal output or command arguments.");
    }
    run("codex", ["login", "--with-api-key"], { input: `${key}\n` });
    return;
  }
  console.warn("Authentication skipped. Run `codex login` before using model tools.");
}

function installPlugin() {
  console.log("Installing dependencies and building the bundled MCP server...");
  run("npm", ["install"], { stdio: "inherit", encoding: null });
  run("npm", ["run", "verify"], { stdio: "inherit", encoding: null });
  run("claude", ["plugin", "validate", "--strict", ROOT], { stdio: "inherit", encoding: null });

  const listed = run("claude", ["plugin", "marketplace", "list"], { allowFailure: true });
  if (String(listed.stdout).includes("codex-mcp")) {
    run("claude", ["plugin", "marketplace", "remove", "codex-mcp"], { allowFailure: true });
  }
  run("claude", ["plugin", "marketplace", "add", "--scope", installScope, ROOT], { stdio: "inherit", encoding: null });
  run("claude", ["plugin", "install", "--scope", installScope, "codex-mcp@codex-mcp"], { stdio: "inherit", encoding: null });
}

ensureRuntime();
const selectedAuth = await chooseAuth();
await configureAuth(selectedAuth);
installPlugin();
if (!skipLiveCheck && selectedAuth !== "skip") {
  run("npm", ["run", "live-smoke"], { stdio: "inherit", encoding: null });
}
console.log("codex-mcp is installed. Restart Claude Code (or run /reload-plugins), then ask: `Codexの状態を確認して`. ");
