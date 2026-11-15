import { ref } from "vue";

/**
 * What a click or drag on the map does right now.
 * hand: only move the map. select: pick, move and reshape things.
 * The rest draw something new, then hand back to select.
 */
export type Tool = "hand" | "select" | "rect" | "circle" | "polygon" | "line" | "symbol";
export const tool = ref<Tool>("select");

/** True while the list of symbols to choose from is open. */
export const pickerOpen = ref(false);

export type DrawTool = "rect" | "circle" | "polygon" | "line";
export const isDrawTool = (t: Tool): t is DrawTool =>
  t === "rect" || t === "circle" || t === "polygon" || t === "line";
