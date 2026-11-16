import { beforeEach, describe, expect, it } from "vitest";
import { canRedo, canUndo, clearHistory, idTracker, record, redo, undo } from "./history";

describe("history", () => {
  beforeEach(clearHistory);
  it("takes changes back and makes them again, newest first", async () => {
    const log: string[] = [];
    for (const n of ["a", "b"]) record({ undo: () => void log.push(`-${n}`), redo: () => void log.push(`+${n}`) });
    await undo();
    await undo();
    await undo(); // nothing left: no effect
    await redo();
    expect(log).toEqual(["-b", "-a", "+a"]);
    expect([canUndo.value, canRedo.value]).toEqual([true, true]);
  });
  it("forgets what could be redone once something new happens", async () => {
    record({ undo() {}, redo() {} });
    await undo();
    record({ undo() {}, redo() {} });
    expect(canRedo.value).toBe(false);
  });
  it("does not record changes made while replaying a step", async () => {
    record({ undo: () => record({ undo() {}, redo() {} }), redo() {} });
    await undo();
    expect(canUndo.value).toBe(false);
  });
  it("follows an item through new numbers", () => {
    const ids = idTracker();
    ids.renumber(1, 7);
    ids.renumber(1, 12);
    expect(ids.current(1)).toBe(12);
    expect(ids.current(7)).toBe(12);
    expect(ids.current(3)).toBe(3);
  });
});
