/**
 * 画布设计尺寸与缩放常量
 */
export const DESIGN_WIDTH = 900
export const DESIGN_HEIGHT = 600

/** 选中控制点边长（画布坐标系，单位：px） */
export const HANDLE_SIZE = 8

/** 元素最小边长 */
export const MIN_ELEMENT_SIZE = 16

/** 8 个等比缩放控制点 */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
