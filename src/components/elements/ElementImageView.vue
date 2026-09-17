<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { ImageElement } from '@/types/element'

/** 图片元素显示组件：按设计坐标绝对定位渲染一张图片 */
const props = defineProps<{ el: ImageElement }>()

const style = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: `${props.el.width}px`,
  height: `${props.el.height}px`,
  opacity: props.el.opacity,
}))
</script>

<template>
  <img class="element-image" :src="props.el.src" :style="style" draggable="false" />
</template>

<style scoped>
.element-image {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
