// Reading and adjusting military symbol codes (SIDCs), in the two layouts in
// use: letter codes (MIL-STD-2525B/C, APP-6A/B) and number codes
// (MIL-STD-2525D/E, APP-6D/E).
import ms from "milsymbol";

export type SidcKind = "letters" | "numbers";
export type Affiliation = "F" | "H" | "N" | "U";
export const AFFILIATIONS: { key: Affiliation; label: string; color: string }[] = [
  { key: "F", label: "Friend", color: "#80E0FF" },
  { key: "H", label: "Hostile", color: "#FF8080" },
  { key: "N", label: "Neutral", color: "#AAFFAA" },
  { key: "U", label: "Unknown", color: "#FFFF80" },
];

// Number codes carry the affiliation as one digit ("standard identity").
const DIGIT: Record<Affiliation, string> = { U: "1", F: "3", N: "4", H: "6" };
const FROM_DIGIT: Record<string, Affiliation> = { "0": "U", "1": "U", "2": "F", "3": "F", "4": "N", "5": "H", "6": "H" };
// Letter codes have more affiliations than the four offered; map each to its family.
const FROM_LETTER: Record<string, Affiliation> = {
  F: "F", A: "F", D: "F", M: "F", H: "H", S: "H", J: "H", K: "H", N: "N", L: "N",
};

export function sidcKind(sidc: string): SidcKind {
  return /^\d/.test(sidc) ? "numbers" : "letters";
}

export function isValidSidc(sidc: string): boolean {
  try {
    return new ms.Symbol(sidc).isValid();
  } catch {
    return false;
  }
}

/**
 * Turns what a person typed or pasted into a usable code, or null.
 * Accepts letter codes of 10 to 15 characters (with `*` or `-` fillers) and
 * number codes of 20 or 30 digits, in any case, with spaces, dashes or dots
 * between groups.
 */
export function parseSidc(input: string): { sidc: string; kind: SidcKind } | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;

  const digits = raw.replace(/[\s.\-_:]/g, "");
  if (/^\d+$/.test(digits)) {
    if (digits.length !== 20 && digits.length !== 30) return null;
    return isValidSidc(digits) ? { sidc: digits, kind: "numbers" } : null;
  }

  const letters = raw.replace(/\s/g, "");
  if (!/^[A-Z][A-Z0-9*-]{9,14}$/.test(letters)) return null;
  // `*` means "not specified": unknown affiliation, present status, else blank.
  const filled = [...letters.padEnd(15, "-")]
    .map((ch, i) => (ch !== "*" ? ch : i === 1 ? "U" : i === 3 ? "P" : "-"))
    .join("");
  return isValidSidc(filled) ? { sidc: filled, kind: "letters" } : null;
}

export function getAffiliation(sidc: string): Affiliation {
  return sidcKind(sidc) === "numbers"
    ? FROM_DIGIT[sidc[3]] ?? "U"
    : FROM_LETTER[sidc[1]] ?? "U";
}

export function setAffiliation(sidc: string, affiliation: Affiliation): string {
  return sidcKind(sidc) === "numbers"
    ? sidc.slice(0, 3) + DIGIT[affiliation] + sidc.slice(4)
    : sidc[0] + affiliation + sidc.slice(2);
}

export function describeKind(kind: SidcKind): string {
  return kind === "numbers"
    ? "Number code (MIL-STD-2525D, APP-6D)"
    : "Letter code (MIL-STD-2525C, APP-6B)";
}
