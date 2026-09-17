<!--
  SelectionOverlay.vue — 选中框 + 8 个控制点（等比缩放）显示组件

  【用处】
    把 store 中的选中态画出来：1 条虚线选中框 + 四角四边共 8 个控制点方块。
    纯展示组件，不处理任何指针事件。

  【逻辑】
    1. 交互与渲染分离：元素层 pointer-events 全部关闭，鼠标事件统一由底层 canvas 接收；
       本组件只负责把「选中了谁、在哪、多大」渲染成 DOM，命中检测由 useCanvasEditor.handleAt() 负责。
       两者共用 src/utils/selection.ts 的几何函数与同一套尺寸换算，保证「看到的控制点」＝「能点到的控制点」。
    2. 控制点尺寸屏幕恒定：本组件位于带 transform: scale(scale) 的图层内，
       若直接用 18px 会被父层再缩放一次。因此用 pxInDesign(18, scale) 反向换算成设计坐标，
       渲染后乘回 scale 恰好等于 18，画布无论缩到多小，控制点在屏幕上都保持 18×18。
       虚线框 1px、控制点描边 1.5px 同理（否则缩放后线会细到看不见）。
    3. 选中框相对元素向外扩一个 pad（= 控制点半径），控制点**中心**落在选中框的
       四角与四边中点上 —— 虚线正好穿过每个控制点的中心；因外扩量等于控制点半径，
       控制点整体位于元素轮廓之外，既不遮挡内容，也不会盖住元素边缘。
    4. 因所在层不设 overflow: hidden，画布边缘元素的控制点不会被裁掉。
       每个控制点各自设置 cursor，实际光标由 canvas 在 pointermove 时切换。

  【关系】
    - 由 CanvasArea.vue 渲染在独立的 .selection-layer 中（位于所有元素之上），
      并由父级传入当前显示缩放比 scale。
    - 几何工具：src/utils/selection.ts；命中与拖拽：src/composables/useCanvasEditor.ts。
-->
<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { HANDLE_SCREEN_SIZE } from '@/config/editor'
import type { EditorElement } from '@/types/element'
import {
  HANDLE_CURSOR,
  handlePoints,
  pxInDesign,
  selectionPad,
  selectionRect,
} from '@/utils/selection'

/**
 * 组件入参。
 * - el：当前选中元素；null 表示不渲染（无选中态）
 * - scale：画布当前显示缩放比（= 屏幕像素 / 设计坐标），来自 CanvasArea 的 transform: scale
 * - handleSize：控制点的**屏幕**边长（px），默认取全局常量 HANDLE_SCREEN_SIZE = 18
 */
const props = withDefaults(
  defineProps<{
    /** 当前选中元素，null 表示不渲染 */
    el: EditorElement | null
    /** 画布显示缩放比，用于把屏幕尺寸反向换算为设计坐标尺寸 */
    scale?: number
    /** 控制点屏幕边长（px，恒定值，默认 18） */
    handleSize?: number
  }>(),
  { scale: 1, handleSize: HANDLE_SCREEN_SIZE },
)

/**
 * 控制点在设计坐标系下的边长。
 * 逻辑：屏幕目标尺寸 ÷ 显示缩放比 —— 父层会再乘一次 scale，抵消后屏幕上恒为 handleSize。
 * 命中检测（useCanvasEditor.handleAt）用同一个换算取半径，两者始终对齐。
 */
const size = computed(() => pxInDesign(props.handleSize, props.scale))

/**
 * 选中虚线框样式。
 * 逻辑：位置尺寸取 selectionRect(el)（元素外扩 pad 后的矩形）；
 *      border-box 让虚线画在框内，不会额外撑大盒子；
 *      线宽同样按 1/scale 反向换算，屏幕上恒定 1px；
 *      pointer-events: none 交给底层 canvas 处理交互。
 */
const boxStyle = computed<CSSProperties>(() => {
  if (!props.el) return {}
  const r = selectionRect(props.el, size.value)
  return {
    position: 'absolute',
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    boxSizing: 'border-box',
    border: `${pxInDesign(1, props.scale)}px dashed var(--primary)`,
    pointerEvents: 'none',
  }
})

/**
 * 8 个控制点（四角 + 四边中点）及其样式。
 *
 * 定位推导（务必与 utils/selection.ts 的 handlePoints 保持一致）：
 *   1. handlePoints 返回的是控制点**中心**，取在选中框的角/边中点上（元素外扩 pad，pad = s / 2）；
 *   2. 绝对定位子元素的基准是父元素的 **padding box** —— 选中框是 border-box，
 *      所以基准原点 = 边框盒左上角 + 边框宽 bw，即 (el.x - pad + bw, el.y - pad + bw)；
 *   3. 控制点自身是边长为 s 的方块，left/top 指的是它的左上角，故要减去半边长 half = s / 2。
 *   合并：left = p.x - (el.x - pad + bw) - half = p.x - el.x + pad - bw - half
 *   （pad 与 half 恒等、正好相消，保留写全是为了让推导可读、避免再漏项）。
 */
const handles = computed<Array<{ key: string; style: CSSProperties }>>(() => {
  const el = props.el
  if (!el) return []
  const s = size.value // 控制点边长（设计坐标）
  const half = s / 2
  const pad = selectionPad(s) // 选中框相对元素的外扩量
  const bw = pxInDesign(1, props.scale) // 选中框边框宽度（设计坐标）
  return handlePoints(el, s).map((p) => ({
    key: p.key,
    style: {
      position: 'absolute',
      left: `${p.x - el.x + pad - bw - half}px`,
      top: `${p.y - el.y + pad - bw - half}px`,
      width: `${s}px`,
      height: `${s}px`,
      boxSizing: 'border-box',
      background: '#fff',
      border: `${pxInDesign(1.5, props.scale)}px solid var(--primary)`,
      borderRadius: `${pxInDesign(1, props.scale)}px`,
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
</style>
