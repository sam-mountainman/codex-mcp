import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCodex } from "../server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const model = process.env.CODEX_MCP_LIVE_MODEL || "gpt-5.6-sol";
const firstEffort = process.env.CODEX_MCP_LIVE_REASONING_EFFORT || "low";
const continuedEffort = process.env.CODEX_MCP_LIVE_CONTINUE_REASONING_EFFORT || "medium";
const result = await runCodex({
  prompt: "Remember the nonce CODEX_MCP_NONCE_42. Reply with exactly CODEX_MCP_LIVE_OK and nothing else. Do not use tools.",
  cwd: root,
  model,
  reasoningEffort: firstEffort,
});

if (result.isError || !result.rawText?.includes("CODEX_MCP_LIVE_OK")) {
  console.error(result.text);
  process.exitCode = 1;
} else {
  const continued = await runCodex({
    prompt: "If you remember CODEX_MCP_NONCE_42 from the previous turn, reply with exactly CODEX_MCP_CONTINUE_OK and nothing else. Do not use tools.",
    cwd: root,
    sessionId: result.sessionId,
    model,
    reasoningEffort: continuedEffort,
  });
  if (continued.isError || !continued.rawText?.includes("CODEX_MCP_CONTINUE_OK")) {
    console.error(continued.text);
    process.exitCode = 1;
  } else {
    console.log(`Live smoke passed (${model}; ${firstEffort} -> ${continuedEffort}; session ${continued.sessionId}).`);
  }
}
