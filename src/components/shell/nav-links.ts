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
  label: string;
  /** Short line shown in the menu, where there's room for it. */
  blurb: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/app", label: "Board", blurb: "The live whiteboard lesson" },
  { href: "/materials", label: "Material", blurb: "Everything you've uploaded" },
  { href: "/courses", label: "Courses", blurb: "Group material by class" },
  { href: "/calendar", label: "Calendar", blurb: "Exams and your study plan" },
  { href: "/quiz", label: "Flashcards", blurb: "Quick quizzes from your notes" },
  { href: "/practice-exam", label: "Practice exam", blurb: "A full paper on your weak spots" },
  { href: "/exam-review", label: "Exam review", blurb: "Go through a marked paper" },
  { href: "/review", label: "Review", blurb: "Cards due today" },
  { href: "/progress", label: "Progress", blurb: "Mastery and what's coming due" },
  { href: "/sessions", label: "Lessons", blurb: "Past lessons, resumable" },
  { href: "/voice", label: "Live voice", blurb: "Talk to the tutor out loud" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
