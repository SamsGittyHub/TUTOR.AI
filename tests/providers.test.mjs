import assert from "node:assert/strict";
import { PROVIDERS, estimateCost, formatCost } from "../.test-build/providers/index.js";

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.log("FAIL  " + name + "\n      " + (e.stack || e.message)); process.exitCode = 1; }
};

function sseResponse(frames, { status = 200, body } = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(status === 200 ? stream : body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

let lastRequest = null;
const withFetch = (impl, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    lastRequest = { url: String(url), init };
    return impl(String(url), init);
  };
  return run().finally(() => { globalThis.fetch = original; });
};

const collect = async (provider, frames, opts = {}) => {
  let text = "";
  let usage = null;
  await withFetch(() => sseResponse(frames), () =>
    provider.stream({
      apiKey: "test-key",
      model: opts.model ?? provider.models[0].id,
      system: "sys",
      messages: [{ role: "user", content: "hi", images: opts.images }],
      onText: (d) => { text += d; },
      onUsage: (u) => { usage = u; },
    }),
  );
  return { text, usage };
};

console.log("\n— Anthropic —");

// Real event shape from the Messages API streaming docs.
const ANTHROPIC_FRAMES = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":1200,"cache_read_input_tokens":300,"output_tokens":1}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"type\\":\\"say\\","}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\\"text\\":\\"hello\\"}"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":420}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

await test("decodes text deltas and totals usage incl. cache reads", async () => {
  const { text, usage } = await collect(PROVIDERS.anthropic, ANTHROPIC_FRAMES);
  assert.equal(text, '{"type":"say","text":"hello"}');
  assert.equal(usage.inputTokens, 1500);
  assert.equal(usage.outputTokens, 420);
});

await test("sends the browser-access header, version, and x-api-key", async () => {
  await collect(PROVIDERS.anthropic, ANTHROPIC_FRAMES);
  const h = lastRequest.init.headers;
  assert.equal(h["x-api-key"], "test-key");
  assert.equal(h["anthropic-version"], "2023-06-01");
  assert.equal(h["anthropic-dangerous-direct-browser-access"], "true");
  assert.ok(lastRequest.url.endsWith("/v1/messages"));
});

await test("sends effort only on models that accept output_config", async () => {
  await collect(PROVIDERS.anthropic, ANTHROPIC_FRAMES, { model: "claude-opus-5" });
  assert.equal(JSON.parse(lastRequest.init.body).output_config.effort, "low");
  await collect(PROVIDERS.anthropic, ANTHROPIC_FRAMES, { model: "claude-3-5-sonnet-20241022" });
  assert.equal(JSON.parse(lastRequest.init.body).output_config, undefined);
});

await test("images become base64 image blocks before the text block", async () => {
  await collect(PROVIDERS.anthropic, ANTHROPIC_FRAMES, {
    images: [{ mediaType: "image/png", base64: "AAAA" }],
  });
  const content = JSON.parse(lastRequest.init.body).messages[0].content;
  assert.equal(content[0].type, "image");
  assert.equal(content[0].source.media_type, "image/png");
  assert.equal(content[1].type, "text");
});

await test("a 401 becomes an actionable ProviderError", async () => {
  await withFetch(
    () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }),
    async () => {
      await assert.rejects(
        PROVIDERS.anthropic.stream({
          apiKey: "bad", model: "claude-sonnet-5", system: "s",
          messages: [{ role: "user", content: "hi" }], onText: () => {},
        }),
        (e) => {
          assert.equal(e.status, 401);
          assert.match(e.message, /invalid x-api-key/);
          assert.match(e.hint, /rejected/);
          return true;
        },
      );
    },
  );
});

console.log("\n— OpenAI / OpenRouter —");

const OPENAI_FRAMES = [
  'data: {"choices":[{"delta":{"content":"{\\"type\\":"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"\\"done\\"}"}}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":900,"completion_tokens":120}}\n\n',
  "data: [DONE]\n\n",
];

await test("decodes chat-completions deltas and usage", async () => {
  const { text, usage } = await collect(PROVIDERS.openai, OPENAI_FRAMES);
  assert.equal(text, '{"type":"done"}');
  assert.equal(usage.inputTokens, 900);
  assert.equal(usage.outputTokens, 120);
});

await test("system prompt is the first message; bearer auth is set", async () => {
  await collect(PROVIDERS.openai, OPENAI_FRAMES);
  const body = JSON.parse(lastRequest.init.body);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.stream_options.include_usage, true);
  assert.equal(lastRequest.init.headers.authorization, "Bearer test-key");
});

await test("reasoning models get reasoning_effort, not temperature", async () => {
  await collect(PROVIDERS.openai, OPENAI_FRAMES, { model: "o4-mini" });
  const body = JSON.parse(lastRequest.init.body);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.temperature, undefined);
  await collect(PROVIDERS.openai, OPENAI_FRAMES, { model: "gpt-4.1" });
  assert.equal(JSON.parse(lastRequest.init.body).temperature, 0.4);
});

await test("OpenRouter rides the same decoder on its own endpoint", async () => {
  const { text } = await collect(PROVIDERS.openrouter, OPENAI_FRAMES);
  assert.equal(text, '{"type":"done"}');
  assert.ok(lastRequest.url.startsWith("https://openrouter.ai/api/v1/"));
});

console.log("\n— Google —");

const GOOGLE_FRAMES = [
  'data: {"candidates":[{"content":{"parts":[{"text":"{\\"type\\":\\"say\\","}]}}]}\n\n',
  'data: {"candidates":[{"content":{"parts":[{"text":"\\"text\\":\\"hi\\"}"}]}}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":8}}\n\n',
];

await test("decodes candidate parts and usageMetadata", async () => {
  const { text, usage } = await collect(PROVIDERS.google, GOOGLE_FRAMES);
  assert.equal(text, '{"type":"say","text":"hi"}');
  assert.equal(usage.inputTokens, 50);
  assert.equal(usage.outputTokens, 8);
});

await test("key rides in the query string, system prompt in systemInstruction", async () => {
  await collect(PROVIDERS.google, GOOGLE_FRAMES);
  assert.match(lastRequest.url, /alt=sse&key=test-key$/);
  assert.match(lastRequest.url, /:streamGenerateContent/);
  const body = JSON.parse(lastRequest.init.body);
  assert.equal(body.systemInstruction.parts[0].text, "sys");
  assert.equal(body.contents[0].role, "user");
});

await test("assistant turns are relabelled 'model' for Gemini", async () => {
  await withFetch(() => sseResponse(GOOGLE_FRAMES), () =>
    PROVIDERS.google.stream({
      apiKey: "k", model: "gemini-2.5-flash", system: "s",
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      onText: () => {},
    }),
  );
  const roles = JSON.parse(lastRequest.init.body).contents.map((c) => c.role);
  assert.deepEqual(roles, ["user", "model", "user"]);
});

console.log("\n— cost —");

await test("estimates from the model price table", async () => {
  const usd = estimateCost("anthropic", "claude-sonnet-5", 1_000_000, 100_000);
  assert.equal(usd, 2 + 1);
  assert.equal(formatCost(0.0031), "$0.0031");
  assert.equal(estimateCost("openrouter", "unknown/model", 1000, 1000), null);
});

console.log(`\n${passed} checks passed\n`);
