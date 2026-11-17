import { ref, watch, type Ref } from "vue";

/** An on/off choice that is remembered in this browser between visits. */
export function savedSwitch(key: string, initial: boolean): Ref<boolean> {
  let start = initial;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) start = saved === "1";
  } catch {
    // storage blocked: start on the default
  }
  const value = ref(start);
  watch(value, (on) => {
    try {
      localStorage.setItem(key, on ? "1" : "0");
    } catch {
      // storage blocked: the choice lasts until the page is closed
    }
  });
  return value;
}

/** Whether the tool rail is on screen. */
export const railShown = savedSwitch("rsgis.rail", true);
