import { useMap } from "./useMap";
import { useAreas } from "./useAreas";
import { useSymbols } from "./useSymbols";
import { EDIT_PREFIX, selection } from "./selection";

let hooked = false;

/** Clicking a saved area or symbol selects it; clicking empty map deselects. */
export function useSelection() {
  if (!hooked) {
    hooked = true;
    const { drawing } = useAreas();
    const { placing } = useSymbols();
    useMap().onUnclaimedClick((_pos, entityId) => {
      if (drawing.value || placing.value) return;
      if (entityId?.startsWith(EDIT_PREFIX)) return; // a handle of the current selection
      const hit = entityId?.match(/^(area|sym)-(\d+)$/);
      const next = hit ? { kind: hit[1] === "area" ? "area" : "symbol", id: +hit[2] } as const : null;
      const now = selection.value;
      if (next?.kind === now?.kind && next?.id === now?.id) return;
      selection.value = next;
    });
  }
  return { selection, deselect: () => (selection.value = null) };
}
