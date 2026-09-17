/**
 * Every string the interface shows, in English.
 *
 * This is the source of truth. Other locales are translated from it once, by
 * the model, and cached server-side for everyone — hand-written dictionaries
 * don't scale to 182 languages, and shipping an English interface to someone
 * who picked Yoruba isn't supporting their language.
 *
 * Keys are `area.thing`. Adding a string here is all that's needed: the hash
 * of this object is stored with each cached translation, so changing it
 * invalidates every locale and they regenerate on next use.
 *
 * Deliberately not here: anything the model itself writes. Board text, lesson
 * content and exam questions are generated in the student's language directly
 * (see language.tsx), not translated after the fact.
 */

export const STRINGS = {
  /* nav ------------------------------------------------------------------ */
  "nav.board": "Board",
  "nav.material": "Material",
  "nav.subjects": "Subjects",
  "nav.calendar": "Calendar",
  "nav.flashcards": "Flashcards",
  "nav.practiceExam": "Practice exam",
  "nav.examReview": "Exam review",
  "nav.review": "Review",
  "nav.progress": "Progress",
  "nav.lessons": "Lessons",
  "nav.liveVoice": "Live voice",
  "nav.goTo": "Go to",
  "nav.settings": "Settings",

  /* account --------------------------------------------------------------- */
  "account.signOut": "Sign out",
  "account.language": "Language",
  "account.settings": "Settings",
  "language.search": "Search languages",
  "language.note":
    "The tutor teaches in any language here, and the interface follows once it's been translated.",
  "language.translating": "Translating the interface…",

  /* common ---------------------------------------------------------------- */
  "common.delete": "Delete",
  "common.deleting": "Deleting…",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.add": "Add",
  "common.adding": "Adding…",
  "common.loading": "Loading…",
  "common.back": "Back",
  "common.export": "Export",
  "common.download": "Download",
  "common.none": "None",
  "common.today": "Today",
  "common.yesterday": "yesterday",
  "common.marks": "marks",
  "common.questions": "questions",

  /* board ----------------------------------------------------------------- */
  "board.whiteboard": "Whiteboard",
  "board.blank": "Blank board.",
  "board.blankHint": "Upload notes on the left, or start with a question.",
  "board.askAnything": "Ask anything",
  "board.interrupt": "interrupt any time",
  "board.chatPlaceholder": "Wait — where did that 2 come from?",
  "board.chatIntro":
    "Your tutor talks here while it writes on the board. Cut in whenever — asking a question mid-lesson is the point.",
  "board.showWork": "Show your work",
  "board.newLesson": "New lesson",

  /* material -------------------------------------------------------------- */
  "material.title": "Material",
  "material.lede":
    "Everything you've uploaded, and which subject it belongs to. Deleting a file takes its chunks and review cards with it.",
  "material.drop": "Drop notes, slides, a PDF, a photo, a recording",
  "material.choose": "Choose files",
  "material.paste": "Paste text",
  "material.empty": "Nothing uploaded yet",
  "material.emptyHint":
    "Notes, slides, a PDF, a photo of your handwriting, or a lecture recording. The tutor teaches from whatever you give it.",
  "material.upload": "Upload on the board",
  "material.noSubject": "No subject",
  "material.pastLessons": "Past Lessons",
  "material.whatCover": "What should we cover?",
  "material.goalPlaceholder": "chapter 4, or 'the parts I flagged'",
  "material.start": "Start the lesson",

  /* subjects -------------------------------------------------------------- */
  "subjects.title": "Subjects",
  "subjects.lede":
    "Folders for a subject — Maths, Chemistry, whatever you study. Put your material and your past lessons in one, and the tutor draws on everything in it.",
  "subjects.name": "Subject",
  "subjects.term": "Term",
  "subjects.addSubject": "Add subject",
  "subjects.empty": "No subjects yet",
  "subjects.emptyHint":
    "Add one above — Maths, English, Science — then file material and past lessons into it.",
  "subjects.files": "files",
  "subjects.lessonsIn": "lessons",
  "subjects.startLesson": "Start a lesson here",
  "subjects.addLesson": "Add a past lesson",
  "subjects.noLessons": "No lessons in this subject yet",
  "subjects.notFiled": "Not filed",

  /* lessons --------------------------------------------------------------- */
  "lessons.title": "Lessons",
  "lessons.lede":
    "Every lesson you've taught yourself, board and all. Open one to pick it up exactly where it stopped.",
  "lessons.empty": "No lessons yet",
  "lessons.emptyHint":
    "Ask the tutor to teach you something and it'll show up here, resumable from any device you sign in on.",
  "lessons.boardCards": "board cards",
  "lessons.step": "step",

  /* progress -------------------------------------------------------------- */
  "progress.title": "Progress",
  "progress.lede":
    "Built from the quizzes you've taken and the review queue behind them. Nothing here is a streak counter — it's just what's sticking.",
  "progress.dueToday": "Due today",
  "progress.reviewCards": "Review cards",
  "progress.quizzesTaken": "Quizzes taken",
  "progress.averageScore": "Average score",
  "progress.nextSeven": "Next seven days",
  "progress.nothingWeek":
    "Nothing scheduled this week — answer some quiz questions and the queue fills itself in.",
  "progress.byMaterial": "By material",
  "progress.bySubject": "By subject",
  "progress.strongest": "Strongest",
  "progress.weakest": "Needs work",
  "progress.rankingHint":
    "Ranked as you use it — subjects you quiz on and review rise or fall here.",
  "progress.notEnough": "Not enough yet",
  "progress.notEnoughHint":
    "Take a few quizzes and the ranking fills in. One quiz isn't a pattern.",
  "progress.reviewDue": "Review {n} due",
  "progress.noMaterial": "No material yet",
  "progress.noMaterialHint":
    "Upload a file and take a quiz on it — mastery appears once there's something to measure.",

  /* review ---------------------------------------------------------------- */
  "review.title": "Review",
  "review.lede":
    "Cards the scheduler says are ripe today. Miss one and it comes back tomorrow; get it right and the gap stretches.",
  "review.check": "Check",
  "review.next": "Next card",
  "review.teachThis": "Teach me this one",
  "review.cleared": "Queue cleared",
  "review.yourAnswer": "your answer",
  "review.right": "Right.",
  "review.nothingDue": "Nothing due today",
  "review.noCards": "No review cards yet",

  /* calendar -------------------------------------------------------------- */
  "calendar.title": "Calendar",
  "calendar.lede":
    "Put your exams and deadlines in, and the tutor works backwards into a study plan — every topic twice, then a full review the day before.",
  "calendar.what": "What",
  "calendar.when": "When",
  "calendar.kind": "Kind",
  "calendar.topics": "Topics it covers",
  "calendar.buildPlan": "Build study plan",
  "calendar.rePlan": "Re-plan",
  "calendar.planning": "Planning…",
  "calendar.empty": "Nothing on the calendar",
  "calendar.minutesADay": "Minutes a day for studying",
  "calendar.showEverything": "Show everything",
  "calendar.sittingsDone": "sittings done",
  "calendar.studySitting": "study sitting",

  /* flashcards & exams ----------------------------------------------------- */
  "quiz.title": "Flashcards",
  "quiz.lede":
    "Unlimited quizzes, straight from your material. Every question you answer becomes a review card on the board's schedule.",
  "quiz.generate": "Generate a quiz",
  "exam.title": "Practice exam",
  "exam.lede":
    "Examine a whole subject, or pick individual lessons. The paper is weighted toward the things you actually got stuck on.",
  "exam.generate": "Generate",
  "exam.wholeSubject": "A whole subject",
  "exam.orPickLessons": "Or pick lessons",
  "exam.nothingInIt": "nothing in it yet",
  "exam.submit": "Submit paper",
  "exam.marking": "Marking…",
  "exam.nextSection": "Next section",
  "exam.previous": "Previous",
  "exam.whyThese": "Why these questions?",
  "examReview.title": "Exam review",
  "examReview.lede":
    "Photograph your marked paper and the tutor goes through it with you — what went wrong in your working, not just which answers were red.",
  "examReview.dropPhotos": "Drop photos of the paper",
  "examReview.choosePhotos": "Choose photos",
  "examReview.whatWasIt": "What was it",
  "examReview.reading": "Reading your paper…",
  "examReview.whatToRevise": "What to revise",
  "examReview.questionByQuestion": "Question by question",
  "examReview.youWrote": "You wrote",
  "examReview.shouldBe": "Should be",
  "examReview.nextTime": "Next time",

  /* voice ------------------------------------------------------------------ */
  "voice.title": "Live voice",
  "voice.start": "Start talking",
  "voice.end": "End session",
  "voice.connecting": "Connecting…",
  "voice.listening": "Listening. Say what you're stuck on.",

  /* auth -------------------------------------------------------------------- */
  "auth.signIn": "Sign in",
  "auth.signUp": "Create free account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name",
  "auth.welcomeBack": "Welcome back",
  "auth.haveAccount": "Already have an account?",
  "auth.newHere": "New here?",
} as const;

export type StringKey = keyof typeof STRINGS;
export type Dict = Record<string, string>;

/**
 * A stable fingerprint of the English strings.
 *
 * Cached translations store the hash they were made from, so rewording a
 * string invalidates every locale rather than leaving them subtly stale.
 */
export function sourceHash(): string {
  const canonical = Object.keys(STRINGS)
    .sort()
    .map((k) => `${k}=${STRINGS[k as StringKey]}`)
    .join("");

  // FNV-1a: short, dependency-free, and collision risk here is irrelevant —
  // the worst case is a translation refresh nobody asked for.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
