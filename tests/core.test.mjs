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
import { chunkUnits } from "../.test-build/core/materials/chunk.js";
import { retrieve } from "../.test-build/core/materials/retrieve.js";

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.log("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; }
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

console.log(`\n${passed} checks passed\n`);
