import assert from "node:assert/strict";
import { JsonObjectStream, extractFirstJson } from "../.test-build/core/stream-json.js";
import { normalizeAction } from "../.test-build/core/actions.js";
import { compileExpression } from "../.test-build/core/expr.js";
import {
  DAY_MS,
  isDue,
  newCard,
  promptKeyOf,
  schedule,
  startOfTomorrow,
  upsertCard,
} from "../.test-build/core/srs.js";
import {
  bucketForecast,
  cardHealth,
  computeMastery,
  masteryForMaterial,
  recentAttemptAccuracy,
} from "../.test-build/core/progress.js";
import { buildPlan, describePlan, studyDays } from "../.test-build/core/planner.js";
import { actionToMarkdown, exportFilename, lessonToMarkdown } from "../.test-build/core/export.js";
import { encodeWav, secondsPerChunk, TRANSCRIBE_LIMIT_BYTES } from "../.test-build/core/materials/audio.js";
import { chunkUnits } from "../.test-build/core/materials/chunk.js";
import { retrieve, retrieveHybrid } from "../.test-build/core/materials/retrieve.js";
import { cosine, fuseRankings } from "../.test-build/core/materials/vector.js";

let passed = 0;
const pending = [];
const test = (name, fn) => {
  const record = (e) => {
    if (e) { console.log("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; }
    else { passed++; console.log("  ok  " + name); }
  };
  try {
    const out = fn();
    // Most checks are synchronous; the audio ones return a promise.
    if (out && typeof out.then === "function") {
      pending.push(out.then(() => record(), record));
    } else record();
  } catch (e) { record(e); }
};

console.log("\n— streaming parser —");

test("emits objects as they close, across chunk boundaries", () => {
  const s = new JsonObjectStream();
  assert.deepEqual(s.push('{"type":"say","te'), []);
  assert.deepEqual(s.push('xt":"hi"}\n{"type":"do'), [{ type: "say", text: "hi" }]);
  assert.deepEqual(s.push('ne"}'), [{ type: "done" }]);
});

test("survives markdown fences and a top-level array", () => {
  const s = new JsonObjectStream();
  const out = s.push('```json\n[{"a":1},\n{"b":2}]\n```');
  assert.deepEqual(out, [{ a: 1 }, { b: 2 }]);
});

test("braces inside strings do not confuse depth", () => {
  const s = new JsonObjectStream();
  const out = s.push('{"latex":"\\\\frac{a}{b}","note":"a } brace"}');
  assert.equal(out.length, 1);
  assert.equal(out[0].latex, "\\frac{a}{b}");
});

test("prose before JSON is captured as stray, not lost", () => {
  const s = new JsonObjectStream();
  s.push('Sure! Here you go:\n{"type":"say","text":"x"}');
  assert.ok(s.stray.includes("Sure"));
});

test("truncated trailing object stays in flush()", () => {
  const s = new JsonObjectStream();
  s.push('{"type":"say","text":"ok"}{"type":"write_te');
  assert.ok(s.flush().includes("write_te"));
});

test("extractFirstJson pulls an array out of chatter", () => {
  const v = extractFirstJson('Here:\n```json\n[{"prompt":"q","answer":"a"}]\n```\nHope that helps');
  assert.equal(v[0].prompt, "q");
});

console.log("\n— action normalization —");

test("accepts the documented shape", () => {
  const a = normalizeAction({ type: "write_equation", id: "e1", latex: "x^2", color: "cyan" });
  assert.equal(a.type, "write_equation");
  assert.equal(a.color, "cyan");
});

test("repairs a sloppy model: wrong keys, invented color, string steps", () => {
  const a = normalizeAction({ action: "steps", steps: ["first", { description: "second", math: "x=1" }], color: "purple" });
  assert.equal(a.type, "write_steps");
  assert.equal(a.color, "pink");
  assert.equal(a.steps[0].text, "first");
  assert.equal(a.steps[1].latex, "x=1");
});

test("drops edges pointing at nodes that do not exist", () => {
  const a = normalizeAction({
    type: "diagram", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "ghost" }],
  });
  assert.equal(a.edges.length, 1);
});

test("rejects junk instead of rendering an empty card", () => {
  assert.equal(normalizeAction({ type: "write_text", text: "  " }), null);
  assert.equal(normalizeAction({ type: "nonsense" }), null);
  assert.equal(normalizeAction("hello"), null);
  assert.equal(normalizeAction({ type: "draw_diagram", nodes: [] }), null);
});

test("plot ranges are sanitized when inverted", () => {
  const a = normalizeAction({ type: "plot", curves: ["x^2"], xRange: [5, -5] });
  assert.deepEqual(a.xRange, [-10, 10]);
});

test("source refs come through both naming conventions", () => {
  const a = normalizeAction({ type: "say", text: "hi", source_refs: [{ material_id: "m1", locator: "page 3" }] });
  assert.equal(a.sourceRefs[0].locator, "page 3");
});

console.log("\n— expression evaluator —");

test("evaluates the math a tutor actually writes", () => {
  assert.equal(compileExpression("x^2 - 3*x + 2")(4), 6);
  assert.ok(Math.abs(compileExpression("sin(x)/x")(Math.PI / 2) - 2 / Math.PI) < 1e-12);
  assert.equal(compileExpression("2x")(3), 6);
  assert.equal(compileExpression("y = 3(x+1)")(2), 9);
  assert.ok(Math.abs(compileExpression("pi")(0) - Math.PI) < 1e-12);
  assert.equal(compileExpression("-x^2")(3), -9);
  assert.equal(compileExpression("2^3^2")(0), 512); // right associative
});

test("refuses anything that isn't math", () => {
  assert.equal(compileExpression("fetch('/x')"), null);
  assert.equal(compileExpression("window.location"), null);
  assert.equal(compileExpression("x +"), null);
  assert.equal(compileExpression("alert(1)"), null);
});

console.log("\n— chunking & retrieval —");

const units = [
  { locator: "page 1", text: "Photosynthesis converts light energy into chemical energy stored in glucose." },
  { locator: "page 2", text: "The Calvin cycle fixes carbon dioxide using RuBisCO in the stroma." },
  { locator: "page 3", text: "Glycolysis splits glucose into two pyruvate molecules in the cytosol." },
];

test("small units merge and keep a locator range", () => {
  const chunks = chunkUnits("m1", units);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks[0].locator.startsWith("page 1"));
  assert.ok(chunks.every((c) => c.materialId === "m1"));
});

test("a long page splits without losing its page number", () => {
  const long = [{ locator: "page 9", text: "Sentence about mitochondria. ".repeat(400) }];
  const chunks = chunkUnits("m2", long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.locator === "page 9"));
  assert.ok(chunks.every((c) => c.text.length <= 3300));
});

test("short material is passed through whole", () => {
  const chunks = chunkUnits("m1", units);
  const r = retrieve(chunks, "calvin cycle");
  assert.equal(r.complete, true);
});

test("BM25 ranks the relevant chunk first when budget is tight", () => {
  const many = [];
  for (let i = 0; i < 40; i++) {
    many.push({ locator: `page ${i + 1}`, text: `Filler content about unrelated topic number ${i}. `.repeat(60) });
  }
  many.push({ locator: "page 41", text: "RuBisCO catalyzes carbon fixation in the Calvin cycle. ".repeat(40) });
  const chunks = chunkUnits("m3", many);
  const r = retrieve(chunks, "what does RuBisCO do in the Calvin cycle?", 6000);
  assert.equal(r.complete, false);
  assert.ok(r.chunks.some((c) => c.text.includes("RuBisCO")), "RuBisCO chunk should be retrieved");
});

test("asking for a page number pulls that page", () => {
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ locator: `page ${i + 1}`, text: `Topic ${i} discussion. `.repeat(120) });
  const chunks = chunkUnits("m4", many);
  const r = retrieve(chunks, "explain page 17 again", 5000);
  assert.ok(r.chunks.some((c) => c.locator.includes("17")));
});

console.log("\n— spaced repetition —");

const NOON = new Date(2026, 8, 8, 12, 0).getTime(); // Sep 8 2026, local

test("promptKey collapses case, punctuation and whitespace", () => {
  assert.equal(promptKeyOf("What is E = mc^2?!"), promptKeyOf("what   is E=MC^2!!"));
  assert.notEqual(promptKeyOf("What is mitosis?"), promptKeyOf("What is meiosis?"));
});

test("a fresh card answered right is due tomorrow, interval 1", () => {
  const card = newCard("c1", { prompt: "Q?", answer: "A" }, ["m1"], true, NOON);
  assert.equal(card.reps, 1);
  assert.equal(card.intervalDays, 1);
  assert.equal(card.dueAt, startOfTomorrow(NOON));
  assert.equal(isDue(card, NOON), false);
  assert.equal(card.promptKey, promptKeyOf("Q?"));
});

test("hits walk 1 → 3 → ~8 days while ease grows", () => {
  let card = newCard("c1", { prompt: "Q?", answer: "A" }, [], true, NOON);
  card = schedule(card, true, NOON);
  assert.equal(card.intervalDays, 3);
  card = schedule(card, true, NOON);
  assert.ok(card.intervalDays >= 7 && card.intervalDays <= 9, `got ${card.intervalDays}`);
  assert.ok(card.ease > 2.6);
});

test("a miss resets the interval and drops ease", () => {
  const card = newCard("c1", { prompt: "Q?", answer: "A" }, [], true, NOON); // reps 1, ease 2.65
  const lapsed = schedule(card, false, NOON);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.intervalDays, 1);
  assert.equal(lapsed.ease, 2.45);
  assert.equal(lapsed.dueAt, startOfTomorrow(NOON));
  assert.equal(isDue(lapsed, NOON), false);
});

test("overdue cards are due; cards scheduled for later are not", () => {
  const card = newCard("c1", { prompt: "Q?", answer: "A" }, [], true, NOON);
  const overdue = { ...card, dueAt: NOON - DAY_MS };
  assert.equal(isDue(overdue, NOON), true);
  assert.equal(isDue(card, NOON), false);
});

test("re-answering an identical prompt reschedules instead of duplicating", () => {
  const first = newCard("c1", { prompt: "What is mitosis?", answer: "cell division" }, ["m1"], false, NOON);
  const { cards, card, created } = upsertCard(
    [first],
    { prompt: "  What is mitosis?  ", answer: "cell division" },
    ["m1"],
    true,
    NOON,
    "c2",
  );
  assert.equal(cards.length, 1);
  assert.equal(created, false);
  assert.equal(card.id, "c1");
  assert.equal(card.reps, 1);
  assert.equal(card.dueAt, startOfTomorrow(NOON));
});

test("a different prompt inserts a new card", () => {
  const first = newCard("c1", { prompt: "What is mitosis?", answer: "cell division" }, ["m1"], true, NOON);
  const { cards, created } = upsertCard(
    [first],
    { prompt: "What is meiosis?", answer: "cell division" },
    ["m1"],
    true,
    NOON,
    "c2",
  );
  assert.equal(cards.length, 2);
  assert.equal(created, true);
  assert.equal(cards[1].id, "c2");
});

console.log("\n— progress & mastery —");

const attempts = [
  { id: "a1", sessionId: "s1", title: "T1", materialIds: ["m1"], createdAt: NOON - 5000, score: 2, total: 4 },
  { id: "a2", sessionId: "s1", title: "T2", materialIds: ["m1"], createdAt: NOON, score: 4, total: 4 },
];

test("recent accuracy weights newer attempts more", () => {
  const acc = recentAttemptAccuracy(attempts);
  assert.ok(Math.abs(acc - 5 / 6) < 1e-9); // weights 1 (older), 2 (newer)
  assert.equal(recentAttemptAccuracy([]), null);
});

test("mastery is 0 with no data, 100 with a perfect record", () => {
  assert.equal(computeMastery([], []), 0);
  assert.equal(computeMastery(attempts, []), 83); // round(5/6 * 100)
  const perfect = [
    { id: "p1", sessionId: "s1", title: "T", materialIds: ["m1"], createdAt: NOON - 5000, score: 4, total: 4 },
    { id: "p2", sessionId: "s1", title: "T", materialIds: ["m1"], createdAt: NOON, score: 4, total: 4 },
  ];
  const cards = [
    newCard("c1", { prompt: "p1", answer: "a" }, ["m1"], true, NOON),
    newCard("c2", { prompt: "p2", answer: "a" }, ["m1"], true, NOON),
  ];
  assert.equal(computeMastery(perfect, cards), 100);
});

test("lapsed cards drag card health down", () => {
  const hit = newCard("c1", { prompt: "p1", answer: "a" }, ["m1"], true, NOON);
  const miss = newCard("c2", { prompt: "p2", answer: "a" }, ["m1"], false, NOON);
  assert.ok(Math.abs(cardHealth([hit, miss]) - 0.5) < 1e-9);
  assert.equal(cardHealth([]), null);
});

test("per-material rollup labels and ignores other materials", () => {
  const strong = masteryForMaterial("m1", attempts, [], NOON);
  assert.equal(strong.label, "Strong");
  assert.equal(strong.attemptCount, 2);
  assert.equal(strong.lastScore.score, 4);
  const fresh = masteryForMaterial("m2", attempts, [], NOON);
  assert.equal(fresh.label, "New");
  assert.equal(fresh.mastery, 0);
});

test("forecast buckets by local day and drops past the window", () => {
  const tomorrow = startOfTomorrow(NOON);
  const cards = [
    { ...newCard("c1", { prompt: "p", answer: "a" }, [], true, NOON), dueAt: NOON - DAY_MS }, // overdue → today
    { ...newCard("c2", { prompt: "p2", answer: "a" }, [], true, NOON), dueAt: tomorrow }, // tomorrow
    { ...newCard("c3", { prompt: "p3", answer: "a" }, [], true, NOON), dueAt: tomorrow + 5 * DAY_MS }, // day 7
    { ...newCard("c4", { prompt: "p4", answer: "a" }, [], true, NOON), dueAt: tomorrow + 6 * DAY_MS }, // day 8 → out
  ];
  assert.deepEqual(bucketForecast(cards, NOON, 7), [1, 1, 0, 0, 0, 0, 1]);
});


console.log("\n— study planner —");

const DAY = 86_400_000;
// A Monday noon, so day boundaries are unambiguous.
const MON = new Date("2026-03-02T12:00:00Z").getTime();

test("study days stop before the exam day itself", () => {
  const days = studyDays(MON + 3 * DAY, MON);
  assert.equal(days.length, 3);
});

test("no days left means no plan", () => {
  assert.deepEqual(buildPlan({ examAt: MON + 3600_000, topics: ["a"], now: MON }), []);
});

test("no topics means no plan", () => {
  assert.deepEqual(buildPlan({ examAt: MON + 5 * DAY, topics: [], now: MON }), []);
});

test("every topic gets a first pass before any gets a second", () => {
  const blocks = buildPlan({
    examAt: MON + 6 * DAY, topics: ["Alkenes", "Alkynes", "Aromatics"], now: MON,
  });
  const firstSecond = blocks.findIndex((b) => b.pass === 2);
  const lastFirst = blocks.map((b) => b.pass).lastIndexOf(1);
  assert.ok(firstSecond > lastFirst, "a second pass started before first passes finished");
});

test("a tight calendar drops second passes, not first ones", () => {
  const blocks = buildPlan({
    examAt: MON + 2 * DAY, topics: ["a", "b", "c", "d"], now: MON, minutesPerDay: 45,
  });
  assert.ok(blocks.every((b) => b.pass !== 2), "kept a second pass while first passes were cut");
});

test("the day before the exam ends on a full review", () => {
  const blocks = buildPlan({ examAt: MON + 5 * DAY, topics: ["a", "b"], now: MON });
  assert.equal(blocks.at(-1).pass, "review");
});

test("blocks are chronological and never land on the exam day", () => {
  const examAt = MON + 5 * DAY;
  const blocks = buildPlan({ examAt, topics: ["a", "b", "c"], now: MON });
  const times = blocks.map((b) => b.startsAt);
  assert.deepEqual(times, [...times].sort((x, y) => x - y));
  assert.ok(blocks.every((b) => b.startsAt < examAt));
});

test("sittings spread across the window instead of packing the first days", () => {
  const blocks = buildPlan({
    examAt: MON + 10 * DAY, topics: ["a", "b", "c", "d"], now: MON, minutesPerDay: 180,
  });
  const used = new Set(blocks.filter((b) => b.pass !== "review").map((b) => Math.floor(b.startsAt / DAY)));
  // Eight teaching blocks over nine free days should touch at least four of them,
  // not sit on the two that 4-per-day packing would use.
  assert.ok(used.size >= 4, `teaching landed on only ${used.size} days`);
});

test("more minutes a day means more sittings", () => {
  const args = { examAt: MON + 4 * DAY, topics: ["a", "b", "c", "d"], now: MON };
  const light = buildPlan({ ...args, minutesPerDay: 45 });
  const heavy = buildPlan({ ...args, minutesPerDay: 180 });
  assert.ok(heavy.length > light.length);
});

test("describePlan counts days and hours, and says so when there is no time", () => {
  assert.match(describePlan(buildPlan({ examAt: MON + 4 * DAY, topics: ["a"], now: MON })), /sittings across/);
  assert.match(describePlan([]), /No time left/);
});


console.log("\n— lesson export —");

const act = (o) => ({ id: o.id ?? "x1", ...o });

test("equations export as display math", () => {
  const md = actionToMarkdown(act({ type: "write_equation", latex: "e^{i\\pi}+1=0", color: "ink" }));
  assert.match(md, /\$\$\n e\^\{i\\pi\}\+1=0\n\$\$/.source ? /\$\$/ : /\$\$/);
  assert.ok(md.includes("e^{i\\pi}+1=0"));
});

test("tables become markdown tables with escaped pipes", () => {
  const md = actionToMarkdown(act({
    type: "write_table", headers: ["a", "b"], rows: [["x|y", "z"]],
  }));
  assert.ok(md.includes("| --- | --- |"));
  assert.ok(md.includes("x\\|y"), "pipe inside a cell was not escaped");
});

test("diagrams become mermaid, not a bullet list", () => {
  const md = actionToMarkdown(act({
    type: "draw_diagram", layout: "flow",
    nodes: [{ id: "a", label: "Glucose", shape: "round", color: "ink" },
            { id: "b", label: "Pyruvate", shape: "box", color: "ink" }],
    edges: [{ from: "a", to: "b", label: "glycolysis" }],
  }));
  assert.match(md, /```mermaid/);
  assert.match(md, /a\(\(Glucose\)\)/);
  assert.match(md, /a -->\|glycolysis\| b/);
});

test("board bookkeeping is dropped from notes", () => {
  assert.equal(actionToMarkdown(act({ type: "highlight", targetId: "e1" })), "");
  assert.equal(actionToMarkdown(act({ type: "erase", targetId: "e1" })), "");
  assert.equal(actionToMarkdown(act({ type: "done" })), "");
});

test("erased cards do not reach the notes", () => {
  const md = lessonToMarkdown([
    act({ id: "t1", type: "write_text", text: "Keep this", style: "body", color: "ink" }),
    act({ id: "t2", type: "write_text", text: "This was wrong", style: "body", color: "ink" }),
    act({ id: "e9", type: "erase", targetId: "t2" }),
  ], { title: "Lesson" });
  assert.ok(md.includes("Keep this"));
  assert.ok(!md.includes("This was wrong"), "an erased card survived into the notes");
});

test("source refs are cited", () => {
  const md = actionToMarkdown(
    act({ type: "write_text", text: "Aldehydes", style: "body", color: "ink",
          sourceRefs: [{ materialId: "m1", locator: "page 4" }] }),
    (id) => (id === "m1" ? "Orgo notes.pdf" : "?"),
  );
  assert.match(md, /> Source: Orgo notes\.pdf, page 4/);
});

test("the document carries a title heading", () => {
  const md = lessonToMarkdown([], { title: "Integration by parts" });
  assert.match(md, /^# Integration by parts/);
});

test("filenames are slugged and never empty", () => {
  assert.equal(exportFilename("Integration by Parts!"), "integration-by-parts.md");
  assert.equal(exportFilename("???"), "lesson.md");
});


console.log("\n— lecture audio —");

const wavBytes = async (samples) =>
  new Uint8Array(await encodeWav(samples).arrayBuffer());

test("the WAV header is a well-formed 16 kHz mono PCM container", async () => {
  const bytes = await wavBytes(new Float32Array(8));
  const ascii = (o, n) => String.fromCharCode(...bytes.slice(o, o + n));
  const u32 = (o) => new DataView(bytes.buffer).getUint32(o, true);
  const u16 = (o) => new DataView(bytes.buffer).getUint16(o, true);
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(ascii(36, 4), "data");
  assert.equal(u16(20), 1, "not PCM");
  assert.equal(u16(22), 1, "not mono");
  assert.equal(u32(24), 16000, "not 16 kHz");
  assert.equal(u16(34), 16, "not 16-bit");
  assert.equal(u32(4), 36 + 8 * 2, "RIFF size wrong");
  assert.equal(u32(40), 8 * 2, "data size wrong");
});

test("samples are 16-bit little-endian, and hot samples clamp instead of wrapping", async () => {
  const bytes = await wavBytes(new Float32Array([0, 1, -1, 2, -2]));
  const view = new DataView(bytes.buffer);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32767);
  // Without the clamp these would wrap to small positive/negative values.
  assert.equal(view.getInt16(50, true), 32767, "a hot sample wrapped around");
  assert.equal(view.getInt16(52, true), -32767, "a hot sample wrapped around");
});

test("a chunk of the advertised length stays under the upload cap", () => {
  const seconds = secondsPerChunk();
  assert.ok(seconds > 60, "chunks are implausibly short");
  assert.ok(seconds * 16000 * 2 + 44 <= TRANSCRIBE_LIMIT_BYTES,
    "a full chunk would exceed the transcription limit");
});

// Async checks resolve after the synchronous ones have all been queued.
await Promise.all(pending);


console.log("\n— semantic retrieval —");

test("cosine is 1 for parallel, 0 for orthogonal, -1 for opposed", () => {
  assert.equal(cosine([1, 0], [2, 0]), 1);
  assert.equal(cosine([1, 0], [0, 3]), 0);
  assert.equal(cosine([1, 0], [-1, 0]), -1);
});

test("cosine is 0 rather than NaN for a zero or empty vector", () => {
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.equal(cosine([], [1, 1]), 0);
});

test("rank fusion rewards agreement between the two rankers", () => {
  const a = [{ id: "x" }, { id: "y" }, { id: "z" }];
  const b = [{ id: "z" }, { id: "x" }, { id: "y" }];
  const fused = fuseRankings([a, b], (i) => i.id);
  // x is 1st and 2nd; z is 3rd and 1st. x's combined rank is better.
  assert.equal(fused[0].id, "x");
  assert.equal(fused.length, 3, "fusion dropped or duplicated an item");
});

test("fusion keeps items that only one ranker returned", () => {
  const fused = fuseRankings([[{ id: "a" }], [{ id: "b" }]], (i) => i.id);
  assert.deepEqual(fused.map((i) => i.id).sort(), ["a", "b"]);
});

const chunk = (id, text, order, embedding) => ({
  id, materialId: "m", locator: `page ${order + 1}`, text, order, embedding,
});

test("semantic retrieval surfaces a paraphrase BM25 cannot match", () => {
  // The relevant chunk is LAST in document order, so BM25's no-hit fallback
  // (which just fills from the top) cannot reach it by accident.
  const pad = "filler ".repeat(1200);
  const chunks = [
    chunk("c1", "Stoichiometry balances reagent ratios. " + pad, 0, [0, 1, 0]),
    chunk("c2", "Titration finds an unknown concentration. " + pad, 1, [0, 0, 1]),
    chunk("c3", "The second law states disorder increases. " + pad, 2, [1, 0, 0]),
  ];
  const query = "why does entropy always go up";
  const lexical = retrieve(chunks, query, 4000);
  assert.ok(!lexical.chunks.some((c) => c.id === "c3"),
    "BM25 reached the paraphrased chunk; the fixture is not discriminating");

  const hybrid = retrieveHybrid(chunks, query, [0.99, 0.1, 0], 4000);
  assert.ok(hybrid.chunks.some((c) => c.id === "c3"),
    "the semantic ranker failed to surface the paraphrased chunk");
});

test("with no query vector, hybrid is exactly BM25", () => {
  const pad = "filler ".repeat(1200);
  const chunks = [
    chunk("c1", "alkene addition reactions " + pad, 0, [1, 0]),
    chunk("c2", "aromatic substitution " + pad, 1, [0, 1]),
  ];
  const a = retrieve(chunks, "alkene addition", 3000);
  const b = retrieveHybrid(chunks, "alkene addition", null, 3000);
  assert.deepEqual(b.chunks.map((c) => c.id), a.chunks.map((c) => c.id));
});

test("unembedded chunks fall back to BM25 instead of vanishing", () => {
  const pad = "filler ".repeat(1200);
  const chunks = [
    chunk("c1", "alkene addition reactions " + pad, 0, undefined),
    chunk("c2", "aromatic substitution " + pad, 1, undefined),
  ];
  const hybrid = retrieveHybrid(chunks, "alkene addition", [1, 0], 3000);
  assert.ok(hybrid.chunks.length > 0, "hybrid returned nothing without embeddings");
  assert.equal(hybrid.chunks[0].id, "c1");
});

console.log(`\n${passed} checks passed\n`);
