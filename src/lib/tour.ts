/**
 * The tour, as data.
 *
 * Written for someone who has just signed up and doesn't yet know that any of
 * this exists. Each step answers the same two questions in the same order —
 * what is this for, and what do I actually do — because a feature tour that
 * only names things leaves the reader exactly where they started.
 *
 * Kept separate from the component so the wording can be checked at a glance
 * and every step is guaranteed to point somewhere real.
 */

export interface TourStep {
  /** Short title. Also the label in the step list. */
  title: string;
  /** Where this feature lives, so the tour can take them there. */
  href: string;
  /** What it's for, in a sentence or two. */
  what: string;
  /** What to do, as concrete actions. */
  how: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "The board",
    href: "/app",
    what:
      "This is the lesson itself. You ask a question on the right and the tutor explains it out loud while writing on the whiteboard — equations, worked steps, diagrams, even pictures it draws for you.",
    how: [
      "Type what you're stuck on and press Enter. \"I don't get integration by parts\" is enough.",
      "Interrupt whenever. Cutting in mid-lesson is the point — ask \"where did that 2 come from?\" and it backs up.",
      "Drag the divider between the board and the chat to give either side more room.",
      "Hit the speaker icon and the tutor reads along; hit the microphone and you can just talk to it.",
    ],
  },
  {
    title: "Your material",
    href: "/materials",
    what:
      "Upload your own notes, slides, PDFs, a photo of your handwriting, or a recording of a lecture. The tutor teaches from what your course actually says, and tells you which page it got something from.",
    how: [
      "Drop files onto the board's left panel, or paste text straight in.",
      "A lecture recording gets transcribed, so you can ask about something said at 14:20.",
      "Every card the tutor writes from your material is stamped with the file and page it came from.",
    ],
  },
  {
    title: "Search",
    href: "/search",
    what:
      "Everything you've uploaded and every lesson you've been taught, searchable by the words your notes actually use — including what was said out loud in a recorded lecture.",
    how: [
      "Search a topic, not a filename: it reads the text inside your files.",
      "\"Teach me this\" on any result opens a lesson on that exact passage.",
      "Lessons match on their board too, so you can find the one where you did it.",
    ],
  },
  {
    title: "Subjects",
    href: "/courses",
    what:
      "Folders — Maths, Chemistry, whatever you study. File your material and past lessons into one and the tutor draws on everything in it, not just the file you happen to have open.",
    how: [
      "Add a subject, then file material and lessons into it.",
      "Start a lesson from inside a subject and it already has the context.",
      "Ask about last week's topic mid-lesson and it has the notes for it.",
    ],
  },
  {
    title: "Live voice",
    href: "/voice",
    what:
      "A spoken lesson. You talk, it talks back, and it writes on the board while it explains — the closest thing here to sitting next to someone.",
    how: [
      "Press Start talking and just say what you're stuck on. Interrupt it like a person.",
      "It can search everything you've uploaded mid-sentence and quote your own notes back to you.",
      "The board it produces is saved to Lessons like any other, and exports the same way.",
    ],
  },
  {
    title: "Flashcards and review",
    href: "/quiz",
    what:
      "Quizzes built from your own material. Every question you answer becomes a review card, scheduled so it comes back just before you'd forget it.",
    how: [
      "Generate a quiz from a file or a subject and answer it.",
      "Get one wrong and it comes back tomorrow; get it right and the gap stretches out.",
      "Review shows what's ripe today. \"Teach me this one\" opens a lesson on anything you keep missing.",
      "Turn on reminders there and it tells you when cards come due.",
    ],
  },
  {
    title: "Practice exams",
    href: "/practice-exam",
    what:
      "A full paper, weighted toward the things you actually got stuck on rather than an even spread. Sit it, submit it, and get it marked with working.",
    how: [
      "Pick a whole subject, or choose individual lessons.",
      "\"Why these questions?\" shows what it thinks your weak spots are.",
      "Already sat a real paper? Exam review reads a photo of the marked one and goes through it with you.",
    ],
  },
  {
    title: "Calendar",
    href: "/calendar",
    what:
      "Put your exam dates in and it works backwards into a study plan — every topic twice, then a full review the day before.",
    how: [
      "Add an exam or deadline with the topics it covers.",
      "Say how many minutes a day you've actually got.",
      "Build study plan, and each day gets sittings you can start straight from the calendar.",
    ],
  },
  {
    title: "Progress",
    href: "/progress",
    what:
      "What's sticking and what isn't — your subjects ranked strongest to weakest from real quiz answers, not a streak counter. It also shows what the tutor has worked out about how you learn.",
    how: [
      "Subjects rank themselves once you've answered enough questions to mean something.",
      "\"How you learn\" is the tutor's own notes — which explanations land for you, and what trips you up.",
      "You can delete any of that, or all of it, whenever you like.",
    ],
  },
  {
    title: "Keeping your work",
    href: "/sessions",
    what:
      "Every lesson is saved as you go, to your account rather than this browser — so you can pick one up on your phone exactly where you left it on a laptop.",
    how: [
      "Lessons lists everything, typed and spoken. Open one to carry on.",
      "Export any board as a PDF, a Word document, an image, or Markdown notes.",
      "The Export button sits in the board's own header too, mid-lesson.",
      "Share turns a lesson into a read-only link for a classmate — and you can turn it off again.",
    ],
  },
];
