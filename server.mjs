#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const VERSION = "0.1.0";
export const DEFAULT_MODEL = process.env.CODEX_MCP_DEFAULT_MODEL || "gpt-5.6-sol";
export const DEFAULT_REASONING_EFFORT = process.env.CODEX_MCP_DEFAULT_REASONING_EFFORT || "max";

const TIMEOUT_MS = readPositiveInteger("CODEX_MCP_TIMEOUT_MS", 20 * 60 * 1000);
const MAX_OUTPUT_CHARS = readPositiveInteger("CODEX_MCP_MAX_OUTPUT_CHARS", 200_000);
const HEARTBEAT_MS = 20_000;
const IS_WIN = process.platform === "win32";
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,255}$/;
const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max", "ultra"];
const REASONING_EFFORT_SET = new Set(REASONING_EFFORTS);

const SERVER_INSTRUCTIONS = `
This server lets Claude Code consult an OpenAI Codex model as a read-only external architect and reviewer.

Routing:
- Use gpt_status first for setup or authentication troubleshooting. It is local-only and does not spend model usage.
- Use gpt_plan before a substantial implementation when the user explicitly asks GPT/Codex to plan or wants a second architecture opinion.
- Use gpt_ask for a difficult question or second opinion.
- Use gpt_review after implementation when the user asks GPT/Codex to review it.
- Use gpt_continue with the returned session_id for a follow-up in the same Codex conversation.

Model controls:
- If the user names a model, pass it in model exactly. Common mappings: GPT-5.6 -> gpt-5.6, Sol -> gpt-5.6-sol, Terra -> gpt-5.6-terra, Luna -> gpt-5.6-luna.
- If the user names a reasoning level, pass it in reasoning_effort. Supported values exposed by this server are none, low, medium, high, xhigh, max, and ultra; the selected local Codex model remains the authority on which combinations it accepts.
- If the user does not specify either setting, omit both fields. The defaults are gpt-5.6-sol and max unless CODEX_MCP_DEFAULT_MODEL or CODEX_MCP_DEFAULT_REASONING_EFFORT overrides them.

Safety:
- All model calls run with approval_policy=never and sandbox_mode=read-only. Codex may inspect the target repository but cannot modify it.
- Relay the external model's substantive findings faithfully. Claude Code remains responsible for implementation.
`.trim();

function readPositiveInteger(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function resolveCodexBin() {
  if (process.env.CODEX_MCP_CODEX_BIN) return process.env.CODEX_MCP_CODEX_BIN;
  const local = join(dirname(process.execPath), IS_WIN ? "codex.exe" : "codex");
  return existsSync(local) ? local : "codex";
}

export const CODEX_BIN = resolveCodexBin();

function validateModel(model) {
  if (!MODEL_RE.test(model)) {
    throw new Error(`Invalid model: ${model}. Use a Codex model ID containing only letters, numbers, . _ : @ / or -.`);
  }
  return model;
}

function validateEffort(effort) {
  if (!REASONING_EFFORT_SET.has(effort)) {
    throw new Error(`Invalid reasoning_effort: ${effort}. Expected ${REASONING_EFFORTS.join(" / ")}.`);
  }
  return effort;
}

function validateSessionId(sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error("Invalid session_id. Pass the exact session_id returned by a previous codex-mcp call.");
  }
  return sessionId;
}

function resolveCwd(cwd) {
  const target = resolve(cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`cwd is not an existing directory: ${target}`);
  }
  return target;
}

export function resolveSettings({ model, reasoningEffort } = {}) {
  return {
    model: validateModel(model || DEFAULT_MODEL),
    reasoningEffort: validateEffort(reasoningEffort || DEFAULT_REASONING_EFFORT),
  };
}

export function buildCodexArgs({ model, reasoningEffort, sessionId } = {}) {
  const settings = resolveSettings({ model, reasoningEffort });
  const common = [
    "--json",
    "--skip-git-repo-check",
    "-m",
    settings.model,
    "-c",
    `model_reasoning_effort=\"${settings.reasoningEffort}\"`,
    "-c",
    'approval_policy="never"',
  ];

  if (sessionId) {
    return [
      "exec",
      "resume",
      ...common,
      "-c",
      'sandbox_mode="read-only"',
      validateSessionId(sessionId),
      "-",
    ];
  }

  return ["exec", ...common, "--sandbox", "read-only", "-"];
}

export function parseCodexEvent(line) {
  try {
    const event = JSON.parse(line);
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
}

function eventText(event) {
  if (event?.type === "item.completed" && event.item?.type === "agent_message") {
    return typeof event.item.text === "string" ? event.item.text : "";
  }
  if (event?.type === "message" && typeof event.message === "string") return event.message;
  if (event?.type === "result" && typeof event.result === "string") return event.result;
  return "";
}

function eventError(event) {
  if (event?.type === "turn.failed") {
    return event.error?.message || event.error?.code || "Codex turn failed.";
  }
  if (event?.type === "error") return event.message || event.error?.message || "Codex error.";
  return "";
}

function eventProgress(event) {
  if (!event || !String(event.type || "").startsWith("item.")) return "";
  const item = event.item || {};
  if (item.type === "command_execution") return `command ${String(item.command || "").slice(0, 120)}`.trim();
  if (item.type === "mcp_tool_call") return `MCP ${item.server || ""}/${item.tool || ""}`.replace(/\/$/, "");
  if (item.type === "web_search") return `web search ${String(item.query || "").slice(0, 120)}`.trim();
  if (item.type && item.type !== "agent_message" && item.type !== "reasoning") return String(item.type);
  return "";
}

function usageSummary(usage) {
  if (!usage || typeof usage !== "object") return "usage: n/a";
  const input = usage.input_tokens ?? usage.inputTokens;
  const cached = usage.cached_input_tokens ?? usage.cachedInputTokens;
  const output = usage.output_tokens ?? usage.outputTokens;
  const parts = [];
  if (input != null) parts.push(`input ${input}`);
  if (cached != null) parts.push(`cached ${cached}`);
  if (output != null) parts.push(`output ${output}`);
  return parts.length ? `tokens: ${parts.join(", ")}` : "usage: n/a";
}

function truncateOutput(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n[codex-mcp] Output truncated at ${MAX_OUTPUT_CHARS} characters.`,
    truncated: true,
  };
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // Best-effort cleanup.
    }
  }, 5_000).unref();
}

export function runCodex({ prompt, cwd, sessionId, model, reasoningEffort, onProgress, signal, codexBin = CODEX_BIN }) {
  return new Promise((resolveRun) => {
    let targetCwd;
    let args;
    let settings;
    try {
      targetCwd = resolveCwd(cwd);
      settings = resolveSettings({ model, reasoningEffort });
      args = buildCodexArgs({ ...settings, sessionId });
    } catch (error) {
      resolveRun({ isError: true, text: error.message });
      return;
    }

    const startedAt = Date.now();
    let child;
    try {
      child = spawn(codexBin, args, {
        cwd: targetCwd,
        env: process.env,
        shell: IS_WIN && /\.(cmd|bat)$/i.test(codexBin),
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolveRun({ isError: true, text: `Failed to start Codex CLI: ${error.message}` });
      return;
    }

    let settled = false;
    let stdoutBuffer = "";
    let stderrTail = "";
    let finalText = "";
    let threadId = sessionId || "";
    let usage = null;
    let failure = "";
    let timedOut = false;
    let aborted = false;
    let progressCount = 0;

    const emitProgress = (message) => {
      if (!message) return;
      progressCount += 1;
      try {
        onProgress?.(progressCount, message);
      } catch {
        // Progress is advisory and must not fail the model call.
      }
    };

    const handleEvent = (event) => {
      if (!event) return;
      if (event.type === "thread.started" && typeof event.thread_id === "string") threadId = event.thread_id;
      const text = eventText(event);
      if (text) finalText = text;
      const error = eventError(event);
      if (error) failure = error;
      if (event.type === "turn.completed" && event.usage) usage = event.usage;
      emitProgress(eventProgress(event));
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killChild(child);
    }, TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      emitProgress(`Codex is reasoning... ${Math.round((Date.now() - startedAt) / 1000)}s`);
    }, HEARTBEAT_MS);
    const abort = () => {
      aborted = true;
      killChild(child);
    };
    signal?.addEventListener("abort", abort, { once: true });

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      signal?.removeEventListener("abort", abort);
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newline;
      while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) handleEvent(parseCodexEvent(line));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-8_000);
    });
    child.stdin.on("error", () => {
      // EPIPE is handled by the process close/error events.
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      const hint = error.code === "ENOENT"
        ? `Codex CLI not found (${codexBin}). Install @openai/codex or set CODEX_MCP_CODEX_BIN.`
        : error.message;
      resolveRun({ isError: true, text: hint });
    });

    child.on("close", (code, closeSignal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stdoutBuffer.trim()) handleEvent(parseCodexEvent(stdoutBuffer.trim()));
      if (aborted) {
        resolveRun({ isError: true, text: "Codex call was cancelled and the child process was stopped." });
        return;
      }
      if (timedOut) {
        resolveRun({ isError: true, text: `Codex call timed out after ${Math.round(TIMEOUT_MS / 60_000)} minutes.` });
        return;
      }
      if (code !== 0 || failure || !finalText) {
        const details = failure || stderrTail.trim() || `No final agent message was received (exit ${code}${closeSignal ? `, ${closeSignal}` : ""}).`;
        resolveRun({ isError: true, text: `Codex call failed.\n${details}` });
        return;
      }

      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      const output = truncateOutput(finalText);
      const footer = `\n\n---\n[codex-mcp] ${[
        `session_id: ${threadId || "n/a"}`,
        `model: ${settings.model}`,
        `reasoning_effort: ${settings.reasoningEffort}`,
        usageSummary(usage),
        `elapsed: ${elapsedSeconds}s`,
        "sandbox: read-only",
      ].join(" | ")}`;
      resolveRun({
        isError: false,
        text: output.text + footer,
        rawText: finalText,
        sessionId: threadId,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        usage,
        truncated: output.truncated,
      });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function runLocal(args, timeout = 15_000) {
  const result = spawnSync(CODEX_BIN, args, {
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    shell: IS_WIN && /\.(cmd|bat)$/i.test(CODEX_BIN),
    timeout,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error?.message || "",
  };
}

export function getStatus(model = DEFAULT_MODEL) {
  let selectedModel;
  try {
    selectedModel = validateModel(model);
  } catch (error) {
    return error.message;
  }

  const version = runLocal(["--version"], 5_000);
  const auth = runLocal(["login", "status"], 10_000);
  const catalogResult = runLocal(["debug", "models"], 20_000);
  let catalog = [];
  try {
    catalog = JSON.parse(catalogResult.stdout).models || [];
  } catch {
    catalog = [];
  }
  const info = catalog.find((entry) => entry.slug === selectedModel);
  const levels = info?.supported_reasoning_levels?.map((entry) => entry.effort) || [];
  const defaultAccepted = !levels.length || levels.includes(DEFAULT_REASONING_EFFORT);

  return [
    "# codex-mcp status",
    "",
    `- server: ${VERSION}`,
    `- codex binary: ${CODEX_BIN}`,
    `- Codex CLI: ${version.ok ? version.stdout : `unavailable (${version.error || version.stderr || version.status})`}`,
    `- authentication: ${auth.ok ? auth.stdout : `not ready (${auth.error || auth.stderr || auth.status})`}`,
    `- default model: ${DEFAULT_MODEL}`,
    `- default reasoning effort: ${DEFAULT_REASONING_EFFORT}`,
    `- inspected model: ${selectedModel}`,
    `- catalog visibility: ${info ? "available" : catalogResult.ok ? "not listed" : "catalog unavailable"}`,
    `- model default effort: ${info?.default_reasoning_level || "unknown"}`,
    `- model-supported efforts: ${levels.length ? levels.join(" / ") : "unknown"}`,
    `- current default combination: ${defaultAccepted ? "accepted by local catalog" : "warning: effort not advertised for default model"}`,
    `- timeout: ${TIMEOUT_MS} ms`,
    "- execution policy: approval_policy=never, sandbox_mode=read-only",
    "",
    "This status check is local-only and does not call a model.",
  ].join("\n");
}

function toToolResult(result) {
  return { content: [{ type: "text", text: result.text }], isError: Boolean(result.isError) };
}

function progressReporter(extra) {
  const progressToken = extra?._meta?.progressToken;
  return (progress, message) => {
    if (progressToken === undefined || typeof extra?.sendNotification !== "function") return;
    extra.sendNotification({
      method: "notifications/progress",
      params: { progressToken, progress, message },
    }).catch(() => {});
  };
}

const modelArgument = () => z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(MODEL_RE)
  .optional()
  .describe("Model for this call, for example gpt-5.6-sol, gpt-5.6, gpt-5.6-terra, or another model accepted by the local Codex CLI. Omit to use CODEX_MCP_DEFAULT_MODEL or gpt-5.6-sol.");

const effortArgument = () => z
  .enum(REASONING_EFFORTS)
  .optional()
  .describe("Reasoning level for this call: none / low / medium / high / xhigh / max / ultra. Omit to use CODEX_MCP_DEFAULT_REASONING_EFFORT or max. The selected local model decides which values it accepts.");

const optionalCwd = () => z
  .string()
  .optional()
  .describe("Absolute path to the project Codex may inspect. Defaults to CLAUDE_PROJECT_DIR or the MCP process working directory.");

export function createServer() {
  const server = new McpServer(
    { name: "codex-mcp", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.tool(
    "gpt_status",
    "Check the local Codex CLI, authentication, configured defaults, and model catalog without calling a model or spending usage.",
    {
      model: modelArgument().describe("Optional model ID to inspect in the local Codex catalog."),
    },
    async ({ model }) => toToolResult({ isError: false, text: getStatus(model) }),
  );

  server.tool(
    "gpt_plan",
    "Ask an OpenAI Codex model to inspect a repository read-only and produce a concrete implementation plan. Model and reasoning effort can be selected per call.",
    {
      task: z.string().min(1).describe("Complete task specification, including goals, constraints, and relevant context."),
      cwd: optionalCwd(),
      model: modelArgument(),
      reasoning_effort: effortArgument(),
    },
    async ({ task, cwd, model, reasoning_effort }, extra) => {
      const prompt = `You are the read-only architecture and planning agent in a two-agent workflow. Claude Code will implement your plan. Inspect the repository as needed, but do not modify files. Produce a concrete plan in the same language as the task. Include design decisions, exact files/components to change, edge cases, risks, and verification.\n\n<task>\n${task}\n</task>`;
      return toToolResult(await runCodex({ prompt, cwd, model, reasoningEffort: reasoning_effort, onProgress: progressReporter(extra), signal: extra?.signal }));
    },
  );

  server.tool(
    "gpt_ask",
    "Ask an OpenAI Codex model for deep reasoning, debugging hypotheses, trade-off analysis, or a second opinion. It may inspect the repository read-only.",
    {
      question: z.string().min(1).describe("Question with enough background and constraints for a useful answer."),
      cwd: optionalCwd(),
      model: modelArgument(),
      reasoning_effort: effortArgument(),
    },
    async ({ question, cwd, model, reasoning_effort }, extra) => {
      const prompt = `Act as a read-only technical consultant. Inspect relevant repository files if useful, but do not modify anything. Answer in the same language as the question. State assumptions and concrete evidence.\n\n<question>\n${question}\n</question>`;
      return toToolResult(await runCodex({ prompt, cwd, model, reasoningEffort: reasoning_effort, onProgress: progressReporter(extra), signal: extra?.signal }));
    },
  );

  server.tool(
    "gpt_review",
    "Ask an OpenAI Codex model to review the current implementation read-only. It inspects the working tree and prioritizes correctness, security, regressions, and missing tests.",
    {
      cwd: optionalCwd(),
      context: z.string().optional().describe("Original requirements, plan, or review focus to compare the implementation against."),
      model: modelArgument(),
      reasoning_effort: effortArgument(),
    },
    async ({ cwd, context, model, reasoning_effort }, extra) => {
      const prompt = `Review the current repository implementation in read-only mode. Inspect git status, diffs, and relevant files. Do not modify anything. Prioritize actionable correctness, security, behavioral regression, performance, and test-coverage findings. Cite file paths and line numbers when possible. Put findings first in severity order; if there are no findings, say so and name residual risks.\n\n<requirements_or_focus>\n${context || "Review the current uncommitted implementation as-is."}\n</requirements_or_focus>`;
      return toToolResult(await runCodex({ prompt, cwd, model, reasoningEffort: reasoning_effort, onProgress: progressReporter(extra), signal: extra?.signal }));
    },
  );

  server.tool(
    "gpt_continue",
    "Continue a previous codex-mcp conversation using its session_id. The model and reasoning effort may be changed for the resumed turn.",
    {
      prompt: z.string().min(1).describe("Follow-up message for the existing Codex conversation."),
      session_id: z.string().regex(SESSION_ID_RE).describe("Exact session_id returned by gpt_plan, gpt_ask, gpt_review, or an earlier gpt_continue call."),
      cwd: optionalCwd(),
      model: modelArgument(),
      reasoning_effort: effortArgument(),
    },
    async ({ prompt, session_id, cwd, model, reasoning_effort }, extra) => toToolResult(await runCodex({
      prompt,
      cwd,
      sessionId: session_id,
      model,
      reasoningEffort: reasoning_effort,
      onProgress: progressReporter(extra),
      signal: extra?.signal,
    })),
  );

  return server;
}

export async function startServer() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().catch((error) => {
    console.error("[codex-mcp]", error);
    process.exitCode = 1;
  });
}
