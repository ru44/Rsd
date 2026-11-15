import { beforeAll, describe, expect, it } from "vitest";
import { countryName, fold, searchPlaces, setPlaces, viewHeightM } from "./places";

beforeAll(() =>
  setPlaces([
    ["Jeddah", "SA", 21.49, 39.19, 4_697_000, "جدة"],
    ["Paris", "FR", 48.85, 2.35, 2_138_000],
    ["Sulţānah", "SA", 24.49, 39.59, 946_000],
    ["San José", "CR", 9.93, -84.08, 335_000],
    ["New Paris", "US", 39.86, -84.79, 20_000],
    ["Paris", "US", 33.66, -95.56, 25_000],
    ["Parisot", "FR", 44.26, 1.86, 16_000],
  ])
);

describe("place search", () => {
  it("ignores case and accents", () => {
    expect(fold("Sulţānah")).toBe("sultanah");
    expect(searchPlaces("sultanah")[0].name).toBe("Sulţānah");
    expect(searchPlaces("SAN JOSE")[0].name).toBe("San José");
  });
  it("puts exact names first, then starts, then words, biggest first", () => {
    expect(searchPlaces("paris").map((p) => `${p.name} ${p.country}`)).toEqual([
      "Paris FR",
      "Paris US",
      "Parisot FR",
      "New Paris US",
    ]);
  });
  it("narrows by country code or name", () => {
    expect(searchPlaces("paris, us").map((p) => p.name)).toEqual(["Paris", "New Paris"]);
    expect(searchPlaces("paris, united").map((p) => p.country)).toEqual(["US", "US"]);
  });
  it("finds Arabic names", () => {
    expect(searchPlaces("جدة")[0].name).toBe("Jeddah");
  });
  it("needs two letters, and respects the limit", () => {
    expect(searchPlaces("p")).toEqual([]);
    expect(searchPlaces("par", 2)).toHaveLength(2);
    expect(searchPlaces("nowhere at all")).toEqual([]);
  });
  it("names countries and picks a view height", () => {
    expect(countryName("SA")).toBe("Saudi Arabia");
    expect(viewHeightM(8_000_000)).toBeGreaterThan(viewHeightM(50_000));
  });
});
