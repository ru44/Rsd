<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Search } from "lucide-vue-next";
import { symbolImage } from "@/composables/useSymbols";
import { AFFILIATIONS, describeKind, parseSidc, setAffiliation, type Affiliation } from "@/lib/sidc";
import { CATEGORIES, loadLibrary, searchLibrary, type LibrarySymbol } from "@/lib/symbolLibrary";

const emit = defineEmits<{ pick: [sidc: string, name: string] }>();

/** Enough rows to browse, few enough to draw instantly. */
const MAX_ROWS = 60;

const query = ref("");
const affiliation = ref<Affiliation>("F");
const category = ref<string>("GRDTRK_UNT");
const library = ref<LibrarySymbol[] | null>(null);
const field = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  field.value?.focus();
  library.value = await loadLibrary();
});

/** Set when the box holds a symbol code rather than a name. */
const pasted = computed(() => parseSidc(query.value));

const hits = computed(() => {
  if (!library.value || pasted.value) return [];
  // Typing searches everything; an empty box browses the chosen category.
  return searchLibrary(library.value, query.value, query.value.trim() ? null : category.value);
});
const rows = computed(() =>
  hits.value.slice(0, MAX_ROWS).map((s) => {
    const sidc = s.template.replace("*", affiliation.value);
    return { ...s, sidc, image: symbolImage(sidc, 24) };
  })
);
</script>

<template>
  <div class="panel flex max-h-[calc(100vh-9.5rem)] w-80 max-w-[calc(100vw-5.5rem)] flex-col text-sm" role="dialog" aria-label="Choose a symbol">
    <div class="space-y-2 border-b border-edge p-2">
      <label class="flex items-center gap-2 rounded-sm border border-edge bg-raised px-2 focus-within:border-signal">
        <Search class="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />
        <input
          ref="field"
          v-model="query"
          type="text"
          spellcheck="false"
          placeholder="Search by name, or paste a code"
          aria-label="Search symbols by name, or paste a symbol code"
          class="w-full bg-transparent py-1.5 text-paper placeholder:text-dim focus:outline-none"
        />
      </label>

      <div class="flex gap-1" role="radiogroup" aria-label="Affiliation">
        <button
          v-for="a in AFFILIATIONS"
          :key="a.key"
          type="button"
          role="radio"
          :aria-checked="affiliation === a.key"
          class="choice flex-1"
          @click="affiliation = a.key"
        >
          <span class="h-2.5 w-2.5 rounded-full" :style="{ background: a.color }" aria-hidden="true" />
          {{ a.label }}
        </button>
      </div>

      <select
        v-if="!query.trim()"
        v-model="category"
        aria-label="Category"
        class="w-full rounded-sm border border-edge bg-raised px-2 py-1.5 text-paper"
      >
        <option v-for="c in CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
      </select>
    </div>

    <!-- A pasted code: show what it is and offer to place it as written. -->
    <div v-if="pasted" class="p-3">
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-14 shrink-0 items-center justify-center">
          <img :src="symbolImage(pasted.sidc, 26)" alt="" class="max-h-12 max-w-14" />
        </span>
        <div class="min-w-0">
          <p class="break-all font-mono text-paper">{{ pasted.sidc }}</p>
          <p class="text-xs text-dim">{{ describeKind(pasted.kind) }}</p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="rounded-sm bg-signal px-2.5 py-1 text-xs font-bold text-ink" @click="emit('pick', pasted.sidc, 'Symbol ' + pasted.sidc)">
          Place as written
        </button>
        <button
          type="button"
          class="rounded-sm border border-edge px-2.5 py-1 text-xs font-bold text-paper hover:bg-raised"
          @click="emit('pick', setAffiliation(pasted.sidc, affiliation), 'Symbol ' + pasted.sidc)"
        >
          Place as {{ AFFILIATIONS.find((a) => a.key === affiliation)?.label.toLowerCase() }}
        </button>
      </div>
    </div>

    <template v-else>
      <ul class="min-h-0 flex-1 overflow-y-auto p-1" aria-label="Symbols">
        <li v-for="s in rows" :key="s.template">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-sm px-2 py-1 text-left hover:bg-raised"
            @click="emit('pick', s.sidc, s.name)"
          >
            <span class="flex h-10 w-11 shrink-0 items-center justify-center">
              <img :src="s.image" alt="" loading="lazy" class="max-h-10 max-w-11" />
            </span>
            <span class="min-w-0">
              <span class="block truncate">{{ s.name }}</span>
              <span class="block truncate text-xs text-dim">{{ s.path }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p class="border-t border-edge px-3 py-1.5 text-xs text-dim">
        <template v-if="!library">Loading symbols…</template>
        <template v-else-if="hits.length === 0">
          No symbol matches "{{ query.trim() }}". Try fewer words, or paste a code.
        </template>
        <template v-else-if="hits.length > MAX_ROWS">
          First {{ MAX_ROWS }} of {{ hits.length.toLocaleString() }}. Type to narrow down.
        </template>
        <template v-else>{{ hits.length }} symbols</template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.choice {
  @apply flex items-center justify-center gap-1.5 rounded-sm border border-edge px-1 py-1 text-xs text-dim;
}
.choice:hover {
  @apply text-paper;
}
.choice[aria-checked="true"] {
  @apply border-signal bg-raised text-paper;
}
</style>
