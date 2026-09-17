<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { TextElement } from '@/types/element'
import { fontShorthand } from '@/utils/measure'

/** 文字元素显示组件：按设计坐标绝对定位渲染一段文字 */
const props = defineProps<{ el: TextElement }>()

const style = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: `${props.el.width}px`,
  height: `${props.el.height}px`,
  opacity: props.el.opacity,
  font: fontShorthand(props.el),
  color: props.el.color,
  lineHeight: String(props.el.lineHeight),
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}))
</script>

<template>
  <div class="element-text" :style="style">{{ props.el.content }}</div>
</template>

<style scoped>
.element-text {
  user-select: none;
  pointer-events: none;
}
</style>
