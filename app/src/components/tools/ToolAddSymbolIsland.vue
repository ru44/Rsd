<script setup lang="ts">
const props = defineProps<{ info: any }>();
const emit = defineEmits(["close"]);
</script>
<template>
  <span class="font-semibold text-lg tracking-tight"> 🪖 وضع إضافة رمز </span>
  <span class="text-cyan-200 text-sm"> اضغط على الخريطة لتحديد الموقع </span>
  <button
    @click="$emit('close')"
    class="bg-white/10 hover:bg-cyan-600 transition px-3 py-1 rounded-lg text-white font-bold text-sm border border-white/20"
  >
    إلغاء
  </button>
</template>
