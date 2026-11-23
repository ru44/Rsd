import { ref, watch, type Ref } from "vue";

/** A choice remembered in this browser between visits. */
function saved<T>(key: string, initial: T, read: (text: string) => T | null, write: (value: T) => string): Ref<T> {
  let start = initial;
  try {
    const text = localStorage.getItem(key);
    const value = text === null ? null : read(text);
    if (value !== null) start = value;
  } catch {
    // storage blocked: start on the default
  }
  const value = ref(start) as Ref<T>;
  watch(value, (v) => {
    try {
      localStorage.setItem(key, write(v));
    } catch {
      // storage blocked: the choice lasts until the page is closed
    }
  });
  return value;
}

/** An on/off choice that is remembered in this browser between visits. */
export const savedSwitch = (key: string, initial: boolean) =>
  saved(key, initial, (t) => t === "1", (on) => (on ? "1" : "0"));

/** A level from 0 to 1, such as how see-through a layer is, remembered the same way. */
export const savedLevel = (key: string, initial: number) =>
  saved(
    key,
    initial,
    (t) => {
      const n = Number(t);
      return t !== "" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
    },
    String
  );

/** Whether the tool rail is on screen. */
export const railShown = savedSwitch("rsgis.rail", true);
