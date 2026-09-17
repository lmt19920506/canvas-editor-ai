/**
 * 选中框与控制点几何工具
 *
 * 组件（SelectionOverlay.vue）负责渲染，useCanvasEditor 负责命中检测，
 * 两者共用同一份几何数据，避免视觉与命中区域不一致。
 * 坐标均为画布设计坐标系（与元素的 x/y/width/height 一致）。
 */
import { HANDLE_SIZE, type ResizeHandle } from '@/config/editor'
import type { EditorElement } from '@/types/element'

/** 控制点位置（画布设计坐标） */
export interface HandlePoint {
  key: ResizeHandle
  x: number
  y: number
}

/** 选中框向外扩的边距 = 控制点半径，保证控制点完整显示在元素外沿 */
export function selectionPad(handleSize = HANDLE_SIZE): number {
  return handleSize / 2
}

/** 元素外扩后的选中框矩形（画布设计坐标） */
export function selectionRect(el: EditorElement, handleSize = HANDLE_SIZE) {
  const pad = selectionPad(handleSize)
  return {
    x: el.x - pad,
    y: el.y - pad,
    width: el.width + pad * 2,
    height: el.height + pad * 2,
  }
}

/** 当前元素 8 个控制点（四角 + 四边中点） */
export function handlePoints(el: EditorElement, handleSize = HANDLE_SIZE): HandlePoint[] {
  const { x, y, width: w, height: h } = el
  void handleSize // 位置与尺寸无关，仅保持签名一致
  const cx = x + w / 2
  const cy = y + h / 2
  return [
    { key: 'nw', x, y },
    { key: 'n', x: cx, y },
    { key: 'ne', x: x + w, y },
    { key: 'e', x: x + w, y: cy },
    { key: 'se', x: x + w, y: y + h },
    { key: 's', x: cx, y: y + h },
    { key: 'sw', x, y: y + h },
    { key: 'w', x, y: cy },
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

/** 控制点命中半径（略大于视觉尺寸，便于点击） */
export function handleHitRadius(handleSize = HANDLE_SIZE): number {
  return handleSize / 2 + 6
}
