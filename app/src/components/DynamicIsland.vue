<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";

// جميع الأدوات المتوفرة كـsubcomponent
import ToolDrawIsland from "./tools/ToolDrawIsland.vue";
import ToolAddSymbolIsland from "./tools/ToolAddSymbolIsland.vue";
// يمكنك إضافة أدوات جديدة هنا!

// قائمة الأدوات (قابلة للتوسعة)
const tools = [
  { mode: "draw", name: "رسم منطقة", icon: "🖊️", component: ToolDrawIsland },
  {
    mode: "add-symbol",
    name: "إضافة رمز",
    icon: "🪖",
    component: ToolAddSymbolIsland,
  },
  // أضف أدوات أخرى هنا...
];

// الأداة النشطة (persistent)
const activeTool = ref<null | string>(null);
const toolInfo = ref<any>({}); // معلومات إضافية لكل أداة (مثل عدد النقاط...)

const currentToolDef = computed(() =>
  tools.find((t) => t.mode === activeTool.value)
);
const currentComponent = computed(
  () => currentToolDef.value?.component ?? null
);

// عند اختيار أداة
function selectTool(mode: string, info: any = {}) {
  activeTool.value = mode;
  toolInfo.value = info;
}
// لإغلاق الديناميك آيلاند (يمسح كل شيء)
function closeTool() {
  activeTool.value = null;
  toolInfo.value = {};
}

// تصدير دوال للاستخدام من الخارج
defineExpose({ selectTool, closeTool, activeTool, toolInfo });
</script>

<template>
  <!-- قائمة الأدوات (شريط أدوات صغير في الأسفل أو جانبياً) -->
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-[1000]"
    style="pointer-events: none"
  >
    <div
      class="flex bg-white/90 rounded-xl shadow p-1 px-3 border border-cyan-200 gap-2 pointer-events-auto"
    >
      <button
        v-for="tool in tools"
        :key="tool.mode"
        :class="[
          'flex items-center gap-1 px-3 py-1 rounded-lg font-bold transition text-cyan-800',
          activeTool === tool.mode
            ? 'bg-cyan-600 text-white shadow'
            : 'hover:bg-cyan-100',
        ]"
        @click="selectTool(tool.mode)"
      >
        <span>{{ tool.icon }}</span>
        <span class="hidden sm:inline">{{ tool.name }}</span>
      </button>
    </div>
  </div>

  <!-- الآيلاند السفلي الثابت -->
  <transition name="slide-up">
    <div
      v-if="activeTool && currentComponent"
      class="fixed bottom-20 left-1/2 -translate-x-1/2 bg-cyan-900/95 text-white rounded-2xl shadow-xl px-6 py-3 flex items-center gap-6 z-[1000] min-w-[260px]"
      style="backdrop-filter: blur(8px)"
    >
      <component
        :is="currentComponent"
        :info="toolInfo"
        @close="closeTool"
        @end="closeTool"
        @update-info="(val) => (toolInfo = val)"
      />
    </div>
  </transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(40px);
}
</style>
