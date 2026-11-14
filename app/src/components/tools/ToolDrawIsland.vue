<script setup lang="ts">
const props = defineProps<{ info: any }>();
const emit = defineEmits(["close", "end", "update-info"]);

// كل ما حدث جديد (مثلاً تحديث عدد النقاط):
// emit("update-info", { points: ... });
</script>
<template>
  <span class="font-semibold text-lg tracking-tight"> 🖊️ وضع رسم منطقة </span>
  <span class="text-cyan-200 text-sm">
    عدد النقاط: {{ props.info?.points ?? 0 }}
  </span>
  <button
    @click="$emit('end')"
    class="bg-white/10 hover:bg-cyan-600 transition px-3 py-1 rounded-lg text-white font-bold text-sm border border-white/20"
  >
    إنهاء الرسم
  </button>
</template>
