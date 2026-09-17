/**
 * 选中框与控制点几何工具
 *
 * 组件（SelectionOverlay.vue）负责渲染，useCanvasEditor 负责命中检测，
 * 两者共用同一份几何数据，避免视觉与命中区域不一致。
 *
 * 坐标系说明（重要）：
 * - `handlePoints` / `selectionRect` 返回**画布设计坐标**（与元素 x/y/width/height 同一坐标系）；
 * - 控制点边长等「视觉尺寸」以**屏幕 px** 为基准（HANDLE_SCREEN_SIZE = 18），
 *   渲染在带 transform: scale 的图层里，需用 `pxInDesign()` 按 1/scale 反向换算成设计坐标，
 *   这样画布整体缩放时，控制点在屏幕上大小恒定。
 */
import { HANDLE_SCREEN_SIZE, type ResizeHandle } from '@/config/editor'
import type { EditorElement } from '@/types/element'

/** 控制点位置（画布设计坐标） */
export interface HandlePoint {
  key: ResizeHandle
  x: number
  y: number
}

/**
 * 屏幕像素 → 画布设计坐标像素。
 * 逻辑：父层有 transform: scale(displayScale)，设计值 d 渲染后为 d × displayScale。
 *       要让某尺寸在屏幕上恒定 T px，写入样式的设计值必须是 T / displayScale。
 * 用途：控制点边长、边框线宽等「不随画布缩放」的视觉尺寸。
 */
export function pxInDesign(screenPx: number, displayScale = 1): number {
  const s = displayScale > 0 ? displayScale : 1
  return screenPx / s
}

/**
 * 控制点在设计坐标系下的边长。
 * 逻辑：屏幕恒定尺寸 ÷ 显示缩放 —— 画布被缩小时，设计值反而要放大，
 *       抵消父层 transform 的缩小，最终屏幕上仍是 HANDLE_SCREEN_SIZE。
 */
export function handleSizeInDesign(
  displayScale = 1,
  screenSize = HANDLE_SCREEN_SIZE,
): number {
  return pxInDesign(screenSize, displayScale)
}

/** 选中框向外扩的边距 = 控制点半径，保证控制点完整显示在元素外沿 */
export function selectionPad(handleSize = HANDLE_SCREEN_SIZE): number {
  return handleSize / 2
}

/** 元素外扩后的选中框矩形（画布设计坐标） */
export function selectionRect(el: EditorElement, handleSize = HANDLE_SCREEN_SIZE) {
  const pad = selectionPad(handleSize)
  return {
    x: el.x - pad,
    y: el.y - pad,
    width: el.width + pad * 2,
    height: el.height + pad * 2,
  }
}

/**
 * 8 个控制点的**中心**位置（四角 + 四边中点），画布设计坐标。
 *
 * 逻辑：中心取在「选中框」的角与边中点上（即 selectionRect 的外扩矩形），
 *       所以虚线框正好穿过每个控制点的中心；
 *       又因为外扩量 pad = 控制点半径，控制点整体落在元素轮廓之外，不会遮挡元素内容。
 * 注意：控制点位置与命中检测（useCanvasEditor.handleAt）共用本函数，
 *       改动这里的几何定义会同时影响「看到的点」和「能点到的区域」。
 */
export function handlePoints(
  el: EditorElement,
  handleSize = HANDLE_SCREEN_SIZE,
): HandlePoint[] {
  const pad = selectionPad(handleSize)
  const x0 = el.x - pad
  const y0 = el.y - pad
  const x1 = el.x + el.width + pad
  const y1 = el.y + el.height + pad
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return [
    { key: 'nw', x: x0, y: y0 },
    { key: 'n', x: cx, y: y0 },
    { key: 'ne', x: x1, y: y0 },
    { key: 'e', x: x1, y: cy },
    { key: 'se', x: x1, y: y1 },
    { key: 's', x: cx, y: y1 },
    { key: 'sw', x: x0, y: y1 },
    { key: 'w', x: x0, y: cy },
  ]
}

/** 控制点 → 鼠标样式 */
export const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

/**
 * 控制点命中半径（设计坐标，传入的 handleSize 也须是设计坐标）。
 * 逻辑：取边长的 1.25 倍（= 半边长 + 0.25 边长作为手感余量）。
 *       比例化而非固定加值，这样控制点在屏幕上恒定 18px 时，
 *       命中范围在屏幕上同样恒定，不会随画布缩放变得难点。
 */
export function handleHitRadius(handleSize = HANDLE_SCREEN_SIZE): number {
  return handleSize * 1.25
}
