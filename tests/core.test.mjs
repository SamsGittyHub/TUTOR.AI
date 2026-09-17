import assert from "node:assert/strict";
import { JsonObjectStream, extractFirstJson } from "../.test-build/core/stream-json.js";
import { normalizeAction, unescapeBreaks } from "../.test-build/core/actions.js";
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
  rankSubjects,
  RANK_MIN_ANSWERED,
  subjectMastery,
  recentAttemptAccuracy,
} from "../.test-build/core/progress.js";
import { buildPlan, describePlan, studyDays } from "../.test-build/core/planner.js";
import {
  allocateQuestions, confusionByStep, confusionScore, findWeakPoints, isConfusion, topicsOf,
} from "../.test-build/core/weakpoints.js";
import { checkExamAnswer, gradeExam, totalMarks } from "../.test-build/core/exam.js";
import {
  blocksToXml, contentTypesXml, documentRelsXml, documentXml, esc, pxToEmu,
} from "../.test-build/core/docx.js";
import { attachImages, boardToBlocks } from "../.test-build/core/board-doc.js";
import {
  handleRealtimeEvent, sessionUpdateMessage, spokenOnly, toolResultMessages,
} from "../.test-build/core/realtime-events.js";
import { buildBriefing, runVoiceTool, VOICE_TOOLS } from "../.test-build/core/voice-tools.js";
import {
  applyDrawnImage, buildImagePrompt, dimensionsFor, normalizeImageRequest,
  settleUnfinishedImages, sizeFor,
} from "../.test-build/core/board-image.js";
import { needsSanitizing, sanitizeDeep, sanitizeText } from "../.test-build/core/sanitize.js";
import {
  normalizeQuestion, normalizeReview, scoreOf, teachPrompt, weakTopics,
} from "../.test-build/core/exam-review.js";
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


console.log("\n— weak points —");

const said = (role, text) => ({ role, text, at: 0 });
const lesson = (over) => ({
  id: "s1", title: "Integration by parts", createdAt: 0, updatedAt: 0,
  materialIds: ["m1"], providerId: "anthropic", model: "x",
  actions: [], transcript: [], usage: {}, boardTheme: "paper", ...over,
});

test("confusion markers are distinguished from ordinary questions", () => {
  assert.ok(isConfusion("wait, where did that 2 come from"));
  assert.ok(isConfusion("I don't get it"));
  assert.ok(!isConfusion("got it, thanks"));
});

test("a confused turn weighs more than a merely curious one", () => {
  const confused = confusionScore([said("student", "wait, I'm lost")]);
  const curious = confusionScore([said("student", "is that always true?")]);
  assert.ok(confused > curious, "confusion did not outweigh a plain question");
});

test("tutor turns never count as confusion", () => {
  assert.equal(confusionScore([said("tutor", "wait, I don't understand?")]), 0);
});

test("topics come from the lesson plan when there is one", () => {
  const s = lesson({ plan: { title: "t", steps: ["Where it comes from", "Picking u"], currentIndex: 0 } });
  assert.deepEqual(topicsOf(s), ["Where it comes from", "Picking u"]);
});

test("topics fall back to board titles, then the lesson title", () => {
  const withTitles = lesson({ actions: [
    { id: "a", type: "write_text", text: "Alkene addition", style: "title", color: "ink" },
  ]});
  assert.deepEqual(topicsOf(withTitles), ["Alkene addition"]);
  assert.deepEqual(topicsOf(lesson({})), ["Integration by parts"]);
});

test("confusion is attributed to the step it happened on", () => {
  const s = lesson({
    plan: { title: "t", steps: ["Step one", "Step two"], currentIndex: 1 },
    actions: [{ id: "d1", type: "done", stepIndex: 0 }, { id: "d2", type: "done", stepIndex: 1 }],
    transcript: [said("student", "ok"), said("student", "wait, I'm totally lost")],
  });
  const perStep = confusionByStep(s);
  assert.ok((perStep.get(1) ?? 0) > 0, "confusion did not land on step two");
  assert.ok(!perStep.get(0), "an untroubled step picked up confusion");
});

test("the topic a student got stuck on outranks one they sailed through", () => {
  const s = lesson({
    plan: { title: "t", steps: ["Easy bit", "Hard bit"], currentIndex: 1 },
    actions: [{ id: "d1", type: "done", stepIndex: 0 }, { id: "d2", type: "done", stepIndex: 1 }],
    transcript: [said("student", "makes sense"), said("student", "wait, I don't understand")],
  });
  const weak = findWeakPoints({ sessions: [s], cards: [], attempts: [] });
  assert.equal(weak[0].topic, "Hard bit");
  assert.ok(weak[0].reasons.length > 0, "no reason was recorded");
});

test("every covered topic still appears, even an untroubled one", () => {
  const s = lesson({ plan: { title: "t", steps: ["A", "B"], currentIndex: 0 } });
  const topics = findWeakPoints({ sessions: [s], cards: [], attempts: [] }).map((w) => w.topic);
  assert.deepEqual(topics.sort(), ["A", "B"]);
});

test("lapsed cards and low scores raise weight; unrelated material is ignored", () => {
  const s = lesson({ plan: { title: "t", steps: ["A"], currentIndex: 0 } });
  const card = { id: "c", promptKey: "k", materialIds: ["m1"], prompt: "Nucleophile?",
    answer: "a", createdAt: 0, dueAt: 0, intervalDays: 1, ease: 2.5, reps: 1, lapses: 3 };
  const other = { ...card, id: "c2", promptKey: "k2", materialIds: ["OTHER"], prompt: "Elsewhere" };
  const weak = findWeakPoints({
    sessions: [s], cards: [card, other],
    attempts: [{ id: "a", sessionId: "s1", title: "Midterm practice", materialIds: ["m1"],
                 createdAt: 0, score: 2, total: 10 }],
  });
  const topics = weak.map((w) => w.topic);
  assert.ok(topics.includes("Nucleophile?"), "a lapsed card did not surface");
  assert.ok(topics.includes("Midterm practice"), "a failed quiz did not surface");
  assert.ok(!topics.includes("Elsewhere"), "a card from unrelated material leaked in");
});

test("question allocation spends the whole budget and starves nothing", () => {
  const weak = [
    { topic: "A", weight: 10, reasons: [], materialIds: [] },
    { topic: "B", weight: 1, reasons: [], materialIds: [] },
    { topic: "C", weight: 1, reasons: [], materialIds: [] },
  ];
  const out = allocateQuestions(weak, 12);
  assert.equal(out.reduce((s, x) => s + x.count, 0), 12, "budget was not spent exactly");
  assert.ok(out.every((x) => x.count >= 1), "a selected topic got no questions");
  assert.ok(out[0].count > out[1].count, "the weakest topic was not weighted highest");
});

console.log("\n— practice exam —");

const q = (over) => ({ id: "q1", kind: "short_answer", prompt: "?", answer: "x", marks: 2, ...over });
const paper = (questions) => ({
  id: "e1", title: "Paper", createdAt: 0, sessionIds: [], materialIds: [], minutes: 60, focus: [],
  sections: [{ id: "A", title: "Section A", questions }],
});

test("answers match leniently, including a multiple-choice letter", () => {
  assert.equal(checkExamAnswer(q({ answer: "4x" }), " 4X "), true);
  assert.equal(checkExamAnswer(q({ answer: "4x" }), "5x"), false);
  assert.equal(checkExamAnswer(
    q({ kind: "multiple_choice", choices: ["red", "blue"], answer: "blue" }), "b"), true);
});

test("a blank answer is wrong, not unmarkable", () => {
  assert.equal(checkExamAnswer(q({}), "   "), false);
});

test("worked questions are never auto-marked", () => {
  assert.equal(checkExamAnswer(q({ kind: "worked" }), "anything"), null);
});

test("marks total across sections", () => {
  assert.equal(totalMarks(paper([q({ id: "a", marks: 3 }), q({ id: "b", marks: 7 })])), 10);
});

test("grading awards marks, not question counts", () => {
  const exam = paper([q({ id: "a", answer: "yes", marks: 9 }), q({ id: "b", answer: "no", marks: 1 })]);
  const result = gradeExam(exam, { a: "yes", b: "wrong" });
  assert.equal(result.awarded, 9);
  assert.equal(result.total, 10);
  assert.equal(result.percent, 90);
});

test("an all-worked paper does not read as 0%", () => {
  const exam = paper([q({ id: "a", kind: "worked", marks: 10 })]);
  const result = gradeExam(exam, { a: "my derivation" });
  assert.equal(result.total, 0, "unmarkable questions inflated the denominator");
  assert.equal(result.percent, 0);
});

test("missed topics are reported worst-first", () => {
  const exam = paper([
    q({ id: "a", topic: "Alkenes", answer: "1" }),
    q({ id: "b", topic: "Alkenes", answer: "2" }),
    q({ id: "c", topic: "Aromatics", answer: "3" }),
  ]);
  const result = gradeExam(exam, { a: "x", b: "y", c: "3" });
  assert.equal(result.weakestTopics[0], "Alkenes");
  assert.ok(!result.weakestTopics.includes("Aromatics"));
});


console.log("\n— docx writer —");

test("XML escaping handles ampersands without double-escaping", () => {
  assert.equal(esc('a & b < c > d "e"'), "a &amp; b &lt; c &gt; d &quot;e&quot;");
  assert.equal(esc("&lt;"), "&amp;lt;");
});

test("text is escaped inside runs, so a stray < cannot break the document", () => {
  const xml = blocksToXml([{ kind: "paragraph", text: "if x < 3 && y > 2" }]);
  assert.ok(xml.includes("&lt;"), "less-than was not escaped");
  assert.ok(xml.includes("&amp;&amp;"), "ampersands were not escaped");
  assert.ok(!/<w:t[^>]*>[^<]*<[^\/w]/.test(xml), "raw markup leaked into a text run");
});

test("runs preserve whitespace, or Word eats leading spaces", () => {
  assert.ok(blocksToXml([{ kind: "paragraph", text: " x " }])
    .includes('xml:space="preserve"'));
});

test("pixels convert to EMU at 96dpi", () => {
  assert.equal(pxToEmu(96), 914400);
  assert.equal(pxToEmu(0), 0);
});

test("a table emits one row per data row plus a header", () => {
  const xml = blocksToXml([{ kind: "table", headers: ["A", "B"], rows: [["1", "2"], ["3", "4"]] }]);
  assert.equal((xml.match(/<w:tr>/g) || []).length, 3);
});

test("short rows are padded so the table does not skew", () => {
  const xml = blocksToXml([{ kind: "table", headers: ["A", "B", "C"], rows: [["1"]] }]);
  const firstBodyRow = xml.split("<w:tr>")[2];
  assert.equal((firstBodyRow.match(/<w:tc>/g) || []).length, 3);
});

test("image relationship ids match the ids referenced in the body", () => {
  const img = { data: new Uint8Array([1]), widthPx: 100, heightPx: 50 };
  const body = blocksToXml([{ kind: "image", image: img }, { kind: "image", image: img }]);
  const rels = documentRelsXml(2);
  for (const id of ["rId101", "rId102"]) {
    assert.ok(body.includes(`r:embed="${id}"`), `body missing ${id}`);
    assert.ok(rels.includes(`Id="${id}"`), `rels missing ${id}`);
  }
});

test("the png content type is declared only when there are images", () => {
  assert.ok(contentTypesXml(1).includes('Extension="png"'));
  assert.ok(!contentTypesXml(0).includes('Extension="png"'));
});

test("the document is a single well-formed root with a section", () => {
  const xml = documentXml([{ kind: "heading", text: "T", level: 1 }]);
  assert.ok(xml.startsWith("<?xml"));
  assert.equal((xml.match(/<w:body>/g) || []).length, 1);
  assert.ok(xml.includes("<w:sectPr>"), "no page setup emitted");
  // Every opened paragraph is closed.
  assert.equal((xml.match(/<w:p>/g) || []).length, (xml.match(/<\/w:p>/g) || []).length);
});

console.log("\n— board to document —");

const a = (o) => ({ id: "x", ...o });

test("erased cards never reach the document", () => {
  const { blocks } = boardToBlocks([
    a({ id: "t1", type: "write_text", text: "Keep", style: "body", color: "ink" }),
    a({ id: "t2", type: "write_text", text: "Wrong", style: "body", color: "ink" }),
    a({ id: "e1", type: "erase", targetId: "t2" }),
  ], { title: "L" });
  const text = JSON.stringify(blocks);
  assert.ok(text.includes("Keep"));
  assert.ok(!text.includes("Wrong"), "an erased card survived");
});

test("board bookkeeping produces no blocks", () => {
  const { blocks } = boardToBlocks([
    a({ type: "highlight", targetId: "q" }), a({ type: "done" }),
  ], { title: "L" });
  // Only the title heading.
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "heading");
});

test("a diagram becomes an image when it can be rasterised", () => {
  const diagram = a({ id: "d1", type: "draw_diagram", layout: "flow",
    nodes: [{ id: "n1", label: "Glucose", shape: "box", color: "ink" }], edges: [] });
  const { blocks, pending } = boardToBlocks([diagram], {
    title: "L", rasterisable: new Set(["d1"]),
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].actionId, "d1");
  assert.ok(blocks.some((b) => b.kind === "image"));
});

test("a diagram that cannot be rasterised is described, not dropped", () => {
  const diagram = a({ id: "d1", type: "draw_diagram", layout: "flow", title: "Respiration",
    nodes: [{ id: "n1", label: "Glucose", shape: "box", color: "ink" },
            { id: "n2", label: "Pyruvate", shape: "box", color: "ink" }],
    edges: [{ from: "n1", to: "n2", label: "glycolysis" }] });
  const { blocks, pending } = boardToBlocks([diagram], { title: "L" });
  assert.equal(pending.length, 0);
  const text = JSON.stringify(blocks);
  assert.ok(text.includes("Glucose → Pyruvate"), "the edge was not described");
  assert.ok(text.includes("glycolysis"));
});

test("images are attached in the order they were emitted", () => {
  const d = (id) => a({ id, type: "draw_diagram", layout: "flow", nodes: [], edges: [] });
  const { blocks } = boardToBlocks([d("d1"), d("d2")], {
    title: "L", rasterisable: new Set(["d1", "d2"]),
  });
  const out = attachImages(blocks, [
    { data: new Uint8Array([1]), widthPx: 10, heightPx: 5 },
    { data: new Uint8Array([2]), widthPx: 20, heightPx: 9 },
  ]);
  const images = out.filter((b) => b.kind === "image");
  assert.equal(images[0].image.widthPx, 10);
  assert.equal(images[1].image.widthPx, 20);
});

test("a card that failed to rasterise is dropped, not shipped empty", () => {
  const d = a({ id: "d1", type: "draw_diagram", layout: "flow", nodes: [], edges: [] });
  const { blocks } = boardToBlocks([d], { title: "L", rasterisable: new Set(["d1"]) });
  const out = attachImages(blocks, [{ data: new Uint8Array(), widthPx: 0, heightPx: 0 }]);
  assert.equal(out.filter((b) => b.kind === "image").length, 0,
    "a zero-byte image would make Word refuse the file");
});


console.log("\n— storage sanitizing —");

const NUL = String.fromCharCode(0);

test("the null byte Postgres rejects is stripped", () => {
  assert.equal(sanitizeText(`page${NUL} one`), "page one");
  assert.ok(!sanitizeText(`a${NUL}b`).includes(NUL));
});

test("whitespace collapse alone would never have caught it", () => {
  // This is what every extractor already did, and why the bug survived.
  assert.ok(`a${NUL}b`.replace(/\s+/g, " ").includes(NUL));
});

test("tabs and newlines survive — they are real formatting", () => {
  assert.equal(sanitizeText("a\tb\nc\r\nd"), "a\tb\nc\r\nd");
});

test("other C0 controls and DEL are stripped", () => {
  const junk = String.fromCharCode(1, 8, 11, 12, 27, 31, 127);
  assert.equal(sanitizeText(`x${junk}y`), "xy");
});

test("lone surrogates go; real astral characters stay", () => {
  assert.equal(sanitizeText("a\uD800b"), "ab");
  assert.equal(sanitizeText("a\uDC00b"), "ab");
  assert.equal(sanitizeText("emoji \u{1F600} ok"), "emoji \u{1F600} ok");
});

test("ordinary text is returned untouched", () => {
  const text = "Nucleophilic addition — ∫u dv = uv − ∫v du (page 214)";
  assert.equal(sanitizeText(text), text);
});

test("needsSanitizing detects, and does not drift between calls", () => {
  assert.equal(needsSanitizing("clean"), false);
  assert.equal(needsSanitizing(`dirty${NUL}`), true);
  // Global regexes keep lastIndex; calling twice must give the same answer.
  assert.equal(needsSanitizing(`dirty${NUL}`), true);
  assert.equal(needsSanitizing("clean"), false);
});

test("sanitizeDeep cleans nested strings, keys, and arrays", () => {
  const dirty = {
    [`k${NUL}ey`]: `v${NUL}alue`,
    list: [`a${NUL}`, { deep: `b${NUL}` }],
    number: 42,
    nothing: null,
  };
  const clean = sanitizeDeep(dirty);
  assert.deepEqual(clean, { key: "value", list: ["a", { deep: "b" }], number: 42, nothing: null });
  assert.ok(!JSON.stringify(clean).includes(NUL), "a null survived into the jsonb payload");
});

test("sanitizeDeep leaves a clean board action identical", () => {
  const action = { id: "eq1", type: "write_equation", latex: "\\int u\\,dv", color: "cyan" };
  assert.deepEqual(sanitizeDeep(action), action);
});


console.log("\n— exam review —");

const rq = (o) => ({ number: "Q1", verdict: "wrong", prompt: "p", ...o });

test("a row with nothing but a number is dropped", () => {
  assert.equal(normalizeQuestion({ number: "Q1" }, 0), null);
  assert.ok(normalizeQuestion({ number: "Q1", wentWrong: "sign error" }, 0));
});

test("an unknown verdict becomes 'unclear', never a guess", () => {
  assert.equal(normalizeQuestion(rq({ verdict: "maybe" }), 0).verdict, "unclear");
  assert.equal(normalizeQuestion(rq({ verdict: "PARTIAL" }), 0).verdict, "partial");
});

test("snake_case and camelCase both parse", () => {
  const q = normalizeQuestion({ number: "Q2", your_answer: "3x", went_wrong: "dropped a term",
                                marks_awarded: 1, marks_available: 3 }, 1);
  assert.equal(q.given, "3x");
  assert.equal(q.wentWrong, "dropped a term");
  assert.equal(q.marksAwarded, 1);
  assert.equal(q.marksAvailable, 3);
});

test("awarded marks can never exceed the marks available", () => {
  const q = normalizeQuestion(rq({ marksAwarded: 5, marksAvailable: 3 }), 0);
  assert.equal(q.marksAwarded, 3);
});

test("nulls from a scanned page are stripped out of the text", () => {
  const NUL = String.fromCharCode(0);
  const q = normalizeQuestion(rq({ wentWrong: `sign${NUL} error` }), 0);
  assert.equal(q.wentWrong, "sign error");
});

test("a review with no usable questions is rejected", () => {
  assert.equal(normalizeReview({ summary: "ok", questions: [] }), null);
  assert.equal(normalizeReview(null), null);
  assert.ok(normalizeReview({ summary: "s", questions: [rq({ wentWrong: "x" })] }));
});

test("the score sums marks rather than counting questions", () => {
  const review = { summary: "", questions: [
    rq({ verdict: "correct", marksAwarded: 6, marksAvailable: 6 }),
    rq({ verdict: "wrong",   marksAwarded: 0, marksAvailable: 4 }),
  ]};
  const s = scoreOf(review);
  assert.equal(s.awarded, 6);
  assert.equal(s.total, 10);
  assert.equal(s.percent, 60);
});

test("a correct answer with no awarded marks still earns them", () => {
  const s = scoreOf({ summary: "", questions: [rq({ verdict: "correct", marksAvailable: 5 })] });
  assert.equal(s.awarded, 5);
});

test("unreadable questions lower confidence, not the grade", () => {
  const s = scoreOf({ summary: "", questions: [
    rq({ verdict: "correct", marksAwarded: 4, marksAvailable: 4 }),
    rq({ verdict: "unclear", marksAvailable: 6 }),
  ]});
  assert.equal(s.total, 4, "an unreadable question was counted against the student");
  assert.equal(s.percent, 100);
  assert.equal(s.unclear, 1);
});

test("weak topics rank by marks lost, not by number of slips", () => {
  const review = { summary: "", questions: [
    rq({ topic: "Integration", verdict: "wrong", marksAwarded: 0, marksAvailable: 8,
         wentWrong: "wrong substitution" }),
    rq({ topic: "Algebra", verdict: "wrong", marksAwarded: 1, marksAvailable: 2, wentWrong: "sign" }),
    rq({ topic: "Algebra", verdict: "partial", marksAwarded: 1, marksAvailable: 2, wentWrong: "sign" }),
  ]};
  const topics = weakTopics(review);
  assert.equal(topics[0].topic, "Integration");
  assert.equal(topics[0].lost, 8);
  assert.equal(topics[1].count, 2, "the two Algebra slips did not merge");
  assert.deepEqual(topics[1].reasons, ["sign"], "an identical reason was repeated");
});

test("correct and unclear questions never become revision topics", () => {
  const topics = weakTopics({ summary: "", questions: [
    rq({ topic: "Fine", verdict: "correct", marksAvailable: 3 }),
    rq({ topic: "Blurry", verdict: "unclear", marksAvailable: 3 }),
  ]});
  assert.equal(topics.length, 0);
});

test("the teach prompt carries the student's own answer and the error", () => {
  const prompt = teachPrompt(rq({ number: "Q3(b)", given: "x^2", expected: "2x",
                                  wentWrong: "differentiated instead of integrating" }));
  assert.ok(prompt.includes("Q3(b)"));
  assert.ok(prompt.includes("x^2"));
  assert.ok(prompt.includes("differentiated instead of integrating"));
  assert.ok(/not just the correction/.test(prompt), "it asks only for the fix");
});


console.log("\n— over-escaped line breaks —");

test("a literal backslash-n becomes a real break", () => {
  assert.equal(unescapeBreaks("P: n x n \\nfull matrix"), "P: n x n \nfull matrix");
  assert.equal(unescapeBreaks("a\\r\\nb"), "a\nb");
});

test("text with no escapes is returned untouched", () => {
  assert.equal(unescapeBreaks("plain label"), "plain label");
});

test("diagram node labels are unescaped", () => {
  const action = normalizeAction({
    type: "draw_diagram", layout: "row",
    nodes: [{ id: "a", label: "P: n x n \\nfull matrix", shape: "round", color: "pink" }],
    edges: [],
  });
  assert.ok(action.nodes[0].label.includes("\n"), "label kept the literal escape");
  assert.ok(!action.nodes[0].label.includes("\\n"), "a literal backslash-n survived");
});

test("a bare-string node label is unescaped too", () => {
  const action = normalizeAction({
    type: "draw_diagram", layout: "row", nodes: ["one\\ntwo"], edges: [],
  });
  assert.ok(action.nodes[0].label.includes("\n"));
});

test("LaTeX is never touched — \\neq stays a command", () => {
  const action = normalizeAction({
    type: "write_equation", latex: "a \\neq b \\nabla f", color: "cyan",
  });
  assert.equal(action.latex, "a \\neq b \\nabla f");
  assert.ok(!action.latex.includes("\n"), "a backslash command became a line break");
});

test("steps keep their latex while their prose is unescaped", () => {
  const action = normalizeAction({
    type: "write_steps", color: "ink",
    steps: [{ text: "first\\nsecond", latex: "x \\neq y" }],
  });
  assert.ok(action.steps[0].text.includes("\n"), "step prose kept the escape");
  assert.equal(action.steps[0].latex, "x \\neq y");
});

test("plot expressions are left alone", () => {
  const action = normalizeAction({
    type: "draw_plot", xRange: [0, 1],
    curves: [{ expr: "x*exp(x)", label: "f\\ng", color: "cyan" }], points: [],
  });
  assert.equal(action.curves[0].expr, "x*exp(x)");
  assert.ok(action.curves[0].label.includes("\n"));
});


console.log("\n— subject ranking —");

const subj = (id, name, materialIds) => ({ id, name, color: "cyan", materialIds });
const att = (materialIds, score, total, createdAt = 1) =>
  ({ materialIds, score, total, createdAt });

test("strongest subject ranks above the weakest", () => {
  const ranked = rankSubjects(
    [subj("s1", "Maths", ["m1"]), subj("s2", "Chem", ["m2"])],
    [att(["m1"], 10, 10), att(["m1"], 9, 10),
     att(["m2"], 2, 10), att(["m2"], 3, 10)],
    [],
  );
  assert.equal(ranked[0].name, "Maths");
  assert.equal(ranked.at(-1).name, "Chem");
  assert.ok(ranked[0].mastery > ranked.at(-1).mastery);
});

test("a twenty-question paper outweighs a four-question one", () => {
  // Same two results either way; only the sizes differ. Weighting by attempt
  // alone would score these identically.
  const bigGood = subjectMastery({ attempts: [att(["m"], 20, 20, 2), att(["m"], 0, 4, 1)], cards: [] });
  const bigBad  = subjectMastery({ attempts: [att(["m"], 0, 20, 2), att(["m"], 4, 4, 1)], cards: [] });
  assert.ok(bigGood.mastery > bigBad.mastery,
    "the larger paper did not dominate");
  assert.equal(bigGood.answered, 24);
  assert.equal(bigGood.correct, 20);
});

test("recent work counts for more than old work", () => {
  const improving = subjectMastery({ attempts: [att(["m"], 10, 10, 100), att(["m"], 0, 10, 1)], cards: [] });
  const declining = subjectMastery({ attempts: [att(["m"], 0, 10, 100), att(["m"], 10, 10, 1)], cards: [] });
  assert.ok(improving.mastery > declining.mastery,
    "recency was ignored — the same two scores scored the same");
});

test("one bad afternoon doesn't erase a long good record", () => {
  const history = Array.from({ length: 8 }, (_, i) => att(["m"], 10, 10, i + 1));
  const withSlip = subjectMastery({ attempts: [...history, att(["m"], 0, 10, 99)], cards: [] });
  assert.ok(withSlip.mastery > 50,
    `a single bad quiz dropped a strong record to ${withSlip.mastery}`);
});

test("practice exam results count alongside quizzes", () => {
  const quizOnly = subjectMastery({ attempts: [att(["m"], 5, 10, 1)], cards: [] });
  const withExam = subjectMastery({
    attempts: [att(["m"], 5, 10, 1)], cards: [],
    papers: [{ materialIds: ["m"], awarded: 40, total: 40, createdAt: 2 }],
  });
  assert.ok(withExam.mastery > quizOnly.mastery, "a full paper was ignored");
  assert.equal(withExam.answered, 50);
});

test("answered questions gate the ranking, not the number of quizzes", () => {
  // Three tiny quizzes: plenty of attempts, barely any questions.
  const tiny = [att(["m1"], 1, 2), att(["m1"], 1, 2), att(["m1"], 1, 2)];
  const one = [att(["m1"], 6, 12)];
  assert.equal(rankSubjects([subj("s", "S", ["m1"])], tiny, [])[0].confident, false);
  assert.equal(rankSubjects([subj("s", "S", ["m1"])], one, [])[0].confident, true);
  assert.ok(RANK_MIN_ANSWERED > 2);
});

test("an unranked subject never outranks a ranked one", () => {
  const ranked = rankSubjects(
    [subj("s1", "Maths", ["m1"]), subj("s2", "New", ["m2"])],
    [att(["m1"], 3, 20), att(["m2"], 1, 1)],
    [],
  );
  assert.equal(ranked[0].name, "Maths");
  assert.equal(ranked.at(-1).confident, false);
});

test("attempts on other subjects' material don't count", () => {
  const ranked = rankSubjects([subj("s1", "Maths", ["m1"])],
    [att(["OTHER"], 0, 20), att(["OTHER"], 0, 20)], []);
  assert.equal(ranked[0].answered, 0, "an unrelated quiz leaked into the subject");
});

test("forgotten cards are surfaced per subject", () => {
  const card = (lapses) => ({ id: "c" + lapses, promptKey: "k" + lapses,
    materialIds: ["m1"], prompt: "p", answer: "a", createdAt: 0, dueAt: 0,
    intervalDays: 1, ease: 2.5, reps: 1, lapses });
  const ranked = rankSubjects([subj("s1", "Maths", ["m1"])], [], [card(2), card(1)], 10_000);
  assert.equal(ranked[0].cards, 2);
  assert.equal(ranked[0].dueNow, 2);
  assert.equal(ranked[0].lapses, 3);
});

test("a subject with no material at all still appears", () => {
  const ranked = rankSubjects([subj("s1", "Empty", [])], [], []);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].confident, false);
});


console.log("\n— live voice events —");

function collect(message, runTool, seenCalls = new Set()) {
  const seen = { actions: [], lines: [], speaking: [], acks: [], outputs: [], errors: [] };
  handleRealtimeEvent(message, {
    seenCalls,
    onAction: (a) => seen.actions.push(a),
    onTranscript: (role, text) => seen.lines.push([role, text]),
    onSpeaking: (v) => seen.speaking.push(v),
    onToolResult: (id, output) => {
      seen.acks.push(id);
      seen.outputs.push(output);
    },
    runTool,
    onError: (m) => seen.errors.push(m),
  });
  return seen;
}

test("GA audio events drive the speaking indicator", () => {
  assert.deepEqual(collect({ type: "response.output_audio.delta" }).speaking, [true]);
  assert.deepEqual(collect({ type: "response.output_audio.done" }).speaking, [false]);
});

test("the beta audio names still work", () => {
  // A session against an older deployment must not fall mute.
  assert.deepEqual(collect({ type: "response.audio.delta" }).speaking, [true]);
  assert.deepEqual(collect({ type: "response.audio.done" }).speaking, [false]);
});

test("both transcript names are attributed to the tutor", () => {
  for (const type of ["response.output_audio_transcript.done",
                      "response.audio_transcript.done"]) {
    assert.deepEqual(collect({ type, transcript: "Hello" }).lines, [["tutor", "Hello"]]);
  }
});

test("the student's own transcript is attributed to them", () => {
  const seen = collect({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "why does that work",
  });
  assert.deepEqual(seen.lines, [["student", "why does that work"]]);
});

test("an empty transcript produces no line", () => {
  assert.equal(collect({ type: "response.output_audio_transcript.done", transcript: "  " }).lines.length, 0);
});

test("a write_on_board tool call becomes a board card", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board",
    call_id: "call_1",
    arguments: JSON.stringify({
      action: JSON.stringify({ type: "write_equation", id: "e1",
                               latex: "a^2 + b^2 = c^2", color: "cyan" }),
    }),
  });
  assert.equal(seen.actions.length, 1);
  assert.equal(seen.actions[0].type, "write_equation");
  assert.equal(seen.actions[0].latex, "a^2 + b^2 = c^2");
  assert.deepEqual(seen.acks, ["call_1"]);
});

test("a tool call sending the object directly also works", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board", call_id: "call_2",
    arguments: JSON.stringify({
      action: { type: "write_text", id: "t1", text: "Title", style: "title", color: "ink" },
    }),
  });
  assert.equal(seen.actions.length, 1);
  assert.equal(seen.actions[0].text, "Title");
});

test("a malformed tool call drops the card but still answers", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board", call_id: "call_3", arguments: "{not json",
  });
  assert.equal(seen.actions.length, 0);
  assert.deepEqual(seen.acks, ["call_3"], "an unanswered call would stall the turn");
});

test("an unknown tool is still answered", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "something_else", call_id: "call_4", arguments: "{}",
  });
  assert.equal(seen.actions.length, 0);
  assert.deepEqual(seen.acks, ["call_4"]);
});

test("text output is still read for board actions", () => {
  const seen = collect({
    type: "response.output_text.done",
    text: 'chatter\n{"type":"write_text","id":"t2","text":"From text","style":"body","color":"ink"}\n',
  });
  assert.equal(seen.actions.length, 1);
  assert.equal(seen.actions[0].text, "From text");
});

test("server errors are surfaced, not swallowed", () => {
  const seen = collect({ type: "error", error: { message: "session expired" } });
  assert.deepEqual(seen.errors, ["session expired"]);
});

test("the tool answer is a function_call_output for that call", () => {
  const [first] = toolResultMessages("call_9", "Written on the board.").map(JSON.parse);
  assert.equal(first.type, "conversation.item.create");
  assert.equal(first.item.type, "function_call_output");
  assert.equal(first.item.call_id, "call_9");
  assert.equal(first.item.output, "Written on the board.");
});

test("the answer is followed by a response.create, or the tutor goes quiet", () => {
  const messages = toolResultMessages("call_9", "ok").map(JSON.parse);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, "response.create");
});

test("a lookup tool is routed to runTool and its prose is sent back", () => {
  const calls = [];
  const seen = collect(
    {
      type: "response.function_call_arguments.done",
      name: "search_material",
      call_id: "call_10",
      arguments: JSON.stringify({ query: "titration" }),
    },
    (name, args) => {
      calls.push([name, args]);
      return "From Chem notes, p.4:\nAdd the acid slowly.";
    },
  );
  assert.deepEqual(calls, [["search_material", { query: "titration" }]]);
  assert.deepEqual(seen.acks, ["call_10"]);
  assert.match(seen.outputs[0], /Add the acid slowly/);
});

test("a lookup with unreadable arguments still answers the call", () => {
  const seen = collect(
    {
      type: "response.function_call_arguments.done",
      name: "get_progress",
      call_id: "call_11",
      arguments: "{not json",
    },
    () => "never reached",
  );
  assert.deepEqual(seen.acks, ["call_11"]);
  assert.match(seen.outputs[0], /lookup failed/);
});

test("write_on_board never reaches runTool", () => {
  // The board is handled locally; sending it out to a lookup would draw nothing.
  let reached = false;
  const seen = collect(
    {
      type: "response.function_call_arguments.done",
      name: "write_on_board",
      call_id: "call_12",
      arguments: JSON.stringify({
        action: { type: "write_text", id: "t9", text: "Hi", style: "body", color: "ink" },
      }),
    },
    () => {
      reached = true;
      return "";
    },
  );
  assert.equal(reached, false);
  assert.equal(seen.actions.length, 1);
});

console.log("\n— what the live tutor knows —");

const NOW = Date.UTC(2026, 0, 15);

/** A context with one strong subject, one weak one, and material in both. */
function voiceContext(overrides = {}) {
  const base = {
    courses: [
      { id: "c-maths", name: "Maths", color: "cyan" },
      { id: "c-chem", name: "Chemistry", color: "amber" },
    ],
    materials: [
      { id: "m1", courseId: "c-maths", name: "Calculus notes.pdf" },
      { id: "m2", courseId: "c-chem", name: "Titration handout.pdf" },
      { id: "m3", name: "Loose scan.jpg" },
    ],
    chunks: [
      { id: "k1", materialId: "m1", locator: "page 2", order: 0,
        text: "The derivative of a product uses the product rule." },
      { id: "k2", materialId: "m2", locator: "page 5", order: 0,
        text: "Add the acid slowly to the burette during a titration." },
    ],
    sessions: [
      { id: "s1", courseId: "c-maths", title: "Product rule", updatedAt: NOW - DAY_MS,
        plan: { steps: ["differentiate", "check"] } },
      { id: "s2", courseId: "c-chem", title: "Titration curves", updatedAt: NOW - 2 * DAY_MS },
    ],
    cards: [],
    attempts: [
      att(["m1"], 10, 10, NOW - DAY_MS), att(["m1"], 9, 10, NOW - DAY_MS),
      att(["m2"], 2, 10, NOW - DAY_MS), att(["m2"], 3, 10, NOW - DAY_MS),
    ],
    now: NOW,
  };
  return { ...base, ...overrides };
}

test("the briefing names the subjects and which way round they rank", () => {
  const brief = buildBriefing(voiceContext());
  assert.match(brief, /Maths/);
  assert.match(brief, /Chemistry/);
  assert.match(brief, /Strongest right now: Maths/);
  assert.match(brief, /Weakest: Chemistry/);
});

test("the briefing lists recent lessons and unfiled material", () => {
  const brief = buildBriefing(voiceContext());
  assert.match(brief, /Product rule/);
  assert.match(brief, /Loose scan\.jpg/);
});

test("the briefing counts the cards due today", () => {
  const due = {
    ...newCard("r1", { prompt: "What is 2+2?", answer: "4" }, ["m1"], true, NOW),
    dueAt: NOW - DAY_MS,
  };
  const brief = buildBriefing(voiceContext({ cards: [due] }));
  assert.match(brief, /1 review card is due today/);
});

test("a brand-new student gets an opening, not an empty briefing", () => {
  const brief = buildBriefing({
    courses: [], materials: [], chunks: [], sessions: [], cards: [], attempts: [], now: NOW,
  });
  assert.match(brief, /haven't uploaded anything/);
  assert.doesNotMatch(brief, /Subjects:/);
});

test("search_material quotes the student's own file and says where from", () => {
  const out = runVoiceTool("search_material", { query: "titration burette" }, voiceContext());
  assert.match(out, /Titration handout\.pdf/);
  assert.match(out, /page 5/);
  assert.match(out, /Add the acid slowly/);
});

test("a file with no pages isn't announced as 'from notes.txt, notes.txt'", () => {
  const context = voiceContext({
    chunks: [{ id: "k3", materialId: "m3", locator: "Loose scan.jpg", order: 0,
               text: "Ohm's law relates voltage, current and resistance." }],
  });
  const out = runVoiceTool("search_material", { query: "ohm law resistance" }, context);
  assert.match(out, /^From Loose scan\.jpg:/);
});

test("search_material narrowed to a subject ignores the others", () => {
  const out = runVoiceTool(
    "search_material", { query: "titration burette", subject: "Maths" }, voiceContext(),
  );
  assert.doesNotMatch(out, /Add the acid slowly/, "Chemistry material isn't filed under Maths");
});

test("a subject name is matched loosely, not exactly", () => {
  // The tutor hears "chemistry" and has no way to know the folder's exact case.
  const out = runVoiceTool(
    "search_material", { query: "titration", subject: "  chem " }, voiceContext(),
  );
  assert.match(out, /Add the acid slowly/);
});

test("searching a subject with nothing in it says so rather than answering blind", () => {
  const context = voiceContext({ chunks: [] });
  const out = runVoiceTool("search_material", { query: "anything", subject: "Maths" }, context);
  assert.match(out, /Nothing is filed under Maths/);
});

test("an empty query is refused instead of returning arbitrary passages", () => {
  assert.match(runVoiceTool("search_material", { query: "   " }, voiceContext()), /No query/);
});

test("get_progress ranks strongest to weakest with the counts behind it", () => {
  const out = runVoiceTool("get_progress", {}, voiceContext());
  const lines = out.split("\n");
  assert.match(lines[0], /^Maths:/);
  assert.match(lines[1], /^Chemistry:/);
  assert.match(out, /19 of 20 answered right/);
});

test("get_progress says so when a subject hasn't been quizzed enough to rank", () => {
  const context = voiceContext({ attempts: [att(["m1"], 1, 2, NOW - DAY_MS)] });
  assert.match(runVoiceTool("get_progress", {}, context), /too early to rank/);
});

test("list_lessons is newest first and filters by subject", () => {
  const all = runVoiceTool("list_lessons", {}, voiceContext()).split("\n");
  assert.match(all[0], /Product rule/, "the most recent lesson comes first");
  assert.match(all[0], /covered differentiate, check/);

  const chem = runVoiceTool("list_lessons", { subject: "Chemistry" }, voiceContext());
  assert.match(chem, /Titration curves/);
  assert.doesNotMatch(chem, /Product rule/);
});

test("list_lessons on an empty subject doesn't invent one", () => {
  const out = runVoiceTool("list_lessons", { subject: "Maths" },
                           voiceContext({ sessions: [] }));
  assert.match(out, /No lessons filed under Maths/);
});

test("an unknown tool name comes back as prose, not a thrown error", () => {
  assert.match(runVoiceTool("teleport", {}, voiceContext()), /Unknown tool/);
});

test("every declared tool is one the runner or the board actually handles", () => {
  const handled = new Set([
    "write_on_board", "draw_image", "search_material", "get_progress", "list_lessons",
  ]);
  for (const tool of VOICE_TOOLS) {
    assert.equal(tool.type, "function");
    assert.ok(handled.has(tool.name), `${tool.name} is declared but nothing answers it`);
    assert.ok(tool.description.length > 20, `${tool.name} needs a usable description`);
  }
});

console.log("\n— pictures on the board —");

test("a description becomes a request with sane defaults", () => {
  const req = normalizeImageRequest({ prompt: "  a labelled   leaf cross-section " });
  assert.equal(req.prompt, "a labelled leaf cross-section", "whitespace is collapsed");
  assert.equal(req.style, "diagram", "a teaching figure is the common case");
  assert.equal(req.shape, "wide", "the board card is wider than it is tall");
  assert.equal(req.caption, undefined);
});

test("style and shape are honoured when the tutor picks them", () => {
  const req = normalizeImageRequest({
    prompt: "the Eiffel tower", style: "realistic", shape: "tall", caption: "1889",
  });
  assert.equal(req.style, "realistic");
  assert.equal(req.shape, "tall");
  assert.equal(req.caption, "1889");
});

test("a style or shape the model invented falls back rather than failing", () => {
  const req = normalizeImageRequest({ prompt: "a cell", style: "anime", shape: "panorama" });
  assert.equal(req.style, "diagram");
  assert.equal(req.shape, "wide");
});

test("an empty or near-empty description is refused in words", () => {
  assert.match(normalizeImageRequest({}).error, /nothing to draw/);
  assert.match(normalizeImageRequest({ prompt: "   " }).error, /nothing to draw/);
  assert.match(normalizeImageRequest({ prompt: "ab" }).error, /too short/);
});

test("a runaway description is cut, not rejected", () => {
  const req = normalizeImageRequest({ prompt: "cell ".repeat(500) });
  assert.ok(req.prompt.length <= 900);
  assert.ok(req.prompt.startsWith("cell cell"));
});

test("each shape has a size the image API accepts and matching dimensions", () => {
  for (const shape of ["square", "wide", "tall"]) {
    const size = sizeFor(shape);
    assert.match(size, /^\d+x\d+$/);
    const { width, height } = dimensionsFor(shape);
    assert.equal(size, `${width}x${height}`, "the card's aspect ratio must match the file's");
  }
  assert.ok(dimensionsFor("wide").width > dimensionsFor("wide").height);
  assert.ok(dimensionsFor("tall").height > dimensionsFor("tall").width);
});

test("the built prompt carries the style, the subject and the legibility rules", () => {
  const prompt = buildImagePrompt(normalizeImageRequest({ prompt: "a voltaic cell" }));
  assert.match(prompt, /Subject: a voltaic cell/);
  assert.match(prompt, /flat vector/, "the default is a teaching figure");
  assert.match(prompt, /spelled correctly/);
  assert.match(prompt, /No title bar, frame, border/, "a framed image wastes half the card");
});

test("a realistic request doesn't ask for a vector diagram", () => {
  const prompt = buildImagePrompt(
    normalizeImageRequest({ prompt: "a real human heart", style: "realistic" }),
  );
  assert.match(prompt, /photograph/);
  assert.doesNotMatch(prompt, /flat vector/);
});

test("draw_image hands the request over and answers at once", () => {
  const drawn = [];
  const out = runVoiceTool(
    "draw_image",
    { prompt: "a labelled leaf cross-section", caption: "the leaf" },
    voiceContext({ drawImage: (r) => drawn.push(r) }),
  );
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].prompt, "a labelled leaf cross-section");
  assert.equal(drawn[0].caption, "the leaf");
  // The tutor is mid-sentence: it must be told to keep talking, not to wait.
  assert.match(out, /Keep talking/);
});

test("a bad draw_image call is explained, and nothing is drawn", () => {
  const drawn = [];
  const out = runVoiceTool("draw_image", { prompt: "" },
                           voiceContext({ drawImage: (r) => drawn.push(r) }));
  assert.equal(drawn.length, 0);
  assert.match(out, /nothing to draw/);
});

test("draw_image on a board that can't take one says so instead of throwing", () => {
  const out = runVoiceTool("draw_image", { prompt: "a cell" }, voiceContext());
  assert.match(out, /can't take a drawing/);
});

test("a picture card survives being stored and read back", () => {
  const action = normalizeAction({
    type: "show_image", id: "i1", prompt: "a voltaic cell",
    caption: "zinc and copper", src: "/api/images/abc", width: 1536, height: 1024,
  });
  assert.equal(action.type, "show_image");
  assert.equal(action.src, "/api/images/abc");
  assert.equal(action.width, 1536);
  assert.equal(action.error, undefined);
});

test("a freshly asked-for picture is still drawing, not already failed", () => {
  // The typed tutor emits this card mid-stream, seconds before the image
  // exists. Marking it failed here would mean no picture ever appeared.
  const action = normalizeAction({ type: "show_image", id: "i2", prompt: "a cell" });
  assert.equal(action.error, undefined);
  assert.equal(action.src, undefined);
});

test("style and shape survive so the request can be made from the card", () => {
  const action = normalizeAction({
    type: "show_image", id: "i4", prompt: "a real heart", style: "realistic", shape: "tall",
  });
  assert.equal(action.style, "realistic");
  assert.equal(action.shape, "tall");
  const invented = normalizeAction({
    type: "show_image", id: "i5", prompt: "a cell", style: "anime", shape: "panorama",
  });
  assert.equal(invented.style, undefined, "the caller falls back, rather than storing nonsense");
  assert.equal(invented.shape, undefined);
});

test("a picture still drawing when the lesson closed is settled on reopening", () => {
  const settled = settleUnfinishedImages([
    { id: "a", type: "write_text" },
    { id: "b", type: "show_image", prompt: "a cell" },
    { id: "c", type: "show_image", prompt: "a leaf", src: "/api/images/x" },
    { id: "d", type: "show_image", prompt: "a map", error: "refused" },
  ]);
  assert.match(settled[1].error, /didn't finish/);
  assert.equal(settled[0].error, undefined, "other cards are left alone");
  assert.equal(settled[2].error, undefined, "one that arrived is left alone");
  assert.equal(settled[3].error, "refused", "an existing reason isn't overwritten");
});

test("a drawing lands in its own card, however far the board has moved on", () => {
  // The turn keeps streaming while the image generates, so the waiting card is
  // rarely the last one by the time it comes back.
  const before = [
    { id: "im1", type: "show_image", prompt: "a leaf" },
    { id: "t1", type: "write_text", text: "meanwhile" },
    { id: "im2", type: "show_image", prompt: "a cell" },
  ];
  const after = applyDrawnImage(before, "im2", { src: "/api/images/z", width: 1536, height: 1024 });
  assert.equal(after[2].src, "/api/images/z");
  assert.equal(after[0].src, undefined, "the other picture is untouched");
  assert.deepEqual(after[1], before[1]);
  assert.notEqual(after, before, "a new list, so React sees the change");
});

test("a drawing that failed is recorded on the card, not thrown away", () => {
  const after = applyDrawnImage(
    [{ id: "im1", type: "show_image", prompt: "a leaf" }],
    "im1",
    { error: "The image model refused that description." },
  );
  assert.match(after[0].error, /refused/);
});

test("a drawing whose card is gone changes nothing", () => {
  // The student wiped the board mid-generation. Nothing should reappear.
  const before = [{ id: "t1", type: "write_text", text: "still here" }];
  assert.deepEqual(applyDrawnImage(before, "im1", { src: "/x" }), before);
});

test("a picture card with nothing in it at all is dropped", () => {
  assert.equal(normalizeAction({ type: "show_image", id: "i3" }), null);
});

test("write_on_board takes a whole board's worth of cards in one call", () => {
  // The point of the array: a title, the working and the result go up
  // together rather than as three round trips through a spoken turn.
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board", call_id: "call_20",
    arguments: JSON.stringify({
      actions: [
        JSON.stringify({ type: "write_text", id: "t1", text: "Ohm's law", style: "title", color: "ink" }),
        JSON.stringify({ type: "write_equation", id: "e1", latex: "V = IR", color: "cyan" }),
        JSON.stringify({ type: "write_text", id: "t2", text: "so R = V/I", style: "body", color: "ink" }),
      ],
    }),
  });
  assert.equal(seen.actions.length, 3);
  assert.deepEqual(seen.actions.map((a) => a.id), ["t1", "e1", "t2"]);
  assert.match(seen.outputs[0], /3 cards/);
});

test("an array of plain objects works as well as an array of strings", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board", call_id: "call_21",
    arguments: JSON.stringify({
      actions: [
        { type: "write_text", id: "t3", text: "One", style: "body", color: "ink" },
        { type: "write_text", id: "t4", text: "Two", style: "body", color: "ink" },
      ],
    }),
  });
  assert.equal(seen.actions.length, 2);
});

test("one bad card in a batch doesn't take the good ones down with it", () => {
  const seen = collect({
    type: "response.function_call_arguments.done",
    name: "write_on_board", call_id: "call_22",
    arguments: JSON.stringify({
      actions: [
        { type: "write_text", id: "t5", text: "Fine", style: "body", color: "ink" },
        { type: "nonsense", id: "x1" },
        "{not json",
      ],
    }),
  });
  assert.equal(seen.actions.length, 1);
  assert.match(seen.outputs[0], /1 card\)/);
});

console.log("\n— getting the board wired up —");

const boardCall = (args, type = "response.function_call_arguments.done") =>
  type === "response.function_call_arguments.done"
    ? { type, name: "write_on_board", call_id: "c1", arguments: JSON.stringify(args) }
    : { type, item: { type: "function_call", name: "write_on_board", call_id: "c1",
                      arguments: JSON.stringify(args) } };

const TITLE = { type: "write_text", id: "t1", text: "Ohm's law", style: "title", color: "ink" };
const EQ = { type: "write_equation", id: "e1", latex: "V = IR", color: "cyan" };

test("cards arrive whichever of the four shapes the model sends them in", () => {
  // Each of these is a real thing a model does with the same tool schema.
  const shapes = {
    "newline-delimited string": { actions: `${JSON.stringify(TITLE)}\n${JSON.stringify(EQ)}` },
    "array of JSON strings": { actions: [JSON.stringify(TITLE), JSON.stringify(EQ)] },
    "array of objects": { actions: [TITLE, EQ] },
    "a JSON string of an array": { actions: JSON.stringify([TITLE, EQ]) },
  };
  for (const [label, args] of Object.entries(shapes)) {
    const seen = collect(boardCall(args));
    assert.equal(seen.actions.length, 2, `${label} should produce two cards`);
    assert.deepEqual(seen.actions.map((a) => a.id), ["t1", "e1"], label);
  }
});

test("the singular 'action' key still works, and so does 'cards'", () => {
  assert.equal(collect(boardCall({ action: JSON.stringify(TITLE) })).actions.length, 1);
  assert.equal(collect(boardCall({ cards: [TITLE, EQ] })).actions.length, 2);
});

test("a tool call carried on response.output_item.done is not missed", () => {
  // Some models only surface the call here, and missing it is a blank board.
  const seen = collect(boardCall({ actions: [TITLE] }, "response.output_item.done"));
  assert.equal(seen.actions.length, 1);
  assert.deepEqual(seen.acks, ["c1"]);
});

test("a tool call carried on response.done is not missed either", () => {
  const seen = collect({
    type: "response.done",
    response: {
      output: [
        { type: "message", content: [] },
        { type: "function_call", name: "write_on_board", call_id: "c9",
          arguments: JSON.stringify({ actions: [TITLE] }) },
      ],
    },
  });
  assert.equal(seen.actions.length, 1);
  assert.deepEqual(seen.acks, ["c9"]);
});

test("the same call arriving on two events is drawn once, not twice", () => {
  const shared = new Set();
  const args = { actions: [TITLE] };
  const first = collect(boardCall(args), undefined, shared);
  const second = collect(boardCall(args, "response.output_item.done"), undefined, shared);
  assert.equal(first.actions.length, 1);
  assert.equal(second.actions.length, 0, "the second event is the same call");
  assert.deepEqual(second.acks, []);
});

test("a lookup tool is deduped the same way", () => {
  const shared = new Set();
  let runs = 0;
  const call = {
    type: "response.function_call_arguments.done",
    name: "get_progress", call_id: "c5", arguments: "{}",
  };
  collect(call, () => (runs += 1, "fine"), shared);
  collect({ ...call, type: "response.output_item.done",
            item: { type: "function_call", name: "get_progress", call_id: "c5", arguments: "{}" } },
          () => (runs += 1, "fine"), shared);
  assert.equal(runs, 1, "a search must not run twice because two events described it");
});

test("cards the tutor read aloud still reach the board", () => {
  // It is told never to speak the JSON. When it does anyway, drawing the card
  // and keeping the transcript clean beats losing both.
  const seen = collect({
    type: "response.output_audio_transcript.done",
    transcript: `Here's the formula.\n${JSON.stringify(EQ)}\nNotice the units.`,
  });
  assert.equal(seen.actions.length, 1);
  assert.equal(seen.actions[0].latex, "V = IR");
  assert.deepEqual(seen.lines, [["tutor", "Here's the formula.\nNotice the units."]]);
});

test("ordinary speech is left exactly as it was said", () => {
  const seen = collect({
    type: "response.output_audio_transcript.done",
    transcript: "So the resistance is two ohms.",
  });
  assert.deepEqual(seen.lines, [["tutor", "So the resistance is two ohms."]]);
  assert.equal(seen.actions.length, 0);
});

test("spokenOnly leaves nothing when the turn was only JSON", () => {
  assert.equal(spokenOnly(`${JSON.stringify(EQ)}\n${JSON.stringify(TITLE)}`), "");
});

test("an unusable batch tells the model what to do about it", () => {
  const seen = collect(boardCall({ actions: "not json at all" }));
  assert.equal(seen.actions.length, 0);
  assert.match(seen.outputs[0], /send them again/, "silence teaches the model nothing");
});

test("the session update carries the instructions and the tools", () => {
  // Without this the tutor talks perfectly and never touches the board.
  const message = JSON.parse(sessionUpdateMessage("be a tutor", VOICE_TOOLS));
  assert.equal(message.type, "session.update");
  assert.equal(message.session.type, "realtime");
  assert.equal(message.session.instructions, "be a tutor");
  assert.equal(message.session.tool_choice, "auto");
  assert.deepEqual(
    message.session.tools.map((t) => t.name),
    ["write_on_board", "draw_image", "search_material", "get_progress", "list_lessons"],
  );
});

console.log(`\n${passed} checks passed\n`);
