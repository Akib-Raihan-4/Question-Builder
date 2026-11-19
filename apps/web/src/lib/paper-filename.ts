/**
 * Parse past-paper metadata from a file name, for bulk ZIP upload.
 *
 * Supported:
 *   4MA1_1H_2020_06_qp.pdf                         (plan's canonical form)
 *   IGCSE_MATHEMATICS_B_2021_MayJune_P1_QP.pdf     (common download-site form)
 *   WPH13_01_que_20240123.pdf                      (Pearson's own file names)
 * Anything else is read from the cover page instead (see /api/admin/papers/inspect).
 */

export type ParsedPaperName = {
  specCode: string;
  paperCode: string; // "4MA1/1H", "4MB1/01"
  series: Series;
  year: number;
  tier: "F" | "H" | null;
};

/** "Specimen" = specimen / sample assessment papers (the year is the one they're dated). */
export const SERIES = ["January", "June", "October", "November", "Specimen"] as const;
export type Series = (typeof SERIES)[number];

const SUBJECT_WORDS: Record<string, string> = {
  MATHEMATICS_A: "4MA1",
  MATHS_A: "4MA1",
  MATHEMATICS_B: "4MB1",
  MATHS_B: "4MB1",
  PHYSICS: "4PH1",
  CHEMISTRY: "4CH1",
  BIOLOGY: "4BI1",
};

const MONTH_TO_SERIES: Record<string, Series> = {
  "01": "January", "1": "January", JAN: "January", JANUARY: "January",
  "05": "June", "06": "June", "5": "June", "6": "June", MAY: "June", JUN: "June", JUNE: "June",
  MAYJUNE: "June", MJ: "June", SUMMER: "June",
  "11": "November", NOV: "November", NOVEMBER: "November", OCTNOV: "November", ON: "November",
  "10": "October", OCT: "October", OCTOBER: "October",
  SPECIMEN: "Specimen", SPEC: "Specimen", SAM: "Specimen", SAMS: "Specimen",
};

/** A regional paper's code ends in R after its tier letter: 4MB1/02R, 4MA1/1HR. */
export const isRegional = (paperCode: string) => /\/\d{1,2}[FH]?R$/i.test(paperCode.trim());

/** Add or remove the regional R on a paper code ("4MB1/02" ⇄ "4MB1/02R"). */
export function withRegional(paperCode: string, on: boolean): string {
  const code = paperCode.trim().toUpperCase();
  if (!/\/\d{1,2}[FH]?R?$/.test(code)) return code; // not a standard code: leave it alone
  const base = code.replace(/R$/, "");
  return on ? `${base}R` : base;
}

/** Paper part of a code: "1H" stays, "1" → "01", "1R" → "01R". */
export function normalizePaper(raw: string): { paper: string; tier: "F" | "H" | null } {
  const m = raw.toUpperCase().match(/^P?(\d{1,2})([FHR]{0,2})$/);
  if (!m) return { paper: raw.toUpperCase(), tier: null };
  const [, num, suffix] = m;
  const tier = suffix.startsWith("F") ? "F" : suffix.startsWith("H") ? "H" : null;
  // Tiered papers (Maths A, sciences) are written "1H"; untiered ones (Maths B) "01".
  const paper = tier ? `${Number(num)}${suffix}` : `${num.padStart(2, "0")}${suffix}`;
  return { paper, tier };
}

export function parsePaperFilename(filename: string): ParsedPaperName | null {
  const base = filename.split(/[\\/]/).pop()!.replace(/\.pdf$/i, "").toUpperCase();

  // 4MA1_1H_2020_06_qp
  let m = base.match(/^(4[A-Z]{2}\d)[_\- ]+([0-9]{1,2}[A-Z]{0,2})[_\- ]+(20\d{2})[_\- ]+([A-Z0-9]+)[_\- ]+QP(?:[_\- ]|$)/);
  if (m) {
    const [, specCode, paperRaw, year, month] = m;
    const series = MONTH_TO_SERIES[month];
    if (!series) return null;
    const { paper, tier } = normalizePaper(paperRaw);
    return { specCode, paperCode: `${specCode}/${paper}`, series, year: Number(year), tier };
  }

  // IGCSE_MATHEMATICS_B_2021_MAYJUNE_P1_QP[_anything]
  m = base.match(/^(?:IGCSE_)?([A-Z_]+?)_(20\d{2})_([A-Z]+)_(P\d{1,2}[A-Z]{0,2})_QP(?:[_\- ]|$)/);
  if (m) {
    const [, subjectWords, year, month, paperRaw] = m;
    const specCode = SUBJECT_WORDS[subjectWords];
    const series = MONTH_TO_SERIES[month];
    if (!specCode || !series) return null;
    const { paper, tier } = normalizePaper(paperRaw);
    return { specCode, paperCode: `${specCode}/${paper}`, series, year: Number(year), tier };
  }

  // WPH13_01_que_20240123 / 4MA1_1H_que_20200605 (Pearson qualifications site)
  m = base.match(/^([0-9A-Z]{4,6})_([0-9]{1,2}[A-Z]{0,3})_(?:QUE|QP)_(20\d{2})(\d{2})\d{2}/);
  if (m) {
    const [, specCode, paperRaw, year, month] = m;
    const series = MONTH_TO_SERIES[month];
    if (!series) return null;
    const { paper, tier } = normalizePaper(paperRaw);
    return { specCode, paperCode: `${specCode}/${paper}`, series, year: Number(year), tier };
  }

  return null;
}
