<script setup lang="ts">
defineProps<{
  label: string
  hint: string
  display: string
  min: number
  max: number
  step: number
  disabled?: boolean
}>()
const model = defineModel<number>({ required: true })
defineEmits<{ change: [event: Event] }>()
</script>

<template>
  <UTooltip :text="hint" :delay-duration="300" :ui="{ content: 'h-auto max-w-xs py-1.5', text: 'whitespace-normal' }">
    <UFormField :label="label" :hint="display">
      <USlider
        v-model="model"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        size="xs"
        @change="$emit('change', $event)"
      />
    </UFormField>
  </UTooltip>
</template>
