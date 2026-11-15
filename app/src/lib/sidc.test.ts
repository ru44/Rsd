import { describe, expect, it } from "vitest";
import { getAffiliation, parseSidc, setAffiliation } from "./sidc";
import { loadLibrary, searchLibrary } from "./symbolLibrary";

describe("parseSidc", () => {
  it("accepts a full letter code", () => {
    expect(parseSidc("SFGPUCI--------")).toEqual({ sidc: "SFGPUCI--------", kind: "letters" });
  });

  it("pads short letter codes and ignores case and spaces", () => {
    expect(parseSidc("  sfgpuci---  ")?.sidc).toBe("SFGPUCI--------");
    expect(parseSidc("SFGP UCI--- -----")?.sidc).toBe("SFGPUCI--------");
  });

  it("fills * placeholders with unknown affiliation and present status", () => {
    expect(parseSidc("S*G*UCI---*****")?.sidc).toBe("SUGPUCI--------");
  });

  it("accepts 20 and 30 digit number codes, however they are grouped", () => {
    expect(parseSidc("10031000001211000000")).toEqual({ sidc: "10031000001211000000", kind: "numbers" });
    expect(parseSidc("1003 1000 0012 1100 0000")?.sidc).toBe("10031000001211000000");
    expect(parseSidc("10-03-10-0-0-00-121100-00-00")?.sidc).toBe("10031000001211000000");
    expect(parseSidc("130310000012110000000000000000")?.kind).toBe("numbers");
  });

  it("rejects things that are not symbol codes", () => {
    for (const bad of ["", "infantry", "RECONNAISSANCE", "12345", "ZZZZZZZZZZ", "1003100000121100000"]) {
      expect(parseSidc(bad)).toBeNull();
    }
  });
});

describe("affiliation", () => {
  it("reads and changes it in letter codes", () => {
    expect(getAffiliation("SFGPUCI--------")).toBe("F");
    expect(setAffiliation("SFGPUCI--------", "H")).toBe("SHGPUCI--------");
    expect(getAffiliation("SAGPUCI--------")).toBe("F"); // assumed friend
  });

  it("reads and changes it in number codes", () => {
    expect(getAffiliation("10031000001211000000")).toBe("F");
    expect(setAffiliation("10031000001211000000", "H")).toBe("10061000001211000000");
    expect(getAffiliation("10061000001211000000")).toBe("H");
  });

  it("keeps a changed code valid", () => {
    for (const a of ["F", "H", "N", "U"] as const) {
      expect(parseSidc(setAffiliation("SFGPUCI--------", a))).not.toBeNull();
      expect(parseSidc(setAffiliation("10031000001211000000", a))).not.toBeNull();
    }
  });
});

describe("symbol library", () => {
  it("holds over a thousand placeable symbols across every category", async () => {
    const all = await loadLibrary();
    expect(all.length).toBeGreaterThan(1200);
    expect(new Set(all.map((s) => s.category)).size).toBe(11);
    expect(all.every((s) => s.template.length === 15 && s.template[1] === "*")).toBe(true);
    expect(all.some((s) => s.path.startsWith(",") || s.path.includes(", ,"))).toBe(false);
  });

  it("finds infantry first when asked for infantry", async () => {
    const hits = searchLibrary(await loadLibrary(), "infantry", null);
    expect(hits[0].name).toBe("Infantry");
    expect(hits[0].template).toBe("S*GPUCI--------");
    expect(hits.length).toBeGreaterThan(5);
  });

  it("matches every word, in any order, and respects the category", async () => {
    const all = await loadLibrary();
    const hits = searchLibrary(all, "light infantry", null);
    expect(hits.some((s) => s.name === "Infantry light")).toBe(true);
    expect(searchLibrary(all, "infantry", "AIRTRK")).toEqual([]);
    expect(searchLibrary(all, "", "SPC").every((s) => s.category === "SPC")).toBe(true);
  });
});
