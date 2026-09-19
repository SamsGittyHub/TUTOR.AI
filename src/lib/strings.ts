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
  "nav.search": "Search",
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
  "settings.title": "Settings",
  "settings.lede": "Your key, your model.",
  "settings.ledeBeta":
    "Nothing to configure during the beta — the tutor is already running. Your material lives on your account and follows you between devices.",
  "settings.betaTitle": "Everything's on us during the beta",
  "settings.betaBody":
    "No API key needed. The tutor runs on our key while we gather feedback, so just use it. There's a daily limit so it keeps working for everyone — if you reach it, it resets at midnight UTC.",
  "settings.runningOn":
    "Running on {model}. Your material and lessons are still yours, on your account, and travel with you between devices.",
  "settings.deleteAll": "Delete all my data",
  "settings.deleteConfirm":
    "Delete every uploaded material and saved lesson? This can't be undone.",
  "settings.ledeKeys":
    "Your key never leaves this browser — it goes straight to the provider you pick. Your material lives on your account so it follows you between devices.",
  "language.search": "Search languages",
  "language.note":
    "The tutor teaches, writes and marks entirely in the language you pick. The interface follows it, translated once and then cached — a language nobody has chosen yet takes a moment the first time.",
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
  "board.blankHint": "Upload your notes, or just start with a question.",
  "board.needKey": "One thing first.",
  "board.needKeyHint":
    "TUTOR AI runs on your own API key, so nothing here costs you a subscription. Paste one and the board wakes up.",
  "board.pickHint":
    "Pick what to study on the left and hit Start the lesson — or just ask below.",
  "board.starter1": "Teach me integration by parts from scratch",
  "board.starter2": "Walk me through balancing redox equations",
  "board.starter3": "Explain how a bill becomes a law, with a diagram",
  "board.askAnything": "Ask anything",
  "board.interrupt": "interrupt any time",
  "board.chatPlaceholder": "Wait — where did that 2 come from?",
  "board.chatNeedsKey": "Add an API key to start",
  "board.chatListening": "Listening — or just type…",
  "board.chatIntro":
    "Your tutor talks here while it writes on the board. Cut in whenever — asking a question mid-lesson is the point.",
  "board.showWork": "Show your work",
  "board.newLesson": "New lesson",
  "board.chalk": "◑ chalk",
  "board.paper": "◐ paper",
  "board.toChalk": "Switch to chalkboard",
  "board.toPaper": "Switch to whiteboard",

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
  "material.uploadSomething": "Upload something",
  "material.emptyBody":
    "Notes, slides, a PDF, a photo of your handwriting, or a lecture recording. The tutor teaches from whatever you give it.",
  "material.kindAudio": "Recording",
  "material.noSubject": "No subject",
  "material.pastLessons": "Past Lessons",
  "material.whatCover": "What should we cover?",
  "material.goalPlaceholder": "chapter 4, or 'the parts I flagged'",
  "material.start": "Start the lesson",
  "material.pastePlaceholder": "Paste a homework problem, a page of notes, anything…",
  "material.deleteFile": "Delete permanently",

  /* subjects -------------------------------------------------------------- */
  "subjects.title": "Subjects",
  "subjects.lede":
    "Folders for a subject — Maths, Chemistry, whatever you study. Put your material and your past lessons in one, and the tutor draws on everything in it.",
  "subjects.name": "Subject",
  "subjects.term": "Term",
  "subjects.namePlaceholder": "Maths",
  "subjects.termPlaceholder": "Fall 2026",
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
  "lessons.delete": "Delete lesson",
  "lessons.start": "Start a lesson",
  "lessons.emptyBody":
    "Ask the tutor to teach you something and it'll show up here, resumable from any device you sign in on.",
  "lessons.downloadNotes": "Download as Markdown notes",

  /* progress -------------------------------------------------------------- */
  "progress.title": "Progress",
  "progress.lede":
    "Built from the quizzes you've taken and the review queue behind them. Nothing here is a streak counter — it's just what's sticking.",
  "progress.dueToday": "Due today",
  "progress.reviewCards": "Review cards",
  "progress.quizzesTaken": "Quizzes taken",
  "progress.averageScore": "Average score",
  "progress.nextSeven": "Next seven days",
  "progress.nothingWeekShown":
    "Nothing scheduled this week — answer some quiz questions and the queue fills itself in.",
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
  "progress.forget": "Forget this",
  "progress.noMaterial": "No material yet",
  "progress.noMaterialBody":
    "Upload a file and take a quiz on it — mastery appears once there's something to measure.",
  "progress.howYouLearn": "How you learn",
  "progress.learnEmpty":
    "Nothing yet. As the tutor teaches you, it works out what makes things click — pictures, worked steps, being asked before being told — and leans on that next time. It needs {n} or so lessons before it will commit to anything.",
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
  "review.takeQuiz": "Take a quiz",
  "review.noCardsBody":
    "Every quiz question you answer becomes a card here, scheduled so it comes back just as you're about to forget it.",
  "review.nothingDueBody":
    "You have {n} cards on the schedule — none of them are ripe yet. Come back tomorrow, or make more.",

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
  "quiz.writing": "Writing questions…",
  "quiz.topic": "Topic (optional)",
  "quiz.topicPlaceholder": "chapter 4, the Calvin cycle, integration by parts…",
  "quiz.questions": "Questions",
  "quiz.backToBoard": "Back to the board",
  "quiz.noMaterialHint":
    "Nothing uploaded yet — quizzes will draw on the tutor's own knowledge.",
  "quiz.uploadLink": "Upload material on the board",
  "quiz.noMaterialTail": "to be quizzed on your class.",
  "quiz.answerPlaceholder": "Type your answer",
  "quiz.seeResults": "See results",
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
  "voice.idleHint":
    "Start the session and talk — the transcript shows up here while the board fills in.",
  "voice.pause": "Pause",
  "voice.resume": "Resume",
  "voice.paused": "paused",
  "voice.idle": "idle",
  "voice.live": "live",
  "voice.errored": "error",
  "voice.endShort": "End",
  "voice.pausedNote":
    "Microphone off. Nothing is being sent or heard — your lesson and the board are exactly where you left them.",
  "voice.privacy":
    "Your mic streams straight to OpenAI. TUTOR AI only mints the session token — it never stores your key.",
  "voice.lessonTitle": "Live voice lesson",
  "voice.emptyTitle": "Just start talking.",
  "voice.emptyBody":
    "The tutor listens continuously — interrupt it mid-sentence the way you would a person. It writes here while it explains.",

  "tour.heading": "How this works · {n} of {total}",
  "tour.takeMeTo": "Take me to {where}",
  "tour.next": "Next",
  "tour.gotIt": "Got it",
  "common.close": "Close",

  /* the board, in use ------------------------------------------------------ */
  "board.yourTurn": "YOUR TURN",
  "board.nothingLeft": "Nothing was left on this board.",
  "chat.thinking": "Thinking…",
  "chat.stop": "Stop",
  "chat.listening": "listening…",
  "chat.transcribing": "thinking…",

  /* search ------------------------------------------------------------------ */
  "search.title": "Search",
  "search.lede":
    "Everything you've uploaded and every lesson you've been taught, in one place. Search the words your notes actually use.",
  "search.placeholder": "titration, the chain rule, what we did on Tuesday…",
  "search.label": "Search your material and lessons",
  "search.hint":
    "Type at least two letters. Lecture recordings are searchable too — the transcript is indexed, so you can find something that was said out loud.",
  "search.nothing": "Nothing matches \u201c{query}\u201d",
  "search.nothingHint":
    "Try a word your notes would actually use. Search looks at the text inside your files, not just their names.",
  "search.inMaterial": "In your material",
  "search.teachMe": "Teach me this",

  /* feedback ---------------------------------------------------------------- */
  "feedback.open": "Send feedback",
  "feedback.title": "Something wrong, or an idea?",
  "feedback.lede":
    "What broke, what confused you, or what you wish it did. We'll see which page you were on.",
  "feedback.placeholder": "The board went blank when I…",
  "feedback.send": "Send",
  "feedback.sending": "Sending…",
  "feedback.sent": "Thank you — that genuinely helps.",
  "feedback.failed": "That didn't send. Try once more?",

  /* reminders and sharing ---------------------------------------------------- */
  "reminders.turnOn": "Remind me when cards are due",
  "reminders.on": "Reminders are on. They appear while TUTOR AI is open in a tab.",
  "reminders.blocked": "Reminders are blocked for this site in your browser settings.",
  "share.share": "Share",
  "share.making": "Making a link…",
  "share.copy": "Copy link",
  "share.copied": "Link copied",
  "share.stop": "stop sharing",

  /* the tour ------------------------------------------------------------- */
  "tour.app.title": "The board",
  "tour.app.what": "This is the lesson itself. You ask a question on the right and the tutor explains it out loud while writing on the whiteboard — equations, worked steps, diagrams, even pictures it draws for you.",
  "tour.app.how1": "Type what you're stuck on and press Enter. \"I don't get integration by parts\" is enough.",
  "tour.app.how2": "Interrupt whenever. Cutting in mid-lesson is the point — ask \"where did that 2 come from?\" and it backs up.",
  "tour.app.how3": "Drag the divider between the board and the chat to give either side more room.",
  "tour.app.how4": "Hit the speaker icon and the tutor reads along; hit the microphone and you can just talk to it.",
  "tour.materials.title": "Your material",
  "tour.materials.what": "Upload your own notes, slides, PDFs, a photo of your handwriting, or a recording of a lecture. The tutor teaches from what your course actually says, and tells you which page it got something from.",
  "tour.materials.how1": "Drop files onto the board's left panel, or paste text straight in.",
  "tour.materials.how2": "A lecture recording gets transcribed, so you can ask about something said at 14:20.",
  "tour.materials.how3": "Every card the tutor writes from your material is stamped with the file and page it came from.",
  "tour.search.title": "Search",
  "tour.search.what": "Everything you've uploaded and every lesson you've been taught, searchable by the words your notes actually use — including what was said out loud in a recorded lecture.",
  "tour.search.how1": "Search a topic, not a filename: it reads the text inside your files.",
  "tour.search.how2": "\"Teach me this\" on any result opens a lesson on that exact passage.",
  "tour.search.how3": "Lessons match on their board too, so you can find the one where you did it.",
  "tour.courses.title": "Subjects",
  "tour.courses.what": "Folders — Maths, Chemistry, whatever you study. File your material and past lessons into one and the tutor draws on everything in it, not just the file you happen to have open.",
  "tour.courses.how1": "Add a subject, then file material and lessons into it.",
  "tour.courses.how2": "Start a lesson from inside a subject and it already has the context.",
  "tour.courses.how3": "Ask about last week's topic mid-lesson and it has the notes for it.",
  "tour.voice.title": "Live voice",
  "tour.voice.what": "A spoken lesson. You talk, it talks back, and it writes on the board while it explains — the closest thing here to sitting next to someone.",
  "tour.voice.how1": "Press Start talking and just say what you're stuck on. Interrupt it like a person.",
  "tour.voice.how2": "It can search everything you've uploaded mid-sentence and quote your own notes back to you.",
  "tour.voice.how3": "The board it produces is saved to Lessons like any other, and exports the same way.",
  "tour.quiz.title": "Flashcards and review",
  "tour.quiz.what": "Quizzes built from your own material. Every question you answer becomes a review card, scheduled so it comes back just before you'd forget it.",
  "tour.quiz.how1": "Generate a quiz from a file or a subject and answer it.",
  "tour.quiz.how2": "Get one wrong and it comes back tomorrow; get it right and the gap stretches out.",
  "tour.quiz.how3": "Review shows what's ripe today. \"Teach me this one\" opens a lesson on anything you keep missing.",
  "tour.quiz.how4": "Turn on reminders there and it tells you when cards come due.",
  "tour.practice-exam.title": "Practice exams",
  "tour.practice-exam.what": "A full paper, weighted toward the things you actually got stuck on rather than an even spread. Sit it, submit it, and get it marked with working.",
  "tour.practice-exam.how1": "Pick a whole subject, or choose individual lessons.",
  "tour.practice-exam.how2": "\"Why these questions?\" shows what it thinks your weak spots are.",
  "tour.practice-exam.how3": "Already sat a real paper? Exam review reads a photo of the marked one and goes through it with you.",
  "tour.calendar.title": "Calendar",
  "tour.calendar.what": "Put your exam dates in and it works backwards into a study plan — every topic twice, then a full review the day before.",
  "tour.calendar.how1": "Add an exam or deadline with the topics it covers.",
  "tour.calendar.how2": "Say how many minutes a day you've actually got.",
  "tour.calendar.how3": "Build study plan, and each day gets sittings you can start straight from the calendar.",
  "tour.progress.title": "Progress",
  "tour.progress.what": "What's sticking and what isn't — your subjects ranked strongest to weakest from real quiz answers, not a streak counter. It also shows what the tutor has worked out about how you learn.",
  "tour.progress.how1": "Subjects rank themselves once you've answered enough questions to mean something.",
  "tour.progress.how2": "\"How you learn\" is the tutor's own notes — which explanations land for you, and what trips you up.",
  "tour.progress.how3": "You can delete any of that, or all of it, whenever you like.",
  "tour.sessions.title": "Keeping your work",
  "tour.sessions.what": "Every lesson is saved as you go, to your account rather than this browser — so you can pick one up on your phone exactly where you left it on a laptop.",
  "tour.sessions.how1": "Lessons lists everything, typed and spoken. Open one to carry on.",
  "tour.sessions.how2": "Export any board as a PDF, a Word document, an image, or Markdown notes.",
  "tour.sessions.how3": "The Export button sits in the board's own header too, mid-lesson.",
  "tour.sessions.how4": "Share turns a lesson into a read-only link for a classmate — and you can turn it off again.",

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
