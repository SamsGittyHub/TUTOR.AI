/**
 * Everything the public pages say, as data.
 *
 * Kept out of the components so the four marketing pages can't drift from
 * each other, and so a claim on one page can be checked against the product
 * without reading JSX. Nothing here is decorative: if a feature is listed, it
 * ships today.
 */

export interface MarketingLink {
  href: string;
  label: string;
}

/** The public pages, in the order someone meets them. */
export const MARKETING_NAV: MarketingLink[] = [
  { href: "/features", label: "Features" },
  { href: "/why", label: "Why not a tutor?" },
  { href: "/pricing", label: "Pricing" },
];

export const SUBJECTS = [
  "Organic chemistry",
  "Linear algebra",
  "Thermodynamics",
  "Microeconomics",
  "Cell biology",
  "Statistics",
  "US history",
  "Discrete math",
  "Genetics",
  "Calculus II",
  "Circuit analysis",
  "Macroeconomics",
];

export const STEPS = [
  {
    n: "1",
    title: "Make a free account",
    body: "Email and a password, and you're in. No API key, no card, nothing to configure. Everything saves to your account, so you can start on a laptop and pick it up on your phone at the exact card you stopped on.",
  },
  {
    n: "2",
    title: "Upload what you're actually studying",
    body: "Lecture PDFs, slide decks, a Word doc, a photo of the notes you scrawled in the margin, even a recording of the lecture itself. It gets read, split by page or slide or timestamp, and kept ready to quote back at you.",
  },
  {
    n: "3",
    title: "Get taught — and interrupt",
    body: "It plans the lesson, then works it out on a live whiteboard: equations line by line, diagrams drawn edge by edge, plots sketched to scale. Cut in whenever you're lost. It answers, then says where it's picking back up.",
  },
];

export interface Feature {
  title: string;
  body: string;
}

/** What the app does, in the order a student meets it. */
export const FEATURES: Feature[] = [
  {
    title: "A whiteboard, not a wall of text",
    body: "Every lesson is written out as you watch — titles, equations in real LaTeX, worked steps one line at a time, comparison tables, flowcharts, and graphs plotted to scale. You can wipe the board mid-lesson without ending the lesson.",
  },
  {
    title: "It talks, and you can talk back",
    body: "Live voice is a real conversation: it explains out loud while writing on the board, and you interrupt it the way you'd interrupt a person — mid-sentence, not by waiting for a beep. It can search your notes while you're still talking.",
  },
  {
    title: "It draws things that aren't shapes",
    body: "When the thing you're stuck on is a real object — a titration setup, a leaf cross-section, a circuit, a map — it generates a properly labelled picture instead of approximating it with boxes and arrows.",
  },
  {
    title: "Taught from your material, and it shows its sources",
    body: "It teaches from your lecture slides in your professor's notation, not a generic curriculum. Every card it writes from your files is stamped with the file and the page, slide, or timestamp — so you can check it.",
  },
  {
    title: "Flashcards that come back when you'd forget",
    body: "Every quiz question you answer becomes a review card on a spaced schedule. Get it right and the gap stretches; miss it and it's back tomorrow. Anything you keep missing has a “teach me this one” button that opens a full lesson on it.",
  },
  {
    title: "Practice exams aimed at your weak spots",
    body: "A full paper — sections, marks per question, a real total — weighted toward what you actually got stuck on, read from your own lesson history: where you interrupted, where you said “wait”, where a card has been missed three times.",
  },
  {
    title: "It reads your marked paper back to you",
    body: "Photograph an exam you've had marked and it goes through it question by question: what you wrote, what went wrong in the working, and what to do differently. Not the score — you already have the score.",
  },
  {
    title: "Your exam dates become a study plan",
    body: "Put your deadlines in with the topics they cover and say how many minutes a day you realistically have. It works backwards: every topic twice, spread across the days you've got, with a full review the day before.",
  },
  {
    title: "It learns how you learn",
    body: "It notices which explanations land for you — pictures, worked steps, being asked before being told — and leans on those next time. It keeps short notes on what trips you up. You can read all of it, and delete any of it, whenever you like.",
  },
  {
    title: "Everything is searchable, and yours to keep",
    body: "Search every file and every lesson by the words your notes actually use, including things only ever said out loud in a recorded lecture. Export any board as a PDF, Word file, image, or notes — or share a read-only link with a classmate.",
  },
];

export interface VersusRow {
  label: string;
  human: string;
  ours: string;
}

/** Specific and checkable — not vague superiority. */
export const VERSUS: VersusRow[] = [
  {
    label: "At 2am, the night before",
    human: "Booked out, asleep, or £50 for an emergency hour",
    ours: "Open. Same patience at 2am as at 2pm.",
  },
  {
    label: "Asking the same thing six times",
    human: "You stop asking around the third, because you can feel it",
    ours: "It re-explains a different way. It has no opinion about you.",
  },
  {
    label: "Knowing your actual course",
    human: "Works from their material until you've paid for enough hours",
    ours: "Teaches from your slides, in your lecturer's notation, from lesson one",
  },
  {
    label: "Remembering last term",
    human: "Remembers you. Probably not which explanation worked in October.",
    ours: "Knows which kinds of explanation land for you, measured over every session",
  },
  {
    label: "Practice papers",
    human: "Whatever they had time to prepare",
    ours: "Unlimited, generated from your material, weighted to your weak spots",
  },
  {
    label: "What's left afterwards",
    human: "A wiped whiteboard and whatever you managed to copy down",
    ours: "Every board saved, searchable, exportable, on any device you sign into",
  },
];

/** Concrete situations, not fabricated customer quotes — this is a beta with no users yet. */
export const SCENARIOS = [
  {
    tag: "The night before",
    body: "Upload four weeks of lecture slides at 11pm and have it teach you the unit off your own deck, citing slide numbers you can check against the lecture.",
  },
  {
    tag: "Mid-derivation",
    body: "“Wait — where did that 2 come from?” It highlights the exact line it came from and re-derives that step before carrying on.",
  },
  {
    tag: "Out loud, hands free",
    body: "Walk through a problem by talking. It explains aloud, writes the working on the board as it goes, and stops the moment you cut in.",
  },
  {
    tag: "From a photo",
    body: "Photograph a page of handwritten notes — badly-drawn arrows and all — and ask it to teach you what's on it.",
  },
  {
    tag: "After a bad paper",
    body: "Photograph the marked exam. Get a question-by-question breakdown of what went wrong in the working, then a fresh paper aimed at exactly those gaps.",
  },
  {
    tag: "In your language",
    body: "Pick any of 182 languages and it teaches, quizzes, and marks entirely in it — the board written in your language, not translated after the fact.",
  },
];

export interface Tier {
  name: string;
  price: string;
  tagline: string;
  /** The one the page pushes. Exactly one tier should carry this. */
  featured?: boolean;
  includes: string[];
  /** Named separately so the absence of voice on Basic reads as a fact, not an omission. */
  voice: string;
}

export const TIERS: Tier[] = [
  {
    name: "Basic",
    price: "€19.99",
    tagline: "Everything except the talking.",
    voice: "No live voice",
    includes: [
      "Unlimited whiteboard lessons",
      "Unlimited uploads — PDFs, slides, recordings",
      "Flashcards and spaced review",
      "Practice exams and marked-paper review",
      "Study planner and progress tracking",
      "Export and share any board",
    ],
  },
  {
    name: "Middle",
    price: "€34.99",
    tagline: "An hour of talking it through, every day.",
    featured: true,
    voice: "1 hour of live voice a day",
    includes: [
      "Everything in Basic",
      "Live voice — it explains out loud while it writes",
      "Extra voice minutes at a reduced rate",
    ],
  },
  {
    name: "Top",
    price: "€54.99",
    tagline: "For the term where everything lands at once.",
    voice: "1.5 hours of live voice a day",
    includes: [
      "Everything in Middle",
      "Extra voice minutes at the lowest rate",
    ],
  },
];
