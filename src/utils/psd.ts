/**
 * PSD 文件解析工具
 *
 * 基于 ag-psd 在浏览器端解析 PSD 设计稿：
 * - 遍历图层树（含分组递归），按「自底向上」顺序编号（与画布 z-index 顺序一致）
 * - 区分「文字图层」与「图片图层」，生成两套不同结构的 JSON
 * - 坐标 / 尺寸 / 字号按 psd → 设计画布的比例缩放，并居中偏移
 */
import { readPsd, type Color, type Layer, type Psd, type TextStyle } from 'ag-psd'
import { DESIGN_HEIGHT, DESIGN_WIDTH, clamp } from '@/config/editor'

/** 文字图层解析后的 JSON 结构 */
export interface PsdTextJson {
  type: 'text'
  /** 全局顺序号（自底向上），导入画布时用于恢复图层 z-index */
  order: number
  name: string
  content: string
  /** 已按设计画布比例缩放后的字号 */
  fontSize: number
  fontFamily: string
  fontWeight: number
  lineHeight: number
  /** 十六进制颜色，如 #1f2329 */
  color: string
  /** 以下均为设计画布坐标系 */
  x: number
  y: number
  width: number
  height: number
  opacity: number
  /** PSD 原始信息（调试 / 数据溯源用） */
  source: {
    layerName: string | null
    fontSize: number
    fontName: string | null
    leading: number | null
    box: { left: number; top: number; right: number; bottom: number }
  }
}

/** 图片图层解析后的 JSON 结构 */
export interface PsdImageJson {
  type: 'image'
  /** 全局顺序号（自底向上），导入画布时用于恢复图层 z-index */
  order: number
  name: string
  /** 图层像素导出的 dataURL（PNG） */
  src: string
  /** 以下均为设计画布坐标系 */
  x: number
  y: number
  width: number
  height: number
  opacity: number
  /** PSD 原始信息（调试 / 数据溯源用） */
  source: {
    layerName: string | null
    canvasWidth: number
    canvasHeight: number
    box: { left: number; top: number; right: number; bottom: number }
  }
}

/** 解析结果总结构：文字与图片分两个数组存放 */
export interface PsdParseResult {
  meta: {
    fileName: string
    psdWidth: number
    psdHeight: number
    /** psd 坐标 → 设计画布坐标的缩放比 */
    scale: number
    /** 等比缩放后在设计画布中的居中偏移 */
    offsetX: number
    offsetY: number
    textCount: number
    imageCount: number
    /** 被跳过的图层数（隐藏 / 无内容 / 无坐标） */
    skippedCount: number
    skippedReasons: string[]
  }
  texts: PsdTextJson[]
  images: PsdImageJson[]
}

/** 解析失败的统一错误 */
export class PsdParseError extends Error {}

/** 颜色对象 → #rrggbb（不支持的色彩模式回退黑色） */
function colorToHex(color: Color | undefined): string {
  if (!color) return '#1f2329'
  const c = color as { r?: number; g?: number; b?: number; fr?: number; fg?: number; fb?: number }
  let r = 31
  let g = 35
  let b = 41
  if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
    r = c.r
    g = c.g
    b = c.b
  } else if (
    typeof c.fr === 'number' && typeof c.fg === 'number' && typeof c.fb === 'number'
  ) {
    r = Math.round(c.fr * 255)
    g = Math.round(c.fg * 255)
    b = Math.round(c.fb * 255)
  }
  const hex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/** PSD 文本行分隔符统一为 \n */
function normalizeTextContent(raw: string): string {
  return raw.replace(/\r\n?|\n/g, '\n').trim()
}

/** 取文字图层第一个有效的样式对象（兼容 style / styleRuns 两种存放方式） */
function firstTextStyle(layer: Layer): TextStyle | undefined {
  const runs = (layer.text as { styleRuns?: { style?: TextStyle }[] } | undefined)?.styleRuns
  return layer.text?.style ?? runs?.find((r) => r.style)?.style
}

/** 字体名 → 带 fallback 的 font-family 字符串 */
function buildFontFamily(fontName: string | null | undefined): string {
  if (!fontName) {
    return 'Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif'
  }
  return `"${fontName}", Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif`
}

/** 图层像素 → dataURL */
function layerToDataURL(layer: Layer): string | null {
  const canvas = layer.canvas
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** 读取 PSD 文件并解析为「文字 JSON + 图片 JSON」 */
export async function parsePsdFile(file: File): Promise<PsdParseResult> {
  if (!/\.psd$/i.test(file.name)) {
    throw new PsdParseError(`请选择 .psd 文件（当前文件：${file.name}）`)
  }

  let psd: Psd
  try {
    const buffer = await file.arrayBuffer()
    // 只需要图层级像素，跳过合成图 / 缩略图 / 智能对象外链，减小内存占用
    psd = readPsd(buffer, {
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
    })
  } catch (e) {
    throw new PsdParseError(
      `PSD 解析失败：${e instanceof Error ? e.message : String(e)}（文件可能损坏或为不支持的格式）`,
    )
  }

  if (!psd.width || !psd.height) {
    throw new PsdParseError('PSD 尺寸信息缺失，无法解析')
  }

  // psd → 设计画布：等比缩放 + 居中
  const scale = Math.min(DESIGN_WIDTH / psd.width, DESIGN_HEIGHT / psd.height)
  const offsetX = (DESIGN_WIDTH - psd.width * scale) / 2
  const offsetY = (DESIGN_HEIGHT - psd.height * scale) / 2

  const texts: PsdTextJson[] = []
  const images: PsdImageJson[] = []
  const skippedReasons: string[] = []
  let order = 0
  let skipped = 0

  /** 坐标换算：psd 原始坐标 → 设计画布坐标（等比缩放） */
  const toDesign = (v: number) => Math.round(v * scale)

  function walk(layers: Layer[] | undefined, groupHidden: boolean) {
    if (!layers) return
    // ag-psd children 为自底向上顺序，顺序遍历即得到正确的 z-index 顺序
    for (const layer of layers) {
      const hidden = groupHidden || layer.hidden === true

      if (layer.children) {
        walk(layer.children, hidden)
        continue
      }

      order += 1
      if (hidden) {
        skipped += 1
        skippedReasons.push(`「${layer.name}」：图层被隐藏`)
        continue
      }

      const { left, top, right, bottom } = layer
      if (
        left === undefined || top === undefined ||
        right === undefined || bottom === undefined ||
        right <= left || bottom <= top
      ) {
        skipped += 1
        skippedReasons.push(`「${layer.name}」：缺少有效坐标/尺寸`)
        continue
      }

      const box = { left, top, right, bottom }
      const opacity = clamp(layer.opacity ?? 1, 0, 1)

      // ===== 文字图层 =====
      const rawContent = layer.text?.text
      if (rawContent !== undefined && rawContent.trim() !== '') {
        const style = firstTextStyle(layer)
        const psdFontSize = style?.fontSize ?? 32
        const leading = style?.leading ?? null
        const content = normalizeTextContent(rawContent)

        texts.push({
          type: 'text',
          order,
          name: layer.name || `文字 ${texts.length + 1}`,
          content,
          fontSize: clamp(Math.round(psdFontSize * scale), 8, 600),
          fontFamily: buildFontFamily(style?.font?.name ?? null),
          fontWeight: style?.fauxBold ? 700 : 400,
          lineHeight:
            leading !== null && leading > 0 && psdFontSize > 0
              ? clamp(leading / psdFontSize, 0.8, 4)
              : 1.2,
          color: colorToHex(style?.fillColor),
          x: toDesign(left) + Math.round(offsetX),
          y: toDesign(top) + Math.round(offsetY),
          width: Math.round((right - left) * scale),
          height: Math.round((bottom - top) * scale),
          opacity,
          source: {
            layerName: layer.name ?? null,
            fontSize: psdFontSize,
            fontName: style?.font?.name ?? null,
            leading,
            box,
          },
        })
        continue
      }

      // ===== 图片图层 =====
      const src = layerToDataURL(layer)
      if (src) {
        images.push({
          type: 'image',
          order,
          name: layer.name || `图片 ${images.length + 1}`,
          src,
          x: toDesign(left) + Math.round(offsetX),
          y: toDesign(top) + Math.round(offsetY),
          width: Math.round((right - left) * scale),
          height: Math.round((bottom - top) * scale),
          opacity,
          source: {
            layerName: layer.name ?? null,
            canvasWidth: layer.canvas!.width,
            canvasHeight: layer.canvas!.height,
            box,
          },
        })
      } else {
        skipped += 1
        skippedReasons.push(`「${layer.name}」：无像素数据（空图层或纯填充层）`)
      }
    }
  }

  walk(psd.children, false)

  return {
    meta: {
      fileName: file.name,
      psdWidth: psd.width,
      psdHeight: psd.height,
      scale: Math.round(scale * 10000) / 10000,
      offsetX: Math.round(offsetX),
      offsetY: Math.round(offsetY),
      textCount: texts.length,
      imageCount: images.length,
      skippedCount: skipped,
      skippedReasons,
    },
    texts,
    images,
  }
}
