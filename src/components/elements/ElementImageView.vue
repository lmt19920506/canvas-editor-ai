<!--
  ElementImageView.vue — 图片元素显示组件

  【用处】
    把编辑器 store 中 type === 'image' 的元素（PSD「素材」图层 / 用户拖入的图片）
    按设计坐标渲染成一张 <img>。纯展示组件，不做任何交互。

  【逻辑】
    1. 绝对定位在「画布设计坐标系」内：父级 .element-layer__inner 统一做 transform: scale(displayScale)，
       因此这里只需用元素的原始 x/y/width/height，不必关心屏幕缩放。
    2. opacity 直接绑定元素透明度（0~1）。
    3. draggable=false 关闭浏览器原生图片拖拽，避免与编辑器的拖放交互冲突。
    4. 元素层整体 pointer-events: none —— 选中 / 拖拽 / 缩放 / drop 全部由底层 canvas 统一处理，
       本组件只负责「画出来」，保证交互逻辑只有一份。

  【关系】
    - 由 CanvasArea.vue 按 editorStore.elements 顺序 v-for 渲染，DOM 顺序即 z-index。
    - 数据源：src/stores/editor.ts 的 ImageElement。
-->
<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { ImageElement } from '@/types/element'

/** 组件入参：待渲染的图片元素（响应式对象，字段变化即自动重绘） */
const props = defineProps<{ el: ImageElement }>()

/**
 * 图片的绝对定位样式。
 * 逻辑：设计坐标 → CSS 像素一一对应（父层已做整体缩放）；
 *       只取几何与透明度两类字段，样式随 el 变化自动重算。
 */
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
