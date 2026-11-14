<script setup lang="ts">
import { ref } from "vue";
defineProps<{ icon: any; title: string }>();
const show = ref(true);
</script>

<template>
  <section>
    <button
      @click="show = !show"
      class="flex items-center gap-2 mb-2 text-base font-semibold text-cyan-700 w-full focus:outline-none"
    >
      <component :is="icon" class="w-5 h-5" />
      {{ title }}
      <svg
        :class="['transition-transform ml-auto', { 'rotate-180': show }]"
        class="w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        ></path>
      </svg>
    </button>
    <transition name="fade">
      <div v-show="show">
        <slot />
      </div>
    </transition>
  </section>
</template>
