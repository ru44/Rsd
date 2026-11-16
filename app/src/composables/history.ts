import { ref } from "vue";

// Undo and redo. Every change a person makes to the map hands in a pair of
// actions: one that takes the change back, one that makes it again.

export interface Step {
  undo(): void | Promise<unknown>;
  redo(): void | Promise<unknown>;
}

const LIMIT = 100;
const done: Step[] = [];
const undone: Step[] = [];
export const canUndo = ref(false);
export const canRedo = ref(false);
/** True while a step is being replayed, so the replay is not itself recorded. */
let replaying = false;

function sync() {
  canUndo.value = done.length > 0;
  canRedo.value = undone.length > 0;
}

export function record(step: Step) {
  if (replaying) return;
  done.push(step);
  if (done.length > LIMIT) done.shift();
  undone.length = 0; // a new change ends the chance to redo older ones
  sync();
}

async function replay(from: Step[], to: Step[], run: (s: Step) => void | Promise<unknown>) {
  const step = from.pop();
  if (!step || replaying) {
    if (step) from.push(step);
    return;
  }
  replaying = true;
  try {
    await run(step);
    to.push(step);
  } catch (e) {
    console.error(e); // the step could not be replayed, so it is dropped
  } finally {
    replaying = false;
    sync();
  }
}

export const undo = () => replay(done, undone, (s) => s.undo());
export const redo = () => replay(undone, done, (s) => s.redo());

export function clearHistory() {
  done.length = undone.length = 0;
  sync();
}

/**
 * Deleting something and bringing it back gives it a new number in the
 * database. This follows an old number to the one in use now, so earlier
 * steps still find the item they changed.
 */
export function idTracker() {
  const next = new Map<number, number>();
  const current = (id: number) => {
    while (next.has(id)) id = next.get(id)!;
    return id;
  };
  return { current, renumber: (from: number, to: number) => void next.set(current(from), to) };
}
