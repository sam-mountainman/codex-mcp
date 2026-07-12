import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexArgs,
  parseCodexEvent,
  resolveSettings,
} from "../server.mjs";

test("defaults to GPT-5.6 Sol with max reasoning", () => {
  assert.deepEqual(resolveSettings(), {
    model: "gpt-5.6-sol",
    reasoningEffort: "max",
  });
});

test("allows per-call model and reasoning overrides", () => {
  assert.deepEqual(resolveSettings({ model: "gpt-5.6-terra", reasoningEffort: "low" }), {
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
  });
  assert.deepEqual(resolveSettings({ model: "future-model-1", reasoningEffort: "ultra" }), {
    model: "future-model-1",
    reasoningEffort: "ultra",
  });
});

test("rejects unsafe models and unknown efforts", () => {
  assert.throws(() => resolveSettings({ model: "bad model" }), /Invalid model/);
  assert.throws(() => resolveSettings({ reasoningEffort: "extreme" }), /Invalid reasoning_effort/);
});

test("builds a read-only non-interactive invocation", () => {
  const args = buildCodexArgs({ model: "gpt-5.6", reasoningEffort: "high" });
  assert.deepEqual(args.slice(0, 2), ["exec", "--json"]);
  assert.ok(args.includes("read-only"));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('model_reasoning_effort="high"'));
  assert.equal(args.at(-1), "-");
});

test("builds a resumable invocation", () => {
  const sessionId = "019f56f4-e02c-7f93-a593-1a395122fde4";
  const args = buildCodexArgs({ sessionId });
  assert.deepEqual(args.slice(0, 3), ["exec", "resume", "--json"]);
  assert.ok(args.includes(sessionId));
  assert.ok(args.includes('sandbox_mode="read-only"'));
});

test("parses JSONL events and ignores invalid lines", () => {
  assert.deepEqual(parseCodexEvent('{"type":"thread.started","thread_id":"abc"}'), {
    type: "thread.started",
    thread_id: "abc",
  });
  assert.equal(parseCodexEvent("not json"), null);
});
