import { ref } from "vue";

/** The one map object being edited, if any. */
export type Selection = { kind: "area" | "symbol"; id: number } | null;
export const selection = ref<Selection>(null);

/** Ids of the temporary handles drawn on a selected object start with this. */
export const EDIT_PREFIX = "edit-";
