import { ref } from "vue";

/** True while every control is hidden and only the map is on screen. */
const clear = ref(false);
/** Briefly true after entering, to say how to get the controls back. */
const hint = ref(false);
let hintTimer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function exit() {
  if (!clear.value) return;
  clear.value = false;
  hint.value = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function enter() {
  if (clear.value) return;
  clear.value = true;
  hint.value = true;
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (hint.value = false), 3000);
  // Browser full screen is a bonus: if the browser refuses, the controls are
  // still hidden and the map fills the window.
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function useClearView() {
  if (!hooked) {
    hooked = true;
    // Leaving browser full screen (Esc does this) also brings the controls back.
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) exit();
    });
  }
  return { clear, hint, enter, exit, toggle: () => (clear.value ? exit() : enter()) };
}
