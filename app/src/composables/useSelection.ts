import { watch } from "vue";
import { useMap } from "./useMap";
import { EDIT_PREFIX, selection } from "./selection";
import { tool } from "./tool";

let hooked = false;

/** With the select tool, clicking a saved shape or symbol selects it; clicking empty map deselects. */
export function useSelection() {
  if (!hooked) {
    hooked = true;
    useMap().onUnclaimedClick((_pos, entityId) => {
      if (tool.value !== "select") return;
      if (entityId?.startsWith(EDIT_PREFIX)) return; // a handle of the current selection
      const hit = entityId?.match(/^(area|sym)-(\d+)$/);
      const next = hit ? { kind: hit[1] === "area" ? "area" : "symbol", id: +hit[2] } as const : null;
      const now = selection.value;
      if (next?.kind === now?.kind && next?.id === now?.id) return;
      selection.value = next;
    });
    // Nothing stays selected while moving the map or drawing something new.
    watch(tool, (t) => {
      if (t !== "select") selection.value = null;
    });
  }
  return { selection, deselect: () => (selection.value = null) };
}
