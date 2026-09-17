/**
 * Every destination in the app, in one place.
 *
 * The board and the flashcards page own their whole viewport and have their
 * own headers, so they can't use the standard nav bar — which is exactly how
 * /practice-exam ended up unreachable from the page most people land on. One
 * list, two presentations: the bar on ordinary pages, a menu everywhere else.
 */

export interface NavLink {
  href: string;
  /** English label, and the fallback when a locale has no translation. */
  label: string;
  /** Dictionary key, so a translated locale can replace the label. */
  key: string;
  /** Short line shown in the menu, where there's room for it. */
  blurb: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/app", label: "Board", key: "nav.board", blurb: "The live whiteboard lesson" },
  { href: "/search", label: "Search", key: "nav.search", blurb: "Find anything you've uploaded or been taught" },
  { href: "/materials", label: "Material", key: "nav.material", blurb: "Everything you've uploaded" },
  { href: "/courses", label: "Subjects", key: "nav.subjects", blurb: "Folders for each subject" },
  { href: "/calendar", label: "Calendar", key: "nav.calendar", blurb: "Exams and your study plan" },
  { href: "/quiz", label: "Flashcards", key: "nav.flashcards", blurb: "Quick quizzes from your notes" },
  { href: "/practice-exam", label: "Practice exam", key: "nav.practiceExam", blurb: "A full paper on your weak spots" },
  { href: "/exam-review", label: "Exam review", key: "nav.examReview", blurb: "Go through a marked paper" },
  { href: "/review", label: "Review", key: "nav.review", blurb: "Cards due today" },
  { href: "/progress", label: "Progress", key: "nav.progress", blurb: "Mastery and what's coming due" },
  { href: "/sessions", label: "Lessons", key: "nav.lessons", blurb: "Past lessons, resumable" },
  { href: "/voice", label: "Live voice", key: "nav.liveVoice", blurb: "Talk to the tutor out loud" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
