<!--
  ElementTextView.vue — 文字元素显示组件

  【用处】
    把 store 中 type === 'text' 的元素（PSD 文字图层 / 面板添加的文字）渲染成 DOM 文本。
    纯展示组件，文字内容与样式在右侧 ConfigPanel 里修改。

  【逻辑】
    1. 绝对定位在画布设计坐标系内（父层 .element-layer__inner 统一 transform: scale）。
    2. 字号 / 字重 / 字体族用 font 简写一次性设置（fontShorthand），行高单独给倍数。
    3. white-space: pre-wrap —— 保留文本里的 \n 换行，同时允许自动换行；
       word-break: break-word 处理长串英文/URL 不溢出的情况。
    4. 宽高来自 store 中经 measureText() 测量校正过的包围盒，宽度决定换行位置，
       所以这里只需给出盒子尺寸，浏览器按同款字体渲染即与测量结果一致。

  【关系】
    - 由 CanvasArea.vue 按 editorStore.elements 顺序 v-for 渲染，DOM 顺序即 z-index。
    - 字体简写与测量共用 src/utils/measure.ts，保证「测量」与「渲染」同源。
-->
<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { TextElement } from '@/types/element'
import { fontShorthand } from '@/utils/measure'

/** 组件入参：待渲染的文字元素 */
const props = defineProps<{ el: TextElement }>()

/**
 * 文字的绝对定位 + 排版样式。
 * 逻辑：几何（x/y/width/height/opacity）走设计坐标；
 *      排版（font / color / lineHeight）与 store 中的字段一一对应；
 *      pre-wrap 保留手动换行，break-word 防止长单词撑破包围盒。
 */
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
