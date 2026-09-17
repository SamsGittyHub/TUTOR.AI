/**
 * Every language the tutor will work in.
 *
 * Generated from the runtime's own ICU data rather than typed out, so the
 * names are correct and each is also given in its own script — a picker that
 * only says "Japanese" is no use to someone who reads 日本語.
 *
 * Two different things are meant by "in this language", and they behave
 * differently, which the UI has to be honest about:
 *
 *   - What the tutor says and writes. This works in all of them: the model is
 *     told to teach in the chosen language, and does.
 *   - The app's own buttons and labels. Those are translated strings, and only
 *     exist for locales someone has actually written. See i18n.ts.
 */

export interface Language {
  code: string;
  /** English name, for scanning a long list. */
  name: string;
  /** Endonym - the name in its own language. */
  native: string;
}

export const LANGUAGES: Language[] = [
  { code: "ab", name: "Abkhazian", native: "Abkhazian" },
  { code: "aa", name: "Afar", native: "Afar" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "ak", name: "Akan", native: "Akan" },
  { code: "sq", name: "Albanian", native: "shqip" },
  { code: "am", name: "Amharic", native: "\u12a0\u121b\u122d\u129b" },
  { code: "ar", name: "Arabic", native: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
  { code: "an", name: "Aragonese", native: "Aragonese" },
  { code: "hy", name: "Armenian", native: "\u0570\u0561\u0575\u0565\u0580\u0565\u0576" },
  { code: "as", name: "Assamese", native: "\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be" },
  { code: "av", name: "Avaric", native: "Avaric" },
  { code: "ae", name: "Avestan", native: "Avestan" },
  { code: "ay", name: "Aymara", native: "Aymara" },
  { code: "az", name: "Azerbaijani", native: "az\u0259rbaycan" },
  { code: "bm", name: "Bambara", native: "bamanakan" },
  { code: "ba", name: "Bashkir", native: "Bashkir" },
  { code: "eu", name: "Basque", native: "euskara" },
  { code: "be", name: "Belarusian", native: "\u0431\u0435\u043b\u0430\u0440\u0443\u0441\u043a\u0430\u044f" },
  { code: "bn", name: "Bangla", native: "\u09ac\u09be\u0982\u09b2\u09be" },
  { code: "bi", name: "Bislama", native: "Bislama" },
  { code: "bs", name: "Bosnian", native: "bosanski" },
  { code: "br", name: "Breton", native: "brezhoneg" },
  { code: "bg", name: "Bulgarian", native: "\u0431\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438" },
  { code: "my", name: "Burmese", native: "\u1019\u103c\u1014\u103a\u1019\u102c" },
  { code: "ca", name: "Catalan", native: "catal\u00e0" },
  { code: "ch", name: "Chamorro", native: "Chamorro" },
  { code: "ce", name: "Chechen", native: "\u043d\u043e\u0445\u0447\u0438\u0439\u043d" },
  { code: "ny", name: "Nyanja", native: "Nyanja" },
  { code: "zh", name: "Chinese", native: "\u4e2d\u6587" },
  { code: "cv", name: "Chuvash", native: "\u0447\u04d1\u0432\u0430\u0448" },
  { code: "kw", name: "Cornish", native: "kernewek" },
  { code: "co", name: "Corsican", native: "Corsican" },
  { code: "cr", name: "Cree", native: "Cree" },
  { code: "hr", name: "Croatian", native: "hrvatski" },
  { code: "cs", name: "Czech", native: "\u010de\u0161tina" },
  { code: "da", name: "Danish", native: "dansk" },
  { code: "dv", name: "Divehi", native: "Divehi" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "dz", name: "Dzongkha", native: "\u0f62\u0fab\u0f7c\u0f44\u0f0b\u0f41" },
  { code: "en", name: "English", native: "English" },
  { code: "eo", name: "Esperanto", native: "Esperanto" },
  { code: "et", name: "Estonian", native: "eesti" },
  { code: "ee", name: "Ewe", native: "e\u028begbe" },
  { code: "fo", name: "Faroese", native: "f\u00f8royskt" },
  { code: "fj", name: "Fijian", native: "Fijian" },
  { code: "fi", name: "Finnish", native: "suomi" },
  { code: "fr", name: "French", native: "fran\u00e7ais" },
  { code: "ff", name: "Fula", native: "Pulaar" },
  { code: "gl", name: "Galician", native: "galego" },
  { code: "ka", name: "Georgian", native: "\u10e5\u10d0\u10e0\u10d7\u10e3\u10da\u10d8" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "el", name: "Greek", native: "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac" },
  { code: "gn", name: "Guarani", native: "Guarani" },
  { code: "gu", name: "Gujarati", native: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0" },
  { code: "ht", name: "Haitian Creole", native: "Haitian Creole" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "he", name: "Hebrew", native: "\u05e2\u05d1\u05e8\u05d9\u05ea" },
  { code: "hz", name: "Herero", native: "Herero" },
  { code: "hi", name: "Hindi", native: "\u0939\u093f\u0928\u094d\u0926\u0940" },
  { code: "ho", name: "Hiri Motu", native: "Hiri Motu" },
  { code: "hu", name: "Hungarian", native: "magyar" },
  { code: "ia", name: "Interlingua", native: "interlingua" },
  { code: "id", name: "Indonesian", native: "Indonesia" },
  { code: "ie", name: "Interlingue", native: "Interlingue" },
  { code: "ga", name: "Irish", native: "Gaeilge" },
  { code: "ig", name: "Igbo", native: "Igbo" },
  { code: "ik", name: "Inupiaq", native: "Inupiaq" },
  { code: "io", name: "Ido", native: "Ido" },
  { code: "is", name: "Icelandic", native: "\u00edslenska" },
  { code: "it", name: "Italian", native: "italiano" },
  { code: "iu", name: "Inuktitut", native: "Inuktitut" },
  { code: "ja", name: "Japanese", native: "\u65e5\u672c\u8a9e" },
  { code: "jv", name: "Javanese", native: "Jawa" },
  { code: "kl", name: "Kalaallisut", native: "kalaallisut" },
  { code: "kn", name: "Kannada", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1" },
  { code: "kr", name: "Kanuri", native: "Kanuri" },
  { code: "ks", name: "Kashmiri", native: "\u06a9\u0672\u0634\u064f\u0631" },
  { code: "kk", name: "Kazakh", native: "\u049b\u0430\u0437\u0430\u049b \u0442\u0456\u043b\u0456" },
  { code: "km", name: "Khmer", native: "\u1781\u17d2\u1798\u17c2\u179a" },
  { code: "ki", name: "Kikuyu", native: "Gikuyu" },
  { code: "rw", name: "Kinyarwanda", native: "Ikinyarwanda" },
  { code: "ky", name: "Kyrgyz", native: "\u043a\u044b\u0440\u0433\u044b\u0437\u0447\u0430" },
  { code: "kv", name: "Komi", native: "Komi" },
  { code: "kg", name: "Kongo", native: "Kongo" },
  { code: "ko", name: "Korean", native: "\ud55c\uad6d\uc5b4" },
  { code: "ku", name: "Kurdish", native: "kurd\u00ee (kurmanc\u00ee)" },
  { code: "kj", name: "Kuanyama", native: "Kuanyama" },
  { code: "la", name: "Latin", native: "Latin" },
  { code: "lb", name: "Luxembourgish", native: "L\u00ebtzebuergesch" },
  { code: "lg", name: "Ganda", native: "Luganda" },
  { code: "li", name: "Limburgish", native: "Limburgish" },
  { code: "ln", name: "Lingala", native: "ling\u00e1la" },
  { code: "lo", name: "Lao", native: "\u0ea5\u0eb2\u0ea7" },
  { code: "lt", name: "Lithuanian", native: "lietuvi\u0173" },
  { code: "lu", name: "Luba-Katanga", native: "Tshiluba" },
  { code: "lv", name: "Latvian", native: "latvie\u0161u" },
  { code: "gv", name: "Manx", native: "Gaelg" },
  { code: "mk", name: "Macedonian", native: "\u043c\u0430\u043a\u0435\u0434\u043e\u043d\u0441\u043a\u0438" },
  { code: "mg", name: "Malagasy", native: "Malagasy" },
  { code: "ms", name: "Malay", native: "Melayu" },
  { code: "ml", name: "Malayalam", native: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02" },
  { code: "mt", name: "Maltese", native: "Malti" },
  { code: "mi", name: "M\u0101ori", native: "M\u0101ori" },
  { code: "mr", name: "Marathi", native: "\u092e\u0930\u093e\u0920\u0940" },
  { code: "mh", name: "Marshallese", native: "Marshallese" },
  { code: "mn", name: "Mongolian", native: "\u043c\u043e\u043d\u0433\u043e\u043b" },
  { code: "na", name: "Nauru", native: "Nauru" },
  { code: "nv", name: "Navajo", native: "Navajo" },
  { code: "nd", name: "North Ndebele", native: "isiNdebele" },
  { code: "ne", name: "Nepali", native: "\u0928\u0947\u092a\u093e\u0932\u0940" },
  { code: "ng", name: "Ndonga", native: "Ndonga" },
  { code: "nb", name: "Norwegian Bokm\u00e5l", native: "norsk bokm\u00e5l" },
  { code: "nn", name: "Norwegian Nynorsk", native: "norsk nynorsk" },
  { code: "no", name: "Norwegian", native: "norsk" },
  { code: "ii", name: "Sichuan Yi", native: "\ua188\ua320\ua259" },
  { code: "nr", name: "South Ndebele", native: "South Ndebele" },
  { code: "oc", name: "Occitan", native: "occitan" },
  { code: "oj", name: "Ojibwa", native: "Ojibwa" },
  { code: "cu", name: "Church Slavic", native: "Church Slavic" },
  { code: "om", name: "Oromo", native: "Oromoo" },
  { code: "or", name: "Odia", native: "\u0b13\u0b21\u0b3c\u0b3f\u0b06" },
  { code: "os", name: "Ossetic", native: "\u0438\u0440\u043e\u043d" },
  { code: "pa", name: "Punjabi", native: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40" },
  { code: "pi", name: "Pali", native: "Pali" },
  { code: "fa", name: "Persian", native: "\u0641\u0627\u0631\u0633\u06cc" },
  { code: "pl", name: "Polish", native: "polski" },
  { code: "ps", name: "Pashto", native: "\u067e\u069a\u062a\u0648" },
  { code: "pt", name: "Portuguese", native: "portugu\u00eas" },
  { code: "qu", name: "Quechua", native: "Runasimi" },
  { code: "rm", name: "Romansh", native: "rumantsch" },
  { code: "rn", name: "Rundi", native: "Ikirundi" },
  { code: "ro", name: "Romanian", native: "rom\u00e2n\u0103" },
  { code: "ru", name: "Russian", native: "\u0440\u0443\u0441\u0441\u043a\u0438\u0439" },
  { code: "sa", name: "Sanskrit", native: "\u0938\u0902\u0938\u094d\u0915\u0943\u0924 \u092d\u093e\u0937\u093e" },
  { code: "sc", name: "Sardinian", native: "sardu" },
  { code: "sd", name: "Sindhi", native: "\u0633\u0646\u068c\u064a" },
  { code: "se", name: "Northern Sami", native: "davvis\u00e1megiella" },
  { code: "sm", name: "Samoan", native: "Samoan" },
  { code: "sg", name: "Sango", native: "S\u00e4ng\u00f6" },
  { code: "sr", name: "Serbian", native: "\u0441\u0440\u043f\u0441\u043a\u0438" },
  { code: "gd", name: "Scottish Gaelic", native: "G\u00e0idhlig" },
  { code: "sn", name: "Shona", native: "chiShona" },
  { code: "si", name: "Sinhala", native: "\u0dc3\u0dd2\u0d82\u0dc4\u0dbd" },
  { code: "sk", name: "Slovak", native: "sloven\u010dina" },
  { code: "sl", name: "Slovenian", native: "sloven\u0161\u010dina" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "st", name: "Southern Sotho", native: "Sesotho" },
  { code: "es", name: "Spanish", native: "espa\u00f1ol" },
  { code: "su", name: "Sundanese", native: "Basa Sunda" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "ss", name: "Swati", native: "Swati" },
  { code: "sv", name: "Swedish", native: "svenska" },
  { code: "ta", name: "Tamil", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd" },
  { code: "te", name: "Telugu", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41" },
  { code: "tg", name: "Tajik", native: "\u0442\u043e\u04b7\u0438\u043a\u04e3" },
  { code: "th", name: "Thai", native: "\u0e44\u0e17\u0e22" },
  { code: "ti", name: "Tigrinya", native: "\u1275\u130d\u122d\u129b" },
  { code: "bo", name: "Tibetan", native: "\u0f56\u0f7c\u0f51\u0f0b\u0f66\u0f90\u0f51\u0f0b" },
  { code: "tk", name: "Turkmen", native: "t\u00fcrkmen dili" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "tn", name: "Tswana", native: "Setswana" },
  { code: "to", name: "Tongan", native: "lea fakatonga" },
  { code: "tr", name: "Turkish", native: "T\u00fcrk\u00e7e" },
  { code: "ts", name: "Tsonga", native: "Tsonga" },
  { code: "tt", name: "Tatar", native: "\u0442\u0430\u0442\u0430\u0440" },
  { code: "tw", name: "Akan", native: "Akan" },
  { code: "ty", name: "Tahitian", native: "Tahitian" },
  { code: "ug", name: "Uyghur", native: "\u0626\u06c7\u064a\u063a\u06c7\u0631\u0686\u06d5" },
  { code: "uk", name: "Ukrainian", native: "\u0443\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430" },
  { code: "ur", name: "Urdu", native: "\u0627\u0631\u062f\u0648" },
  { code: "uz", name: "Uzbek", native: "o\u2018zbek" },
  { code: "ve", name: "Venda", native: "Venda" },
  { code: "vi", name: "Vietnamese", native: "Ti\u1ebfng Vi\u1ec7t" },
  { code: "vo", name: "Volap\u00fck", native: "Volap\u00fck" },
  { code: "wa", name: "Walloon", native: "Walloon" },
  { code: "cy", name: "Welsh", native: "Cymraeg" },
  { code: "wo", name: "Wolof", native: "Wolof" },
  { code: "xh", name: "Xhosa", native: "IsiXhosa" },
  { code: "yi", name: "Yiddish", native: "\u05d9\u05d9\u05b4\u05d3\u05d9\u05e9" },
  { code: "yo", name: "Yoruba", native: "\u00c8d\u00e8 Yor\u00f9b\u00e1" },
  { code: "za", name: "Zhuang", native: "Vahcuengh" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
];

export const DEFAULT_LANGUAGE = "en";

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/** The name to put in a prompt, so the model is in no doubt which is meant. */
export function languageLabel(code: string): string {
  const language = languageByCode(code);
  if (!language) return "English";
  return language.native === language.name
    ? language.name
    : language.name + " (" + language.native + ")";
}

/**
 * Right-to-left scripts, so the page can set AGENTS.md	node_modules	    public	  tests
CLAUDE.md	package.json	    railway.json  tsconfig.json
migrations	package-lock.json   README.md	  tsconfig.tsbuildinfo
next.config.ts	postcss.config.mjs  scripts
next-env.d.ts	PRD-ai-tutor.md     src correctly. Arabic, Hebrew,
 * Persian, Urdu and the rest read the other way, and a left-aligned interface
 * wrapped around right-aligned text is worse than no translation at all.
 */
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "dv", "ku", "ug"]);

export function isRtl(code: string): boolean {
  return RTL.has(code);
}
