// The catalogue of single-point symbols from MIL-STD-2525C, for browsing and
// searching. Multi-point tactical graphics are left out: they are drawn
// between several map points, not placed at one.
import { isValidSidc } from "./sidc";

export interface LibrarySymbol {
  name: string;
  /** Where it sits in the standard's tree, e.g. "Ground track, unit, combat". */
  path: string;
  category: string;
  /** 15-character letter code with `*` where the affiliation goes. */
  template: string;
  /** Lower-case text the search runs against. */
  haystack: string;
}

export const CATEGORIES = [
  { key: "GRDTRK_UNT", label: "Ground units" },
  { key: "GRDTRK_EQT", label: "Ground equipment" },
  { key: "GRDTRK_INS", label: "Ground installations" },
  { key: "AIRTRK", label: "Air" },
  { key: "SSUF", label: "Sea surface" },
  { key: "SBSUF", label: "Subsurface" },
  { key: "SPC", label: "Space" },
  { key: "SOFUNT", label: "Special operations" },
  { key: "SIGINT", label: "Signals intelligence" },
  { key: "STBOPS", label: "Stability operations" },
  { key: "EMS", label: "Emergency management" },
];

interface RawEntry {
  names: string[];
  codingscheme: string;
  battledimension: string;
  functionid: string;
  name: string;
}

/** "INFANTRY LIGHT" -> "Infantry light" */
function sentence(text: string) {
  const t = text.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

let cache: Promise<LibrarySymbol[]> | null = null;

/** Loads the catalogue on first use, so it stays out of the start-up download. */
export function loadLibrary(): Promise<LibrarySymbol[]> {
  cache ??= import("mil-std-2525").then(({ ms2525c }) => {
    const groups: Record<string, { mainIcon: RawEntry[] }> = {
      ...ms2525c.WAR,
      SIGINT: ms2525c.SIGINT,
      STBOPS: ms2525c.STBOPS,
      EMS: ms2525c.EMS,
    };
    const out: LibrarySymbol[] = [];
    for (const { key } of CATEGORIES) {
      for (const e of groups[key]?.mainIcon ?? []) {
        // Blank function ids are headings in the standard, not symbols.
        if (/^-+$/.test(e.functionid)) continue;
        const template = `${e.codingscheme}*${e.battledimension}P${e.functionid}`.padEnd(15, "-");
        if (!isValidSidc(template.replace("*", "F"))) continue;
        const name = sentence(e.name);
        const path = e.names.slice(0, -1).map(sentence).filter(Boolean).join(", ");
        out.push({ name, path, category: key, template, haystack: `${name} ${path}`.toLowerCase() });
      }
    }
    return out;
  });
  return cache;
}

/**
 * Symbols whose name or path contains every word of the query, best first:
 * names that start with the query, then shorter names.
 */
export function searchLibrary(all: LibrarySymbol[], query: string, category: string | null) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const q = words.join(" ");
  const hits = all.filter(
    (s) => (!category || s.category === category) && words.every((w) => s.haystack.includes(w))
  );
  if (!q) return hits;
  const rank = (s: LibrarySymbol) => {
    const n = s.name.toLowerCase();
    return (n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3) * 1000 + n.length;
  };
  return hits.sort((a, b) => rank(a) - rank(b));
}
