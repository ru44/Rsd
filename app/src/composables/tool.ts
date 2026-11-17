import { ref } from "vue";

/**
 * What a click or drag on the map does right now.
 * hand: only move the map. select: pick, move and reshape things.
 * ruler: measure between clicked points, leaving nothing behind.
 * route: work out the way from a start to a destination.
 * The rest draw something new, then hand back to select.
 */
export type Tool = "hand" | "select" | "rect" | "circle" | "polygon" | "line" | "arrow" | "text" | "symbol" | "ruler" | "route";
export const tool = ref<Tool>("select");

/** True while the list of symbols to choose from is open. */
export const pickerOpen = ref(false);

export type DrawTool = "rect" | "circle" | "polygon" | "line" | "arrow";
export const isDrawTool = (t: Tool): t is DrawTool =>
  t === "rect" || t === "circle" || t === "polygon" || t === "line" || t === "arrow";
