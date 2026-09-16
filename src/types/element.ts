/** 画布元素类型 */
export type ElementType = 'image' | 'text' | 'frame'

/** 文字字体样式 */
export interface TextFontStyle {
  fontSize: number
  fontWeight: number
  fontFamily: string
  lineHeight: number
}

/** 元素公共基础字段（x/y 为左上角，画布坐标系） */
export interface EditorElementBase {
  id: string
  type: ElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  opacity: number // 0 ~ 1
}

/** 图片元素 */
export interface ImageElement extends EditorElementBase {
  type: 'image'
  src: string
  /** 图片自然宽高比（width / height），等比缩放基准 */
  aspectRatio: number
}

/** 文字元素 */
export interface TextElement extends EditorElementBase, TextFontStyle {
  type: 'text'
  content: string
  color: string
}

/**
 * 可填充元素（frame）：由 SVG 形状 + mask + 填充图组成
 * PSD 中非「素材」「背景图片」图层解析为该类型
 */
export interface FrameElement extends EditorElementBase {
  type: 'frame'
  /** 渲染用图片源（SVG dataURL，内含 mask 效果） */
  src: string
  /** SVG 字符串（含 defs/mask 定义） */
  svg: string
  /** mask 字符串（决定可填充区域，基于图层 alpha 通道） */
  mask: string
  /** 遮罩图 URL（重建 SVG / 替换填充图时使用） */
  maskImageUrl: string
  /** 填充图片 dataURL（PSD 图层像素） */
  image: string
  /** 图片自然宽高比（width / height），等比缩放基准 */
  aspectRatio: number
}

export type EditorElement = ImageElement | TextElement | FrameElement

/** 可部分更新的字段（不包含 id/type 的联合补丁） */
export type ElementPatch = Partial<Omit<ImageElement, 'id' | 'type'>> &
  Partial<Omit<TextElement, 'id' | 'type'>> &
  Partial<Omit<FrameElement, 'id' | 'type'>>

export function isImageElement(el: EditorElement): el is ImageElement {
  return el.type === 'image'
}

export function isTextElement(el: EditorElement): el is TextElement {
  return el.type === 'text'
}

export function isFrameElement(el: EditorElement): el is FrameElement {
  return el.type === 'frame'
}
