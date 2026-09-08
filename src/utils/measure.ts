import type { TextFontStyle } from '@/types/element'

/** 全局共享的测量上下文（不挂载到页面） */
let measureCtx: CanvasRenderingContext2D | null = null

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!measureCtx) {
    const c = document.createElement('canvas')
    measureCtx = c.getContext('2d')
  }
  return measureCtx
}

/** 依据字体样式拼出 ctx.font 简写 */
export function fontShorthand(style: Pick<TextFontStyle, 'fontSize' | 'fontWeight' | 'fontFamily'>): string {
  return `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`
}

export interface MeasuredText {
  /** 文本像素宽 */
  width: number
  /** 文本像素高（含行高） */
  height: number
  lines: string[]
  lineHeight: number
}

/**
 * 测量多行文字尺寸。
 * 空内容返回一个占位行，保证元素有最小可点击区域。
 */
export function measureText(content: string, style: TextFontStyle): MeasuredText {
  const c = getMeasureCtx()
  const rawLines = content === '' ? [''] : content.split('\n')
  const lines = rawLines.map((l) => (l === '' ? ' ' : l))
  const lineHeight = Math.max(4, style.fontSize * style.lineHeight)

  if (c) {
    c.font = fontShorthand(style)
  }

  let width = 0
  if (c) {
    for (const line of lines) {
      width = Math.max(width, c.measureText(line).width)
    }
  }
  return {
    width: Math.max(2, Math.ceil(width)),
    height: Math.ceil(lines.length * lineHeight),
    lines,
    lineHeight,
  }
}
