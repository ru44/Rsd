// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { savedLevel, savedSwitch } from "./prefs";

describe("saved choices", () => {
  it("remember a level between visits", async () => {
    localStorage.clear();
    const a = savedLevel("t.level", 1);
    expect(a.value).toBe(1);
    a.value = 0.4;
    await nextTick();
    expect(savedLevel("t.level", 1).value).toBe(0.4);
  });
  it("keep a stored level between 0 and 1, and ignore rubbish", () => {
    localStorage.setItem("t.big", "7");
    localStorage.setItem("t.bad", "half");
    localStorage.setItem("t.empty", "");
    expect(savedLevel("t.big", 0.5).value).toBe(1);
    expect(savedLevel("t.bad", 0.5).value).toBe(0.5);
    expect(savedLevel("t.empty", 0.5).value).toBe(0.5);
  });
  it("remember a switch", async () => {
    localStorage.clear();
    const s = savedSwitch("t.on", true);
    s.value = false;
    await nextTick();
    expect(savedSwitch("t.on", true).value).toBe(false);
  });
});
