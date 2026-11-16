<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Trash2, X } from "lucide-vue-next";
import { selection } from "@/composables/selection";
import { AREA_COLORS, useAreas } from "@/composables/useAreas";
import { symbolImage, useSymbols } from "@/composables/useSymbols";
import { AFFILIATIONS, getAffiliation, parseSidc, setAffiliation } from "@/lib/sidc";
import { SHAPE_LABEL, kindOf, measurements, pointsOf } from "@/lib/shapes";

// Shows the selected shape or symbol and what can be changed about it.
const areas = useAreas();
const symbols = useSymbols();

const area = computed(() =>
  selection.value?.kind === "area" ? areas.areas.value.find((a) => a.id === selection.value!.id) : undefined
);
const symbol = computed(() =>
  selection.value?.kind === "symbol" ? symbols.symbols.value.find((s) => s.id === selection.value!.id) : undefined
);

// Text boxes edit a copy, saved when the person leaves the box or presses Enter.
const name = ref("");
const code = ref("");
watch(
  [area, symbol],
  () => {
    name.value = area.value?.name ?? symbol.value?.name ?? "";
    code.value = symbol.value?.sidc ?? "";
  },
  { immediate: true }
);
const parsedCode = computed(() => parseSidc(code.value));
// Only complain about a code the person has just typed, never about a stored one.
const codeRejected = computed(() => !!symbol.value && code.value !== symbol.value.sidc && !parsedCode.value);

const kind = computed(() => (area.value ? kindOf(area.value) : null));
const title = computed(() => (kind.value ? SHAPE_LABEL[kind.value] : "Symbol"));
/** The shape's measurements. They follow the pointer while the shape is being dragged. */
const size = computed(() => {
  if (!area.value || !kind.value) return [];
  return areas.liveMeasure.value.length ? areas.liveMeasure.value : measurements(kind.value, pointsOf(area.value.geojson));
});
const HELP = {
  polygon: "Drag a corner to reshape. Drag a small dot to add a corner. Drag inside to move. Right-click a corner to remove it.",
  line: "Drag a point to reshape. Drag a small dot to add a point. Drag the line to move it. Right-click a point to remove it.",
  rect: "Drag a corner to resize; hold Shift for a square. Drag inside to move.",
  circle: "Drag a dot on the edge to resize. Drag inside to move.",
};

function saveName() {
  const text = name.value.trim();
  if (!text) {
    name.value = area.value?.name ?? symbol.value?.name ?? "";
  } else if (area.value && text !== area.value.name) {
    areas.update(area.value.id, { name: text });
  } else if (symbol.value && text !== symbol.value.name) {
    symbols.update(symbol.value.id, { name: text });
  }
}
function saveCode() {
  if (!symbol.value) return;
  if (!parsedCode.value) code.value = symbol.value.sidc;
  else if (parsedCode.value.sidc !== symbol.value.sidc) symbols.update(symbol.value.id, { sidc: parsedCode.value.sidc });
}
function remove() {
  if (area.value) areas.remove(area.value.id);
  else if (symbol.value) symbols.remove(symbol.value.id);
}
</script>

<template>
  <section v-if="area || symbol" class="panel w-60 max-w-[calc(100vw-6rem)] text-sm" :aria-label="`Selected ${title.toLowerCase()}`">
    <header class="flex items-center gap-2 border-b border-edge py-1.5 pl-3 pr-1.5 font-medium">
      <img v-if="symbol" :src="symbolImage(symbol.sidc, 16)" alt="" class="max-h-6 max-w-7" />
      {{ title }}
      <button type="button" class="ml-auto rounded-md p-1 text-dim hover:bg-raised hover:text-paper" aria-label="Close" title="Deselect (Esc)" @click="selection = null">
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
    </header>

    <div class="space-y-3 p-3">
      <label class="block">
        <span class="mb-1 block text-xs text-dim">Name</span>
        <input v-model="name" type="text" class="field" @blur="saveName" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      </label>

      <template v-if="area">
        <div>
          <span class="mb-1 block text-xs text-dim">Colour</span>
          <div class="flex gap-1.5" role="radiogroup" aria-label="Colour">
            <button
              v-for="c in AREA_COLORS"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="(area.color ?? AREA_COLORS[0]).toLowerCase() === c.toLowerCase()"
              :aria-label="`Colour ${c}`"
              class="swatch"
              :style="{ background: c }"
              @click="areas.update(area.id, { color: c })"
            />
          </div>
        </div>
        <dl v-if="size.length" class="grid select-text grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-y border-edge py-2">
          <template v-for="[label, value] in size" :key="label">
            <dt class="text-xs leading-5 text-dim">{{ label }}</dt>
            <dd class="text-right font-mono text-signal">{{ value }}</dd>
          </template>
        </dl>
        <p class="text-xs leading-relaxed text-dim">{{ HELP[kind!] }}</p>
      </template>

      <template v-else-if="symbol">
        <div>
          <span class="mb-1 block text-xs text-dim">Affiliation</span>
          <div class="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Affiliation">
            <button
              v-for="a in AFFILIATIONS"
              :key="a.key"
              type="button"
              role="radio"
              :aria-checked="getAffiliation(symbol.sidc) === a.key"
              class="choice"
              @click="symbols.update(symbol.id, { sidc: setAffiliation(symbol.sidc, a.key) })"
            >
              <span class="h-2.5 w-2.5 rounded-full" :style="{ background: a.color }" aria-hidden="true" />
              {{ a.label }}
            </button>
          </div>
        </div>
        <label class="block">
          <span class="mb-1 block text-xs text-dim">Code</span>
          <input
            v-model="code"
            type="text"
            spellcheck="false"
            class="field font-mono text-xs"
            :aria-invalid="codeRejected"
            @blur="saveCode"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span v-if="codeRejected" class="mt-1 block text-xs text-hostile">
            Not a symbol code. Use 10 to 15 letters, or 20 or 30 digits.
          </span>
        </label>
        <p class="text-xs text-dim">Drag the symbol to move it.</p>
      </template>

      <button type="button" class="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-hostile hover:border-hostile" @click="remove">
        <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
        Delete {{ title.toLowerCase() }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.field {
  @apply w-full rounded-md border border-edge bg-raised px-2 py-1.5 text-paper;
}
.field[aria-invalid="true"] {
  @apply border-hostile;
}
.swatch {
  @apply h-6 w-6 rounded-full border-2 border-transparent;
}
.swatch[aria-checked="true"] {
  @apply border-paper ring-2 ring-ink;
}
.choice {
  @apply flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-xs text-dim;
}
.choice:hover {
  @apply text-paper;
}
.choice[aria-checked="true"] {
  @apply border-signal bg-raised text-paper;
}
</style>
