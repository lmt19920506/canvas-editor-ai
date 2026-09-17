<!--
  SelectionOverlay.vue — 选中框 + 8 个控制点（等比缩放）显示组件

  【用处】
    把 store 中的选中态画出来：1 条虚线选中框 + 四角四边共 8 个控制点方块。
    纯展示组件，不处理任何指针事件。

  【逻辑】
    1. 交互与渲染分离：元素层 pointer-events 全部关闭，鼠标事件统一由底层 canvas 接收；
       本组件只负责把「选中了谁、在哪、多大」渲染成 DOM，命中检测由 useCanvasEditor.handleAt() 负责。
       两者共用 src/utils/selection.ts 的几何函数，保证「看到的控制点」＝「能点到的控制点」。
    2. 选中框相对元素向外扩一个 pad（= 控制点半径）：
       nw/ne/sw/se 四个角点的中心正好落在元素四角上，视觉上「贴边」且不遮挡内容。
    3. 坐标全部是设计坐标单位（父级 .selection-layer 内层统一 transform: scale），
       与元素层缩放比例一致；因所在层不设 overflow: hidden，画布边缘元素的控制点不会被裁掉。
    4. 每个控制点各自设置 cursor，虽然本身点不到（pointer-events: none），
       但可作为样式兜底；实际光标由 canvas 在 pointermove 时切换。

  【关系】
    - 由 CanvasArea.vue 渲染在独立的 .selection-layer 中（位于所有元素之上）。
    - 几何工具：src/utils/selection.ts；命中与拖拽：src/composables/useCanvasEditor.ts。
-->
<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { HANDLE_SIZE } from '@/config/editor'
import type { EditorElement } from '@/types/element'
import {
  HANDLE_CURSOR,
  handlePoints,
  selectionPad,
  selectionRect,
} from '@/utils/selection'

/**
 * 组件入参。
 * - el：当前选中元素；null 表示不渲染（无选中态）
 * - handleSize：控制点边长（设计坐标单位），默认取全局常量 HANDLE_SIZE
 */
const props = withDefaults(
  defineProps<{
    /** 当前选中元素，null 表示不渲染 */
    el: EditorElement | null
    /** 控制点边长（画布坐标，默认取 HANDLE_SIZE） */
    handleSize?: number
  }>(),
  { handleSize: HANDLE_SIZE },
)

/** 选中框相对元素外扩的距离 = 控制点半径，保证控制点完整显示在元素外沿 */
const pad = computed(() => selectionPad(props.handleSize))

/**
 * 选中虚线框样式。
 * 逻辑：位置尺寸取 selectionRect(el)（元素外扩 pad 后的矩形）；
 *      border-box 让 1px 虚线画在框内，不会额外撑大盒子；
 *      pointer-events: none 交给底层 canvas 处理交互。
 */
const boxStyle = computed<CSSProperties>(() => {
  if (!props.el) return {}
  const r = selectionRect(props.el, props.handleSize)
  return {
    position: 'absolute',
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    boxSizing: 'border-box',
    border: '1px dashed var(--primary)',
    pointerEvents: 'none',
  }
})

/**
 * 8 个控制点（四角 + 四边中点）及其样式。
 * 逻辑：位置由 handlePoints(el) 给出（元素坐标系），换算为「相对选中框」的 left/top：
 *       p.x - el.x 得到相对元素的偏移，再减 size/2 让方块以该点为中心，最后加 pad 对齐选中框原点。
 *       白底 + 主色描边，与旧版 canvas 绘制效果一致；各点 cursor 见 HANDLE_CURSOR。
 */
const handles = computed<Array<{ key: string; style: CSSProperties }>>(() => {
  if (!props.el) return []
  const el = props.el
  const size = props.handleSize
  return handlePoints(el, size).map((p) => ({
    key: p.key,
    style: {
      position: 'absolute',
      left: `${p.x - el.x - size / 2 + pad.value}px`,
      top: `${p.y - el.y - size / 2 + pad.value}px`,
      width: `${size}px`,
      height: `${size}px`,
      boxSizing: 'border-box',
      background: '#fff',
      border: '1.5px solid var(--primary)',
      cursor: HANDLE_CURSOR[p.key],
      pointerEvents: 'none',
    } as CSSProperties,
  }))
})
</script>

<template>
  <div v-if="el" class="selection-box" :style="boxStyle">
    <span
      v-for="h in handles"
      :key="h.key"
      class="selection-handle"
      :class="`is-${h.key}`"
      :style="h.style"
    />
  </div>
</template>

<style scoped>
.selection-box {
  z-index: 1000;
}

.selection-handle {
  border-radius: 1px;
}
</style>
