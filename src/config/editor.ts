/**
 * 画布设计尺寸与缩放常量
 */
export const DESIGN_WIDTH = 900;
export const DESIGN_HEIGHT = 600;

/**
 * 选中控制点边长（单位：屏幕 px，恒定值）
 * 注意：这是「显示尺寸」而非「设计坐标尺寸」。
 * 控制点渲染在带 transform: scale 的图层里，实际写入样式的值会按 1/scale 反向换算
 * （见 utils/selection.ts 的 pxInDesign），因此无论画布怎么缩放，屏幕上都保持这个大小。
 */
export const HANDLE_SCREEN_SIZE = 9;

/** 元素最小边长 */
export const MIN_ELEMENT_SIZE = 16;

/** 8 个等比缩放控制点 */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
