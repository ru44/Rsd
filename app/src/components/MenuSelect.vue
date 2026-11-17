<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref } from "vue";
import { Check, ChevronsUpDown } from "lucide-vue-next";

// A drop-down list drawn by the app, so it looks the same in every browser.
const props = defineProps<{
  modelValue: T;
  options: { value: T; label: string }[];
  /** What the list is for, read out by screen readers. */
  label: string;
  /** Open upwards, for controls at the bottom of the screen. */
  up?: boolean;
  /** Fill the width of the container. */
  block?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const open = ref(false);
const active = ref(0);
const list = ref<HTMLElement | null>(null);
const current = computed(() => props.options.find((o) => o.value === props.modelValue) ?? props.options[0]);

function show() {
  open.value = true;
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue));
  nextTick(() => list.value?.focus());
}
function pick(value: T) {
  emit("update:modelValue", value);
  open.value = false;
}
function onKey(e: KeyboardEvent) {
  const n = props.options.length;
  if (e.key === "ArrowDown") active.value = (active.value + 1) % n;
  else if (e.key === "ArrowUp") active.value = (active.value - 1 + n) % n;
  else if (e.key === "Home") active.value = 0;
  else if (e.key === "End") active.value = n - 1;
  else if (e.key === "Enter" || e.key === " ") pick(props.options[active.value].value);
  else if (e.key === "Escape") open.value = false;
  else return;
  e.preventDefault();
  e.stopPropagation();
}
</script>

<template>
  <div class="relative" @focusout="!($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node | null) && (open = false)">
    <button
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-paper transition-colors hover:bg-raised"
      :class="{ 'bg-raised': open, 'w-full justify-between': block }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="`${label}: ${current.label}`"
      @click="open ? (open = false) : show()"
      @keydown.down.prevent="show"
      @keydown.up.prevent="show"
    >
      {{ current.label }}
      <ChevronsUpDown class="h-3.5 w-3.5 text-dim" aria-hidden="true" />
    </button>
    <Transition name="pop">
      <ul
        v-if="open"
        ref="list"
        role="listbox"
        tabindex="-1"
        :aria-label="label"
        :aria-activedescendant="`opt-${active}`"
        class="panel absolute left-0 z-40 max-h-60 min-w-full overflow-y-auto p-1 text-xs focus:outline-none"
        :class="up ? 'bottom-full mb-1.5 origin-bottom' : 'top-full mt-1.5 origin-top'"
        @keydown="onKey"
      >
        <li
          v-for="(o, i) in options"
          :id="`opt-${i}`"
          :key="o.value"
          role="option"
          :aria-selected="o.value === modelValue"
          class="flex h-7 cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2 text-paper"
          :class="{ 'bg-raised': i === active }"
          @mousemove="active = i"
          @mousedown.prevent
          @click="pick(o.value)"
        >
          {{ o.label }}
          <Check v-if="o.value === modelValue" class="ml-auto h-3.5 w-3.5 pl-0.5" aria-hidden="true" />
          <span v-else class="ml-auto w-3.5" />
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
