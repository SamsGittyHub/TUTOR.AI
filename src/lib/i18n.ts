"use client";

import { DEFAULT_LANGUAGE } from "./languages";

/**
 * The app's own interface strings.
 *
 * Honest about what this is: hand-written translations, and they exist only
 * for the locales someone has actually written. The language picker offers all
 * 182 because the *tutor* works in all 182 — it's told which language to teach
 * in and does — but the buttons around it fall back to English until a
 * translation is added here.
 *
 * Pretending otherwise would be worse than the fallback: a student who picks
 * Yoruba and sees an English interface understands what happened; one who sees
 * a machine-mangled interface assumes the whole product is broken.
 *
 * Adding a locale is adding one object below. Nothing else changes.
 */

export type Dict = Record<string, string>;

const en: Dict = {
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
  "account.signOut": "Sign out",
  "account.language": "Language",
  "account.settings": "Settings",
  "language.search": "Search languages",
  "language.tutorNote":
    "The tutor teaches in any language here. The app's own labels are translated for a few so far, and fall back to English otherwise.",
};

/**
 * Locales with a real translation. Everything else falls back to English, and
 * the picker says so rather than implying coverage that isn't there.
 */
const DICTS: Record<string, Dict> = {
  en,
  es: {
    ...en,
    "nav.board": "Pizarra",
    "nav.material": "Material",
    "nav.subjects": "Asignaturas",
    "nav.calendar": "Calendario",
    "nav.flashcards": "Tarjetas",
    "nav.practiceExam": "Examen de práctica",
    "nav.examReview": "Revisión de examen",
    "nav.review": "Repaso",
    "nav.progress": "Progreso",
    "nav.lessons": "Lecciones",
    "nav.liveVoice": "Voz en directo",
    "account.signOut": "Cerrar sesión",
    "account.language": "Idioma",
    "account.settings": "Ajustes",
    "language.search": "Buscar idiomas",
  },
  fr: {
    ...en,
    "nav.board": "Tableau",
    "nav.material": "Documents",
    "nav.subjects": "Matières",
    "nav.calendar": "Calendrier",
    "nav.flashcards": "Cartes",
    "nav.practiceExam": "Examen blanc",
    "nav.examReview": "Correction d'examen",
    "nav.review": "Révision",
    "nav.progress": "Progression",
    "nav.lessons": "Leçons",
    "nav.liveVoice": "Voix en direct",
    "account.signOut": "Se déconnecter",
    "account.language": "Langue",
    "account.settings": "Paramètres",
    "language.search": "Rechercher une langue",
  },
};

/** True when the interface itself is translated, not just the tutor. */
export function hasUiTranslation(code: string): boolean {
  return code !== DEFAULT_LANGUAGE && code in DICTS;
}

export function translate(code: string, key: string): string {
  return DICTS[code]?.[key] ?? en[key] ?? key;
}

export const TRANSLATED_LOCALES = Object.keys(DICTS);
