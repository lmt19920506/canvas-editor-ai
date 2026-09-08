/** 画布元素类型 */
export type ElementType = 'image' | 'text'

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

export type EditorElement = ImageElement | TextElement

/** 可部分更新的字段（不包含 id/type 的联合补丁） */
export type ElementPatch = Partial<Omit<ImageElement, 'id' | 'type'>> &
  Partial<Omit<TextElement, 'id' | 'type'>>

export function isImageElement(el: EditorElement): el is ImageElement {
  return el.type === 'image'
}

export function isTextElement(el: EditorElement): el is TextElement {
  return el.type === 'text'
}
