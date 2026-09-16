/**
 * PSD 文件解析工具
 *
 * 基于 ag-psd 在浏览器端解析 PSD 设计稿，按图层名称路由解析结果：
 * - 图层名包含「背景图片」→ 画布背景，写入 page.container（container 宽高 = 画布宽高）
 * - 图层名包含「素材」   → 图片元素（type: 'image'）
 * - 文字图层（有文本内容）→ 文字元素（type: 'text'）
 * - 其余图层             → 可填充元素（type: 'frame'，结构对齐徕珂印 frame 组件：
 *                          config.contentImageUrl 填充图 + config.maskImageUrl 遮罩图）
 *
 * 输出 JSON 顶层为 page 数组（参考模板结构）：
 * [{ isTemplate, pageType, pageName, container: {...}, clothesContainer, data: [...] }]
 *
 * 坐标不做缩放，保持 PSD 原始像素；画布尺寸由导入方切换为 PSD 尺寸，
 * 渲染时在 .canvas-stage 内居中并按比例缩放显示。
 */
import { readPsd, type Color, type Layer, type Psd, type TextStyle } from 'ag-psd'
import { clamp } from '@/config/editor'

/* ================= JSON 结构定义 ================= */

/** 文字图层解析后的 JSON 结构 */
export interface PsdTextJson {
  type: 'text'
  /** 全局顺序号（自底向上），导入画布时用于恢复图层 z-index */
  zIndex: number
  name: string
  content: string
  /** PSD 原始字号（px），画布尺寸 = PSD 尺寸，无需缩放 */
  fontSize: number
  fontFamily: string
  fontWeight: number
  lineHeight: number
  /** 十六进制颜色，如 #1f2329 */
  color: string
  /** PSD 像素坐标系 */
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

/** 图片元素 JSON（图层名包含「素材」） */
export interface PsdImageJson {
  type: 'image'
  zIndex: number
  name: string
  /** 图层像素导出的 dataURL（PNG） */
  url: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  source: {
    layerName: string | null
    canvasWidth: number
    canvasHeight: number
    box: { left: number; top: number; right: number; bottom: number }
  }
}

/** frame 元素修饰图片项（imgList） */
export interface PsdFrameImgItem {
  url: string
  width: number
  height: number
  left: number
  top: number
}

/** frame 元素 config（对齐徕珂印 frame 组件数据结构） */
export interface PsdFrameConfigJson {
  width: number
  height: number
  id: string
  /** 填充内容图尺寸（PSD 导入时铺满 viewBox） */
  imgContentWidth: number
  imgContentHeight: number
  imgContentLeft: number
  imgContentTop: number
  originImgContentHeight: number
  originImgContentWidth: number
  viewBoxWidth: number
  viewBoxHeight: number
  isShow: boolean
  left: number
  top: number
  /** 填充内容图（PSD 图层像素，dataURL；后续可替换为 OSS 地址） */
  contentImageUrl: string
  defaultContentImageUrl: string
  /** 遮罩图：图层 alpha 通道生成的白色亮度遮罩（SVG mask 默认按亮度遮罩） */
  maskImageUrl: string
  rate: number
  scale: number
  x: number
  y: number
  zIndex: number
  aspectRatio: number
}

/**
 * 可填充元素 JSON（type: 'frame'），对齐徕珂印 frame 组件结构
 * 渲染方式参考 frame 组件模板：
 * <svg viewBox="0 0 viewBoxWidth viewBoxHeight">
 *   <defs><mask id="mask-{id}"><image href={maskImageUrl}/></mask></defs>
 *   <image href={contentImageUrl} mask="url(#mask-{id})"/>
 * </svg>
 */
export interface PsdFrameJson {
  name: string
  type: 'frame'
  width: number
  height: number
  x: number
  y: number
  zIndex: number
  rotate: number
  isFlipX: boolean
  isFlipY: boolean
  isLocked: boolean
  isNeedEdit: boolean
  /** 修饰图片列表（PSD 导入为空） */
  imgList: PsdFrameImgItem[]
  config: PsdFrameConfigJson
  isSelected: boolean
  id: string
  isTemplate: boolean
}

/** 画布背景（「背景图片」图层）写入的容器字段 */
export interface PsdContainerJson {
  /** 容器宽 = 画布宽（PSD 画布尺寸） */
  width: number
  /** 容器高 = 画布高（PSD 画布尺寸） */
  height: number
  /** 容器背景图片（「背景图片」图层的 dataURL，无则空字符串） */
  url: string
  /** 为 true 时下方元素无事件（导入默认 false，按业务需要调整） */
  isTop: boolean
  backgroundColor: string
  bleedLine: number
  bleedLineDur: number
  /** 修饰图片，永远置顶、事件可穿透到下层（PSD 导入暂无对应概念，留空） */
  decorateBackgroundImage: Array<{ x: string; y: string; width: string; height: string; isEdit: boolean; url: string }>
}

/** 单页 JSON 结构（参考徕珂印模板结构） */
export interface PsdPageJson {
  /** 是否内置模板（内置模板不可删除）；PSD 导入为 false */
  isTemplate: boolean
  pageType: string
  pageName: string
  container: PsdContainerJson
  /** PSD 导入无印花区域概念，置 null */
  clothesContainer: null
  /** 页面元素（文字 / 图片 / 可填充元素），按自底向上顺序 */
  data: Array<PsdTextJson | PsdImageJson | PsdFrameJson>
}

/** 解析结果：pages 即最终 JSON（数组结构），meta 为解析统计 */
export interface PsdParseResult {
  meta: {
    fileName: string
    psdWidth: number
    psdHeight: number
    textCount: number
    imageCount: number
    frameCount: number
    /** 是否解析到「背景图片」容器背景 */
    hasContainerUrl: boolean
    /** 被跳过的图层数（隐藏 / 无内容 / 无坐标） */
    skippedCount: number
    skippedReasons: string[]
  }
  pages: PsdPageJson[]
}

/** 解析失败的统一错误 */
export class PsdParseError extends Error {}

/** SVG 字符串 → 可直接作为 <img>/drawImage 数据源的 dataURL */
export function svgToDataURL(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 生成 UUID（frame 元素 id 用，对齐徕珂印的 uuid 格式） */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/* ================= 内部工具 ================= */

/** 颜色对象 → #rrggbb（不支持的色彩模式回退默认色） */
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

/**
 * 图层像素 → 遮罩图 dataURL。
 * SVG <mask> 默认按亮度遮罩（白 = 显示，黑 = 隐藏），而 PSD 图层形状由
 * alpha 通道表达，因此把图层像素转成「RGB 全白 + 保留 alpha」的 PNG：
 * 遮罩值 = 亮度 × alpha = 1 × alpha，即原 alpha 区域可见，与徕珂印
 * frame 组件的 maskImageUrl 用法一致。替换填充图时区域由该遮罩决定。
 */
function layerToMaskDataURL(layer: Layer): string | null {
  const canvas = layer.canvas
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null
  try {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0)
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255
      d[i + 1] = 255
      d[i + 2] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * 由遮罩图 / 填充图 URL 构建渲染 SVG + mask 字符串，
 * 结构对齐徕珂印 frame 组件模板（svg-show 部分）。
 * frame 元素替换填充图时也复用此函数（只需换 contentImageUrl）。
 */
export function buildFrameSvgByConfig(opts: {
  width: number
  height: number
  viewBoxWidth: number
  viewBoxHeight: number
  maskId: string
  maskImageUrl: string
  imgContentLeft: number
  imgContentTop: number
  imgContentWidth: number
  imgContentHeight: number
  contentImageUrl: string
}): { svg: string; mask: string } {
  const maskId = opts.maskId
  const mask =
    `<mask id="${maskId}">` +
    `<image href="${opts.maskImageUrl}" x="0" y="0" width="${opts.viewBoxWidth}" height="${opts.viewBoxHeight}" preserveAspectRatio="none"/>` +
    `</mask>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.viewBoxWidth} ${opts.viewBoxHeight}" width="${opts.width}" height="${opts.height}" preserveAspectRatio="none">` +
    `<defs>${mask}</defs>` +
    `<image x="${opts.imgContentLeft}" y="${opts.imgContentTop}" width="${opts.imgContentWidth}" height="${opts.imgContentHeight}" href="${opts.contentImageUrl}" preserveAspectRatio="none" mask="url(#${maskId})"/>` +
    `</svg>`
  return { svg, mask }
}

/** 由 frame JSON 构建编辑器渲染用的 SVG / mask 字符串 */
export function buildFrameSvg(f: PsdFrameJson): { svg: string; mask: string } {
  const c = f.config
  return buildFrameSvgByConfig({
    width: c.width,
    height: c.height,
    viewBoxWidth: c.viewBoxWidth,
    viewBoxHeight: c.viewBoxHeight,
    maskId: `mask-${c.id}`,
    maskImageUrl: c.maskImageUrl,
    imgContentLeft: c.imgContentLeft,
    imgContentTop: c.imgContentTop,
    imgContentWidth: c.imgContentWidth,
    imgContentHeight: c.imgContentHeight,
    contentImageUrl: c.contentImageUrl,
  })
}

/* ================= 主入口 ================= */

/** 读取 PSD 文件并解析为「page 数组」结构 JSON */
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

  const pageName = file.name.replace(/\.psd$/i, '')
  const data: PsdPageJson['data'] = []
  const skippedReasons: string[] = []
  let zIndex = 0
  let skipped = 0
  let textCount = 0
  let imageCount = 0
  let frameCount = 0
  let containerUrl = ''
  let containerBgFound = false

  function walk(layers: Layer[] | undefined, groupHidden: boolean) {
    if (!layers) return
    // ag-psd children 为自底向上顺序，顺序遍历即得到正确的 z-index 顺序
    for (const layer of layers) {
      const hidden = groupHidden || layer.hidden === true

      if (layer.children) {
        walk(layer.children, hidden)
        continue
      }

      zIndex += 1
      if (hidden) {
        skipped += 1
        skippedReasons.push(`「${layer.name}」：图层被隐藏`)
        continue
      }

      const name = layer.name ?? ''
      const { left, top, right, bottom } = layer
      if (
        left === undefined || top === undefined ||
        right === undefined || bottom === undefined ||
        right <= left || bottom <= top
      ) {
        skipped += 1
        skippedReasons.push(`「${name}」：缺少有效坐标/尺寸`)
        continue
      }

      const box = { left, top, right, bottom }
      const w = right - left
      const h = bottom - top
      const opacity = clamp(layer.opacity ?? 1, 0, 1)

      // ===== 1) 「背景图片」→ 画布背景 container（首个生效，宽高 = 画布尺寸） =====
      if (name.includes('背景图片')) {
        if (containerBgFound) {
          skipped += 1
          skippedReasons.push(`「${name}」：已存在「背景图片」背景，此图层被跳过`)
          continue
        }
        const url = layerToDataURL(layer)
        if (!url) {
          skipped += 1
          skippedReasons.push(`「${name}」：无像素数据，无法作为背景`)
          continue
        }
        containerUrl = url
        containerBgFound = true
        continue
      }

      // ===== 2) 「素材」→ 图片元素（名称优先级最高，即使文字图层命名为素材也按图片处理） =====
      if (name.includes('素材')) {
        const url = layerToDataURL(layer)
        if (url) {
          imageCount += 1
          data.push({
            type: 'image',
            zIndex,
            name: name || `图片 ${imageCount}`,
            url,
            x: left,
            y: top,
            width: w,
            height: h,
            opacity,
            source: {
              layerName: name || null,
              canvasWidth: layer.canvas!.width,
              canvasHeight: layer.canvas!.height,
              box,
            },
          })
        } else {
          skipped += 1
          skippedReasons.push(`「${name}」：无像素数据（空图层或纯填充层）`)
        }
        continue
      }

      // ===== 3) 文字图层 → 文字元素 =====
      const rawContent = layer.text?.text
      if (rawContent !== undefined && rawContent.trim() !== '') {
        const style = firstTextStyle(layer)
        const fontSize = clamp(Math.round(style?.fontSize ?? 32), 8, 600)
        const leading = style?.leading ?? null
        textCount += 1
        data.push({
          type: 'text',
          zIndex,
          name: name || `文字 ${textCount}`,
          content: normalizeTextContent(rawContent),
          fontSize,
          fontFamily: buildFontFamily(style?.font?.name ?? null),
          fontWeight: style?.fauxBold ? 700 : 400,
          lineHeight:
            leading !== null && leading > 0 && fontSize > 0
              ? clamp(leading / fontSize, 0.8, 4)
              : 1.2,
          color: colorToHex(style?.fillColor),
          x: left,
          y: top,
          width: w,
          height: h,
          opacity,
          source: {
            layerName: name || null,
            fontSize: style?.fontSize ?? 32,
            fontName: style?.font?.name ?? null,
            leading,
            box,
          },
        })
        continue
      }

      // ===== 4) 其余非「素材」图层 → SVG 可填充元素（frame，结构对齐徕珂印 frame 组件） =====
      const contentUrl = layerToDataURL(layer)
      const maskUrl = layerToMaskDataURL(layer)
      if (contentUrl && maskUrl) {
        frameCount += 1
        const frameId = genId()
        data.push({
          name: name || `相片*${frameCount}`,
          type: 'frame',
          width: w,
          height: h,
          x: left,
          y: top,
          zIndex,
          rotate: 0,
          isFlipX: false,
          isFlipY: false,
          isLocked: false,
          isNeedEdit: true,
          imgList: [],
          config: {
            width: w,
            height: h,
            id: frameId,
            // PSD 导入时填充图铺满整个 viewBox
            imgContentWidth: w,
            imgContentHeight: h,
            imgContentLeft: 0,
            imgContentTop: 0,
            originImgContentWidth: w,
            originImgContentHeight: h,
            viewBoxWidth: w,
            viewBoxHeight: h,
            isShow: true,
            left: 0,
            top: 0,
            contentImageUrl: contentUrl,
            defaultContentImageUrl: contentUrl,
            maskImageUrl: maskUrl,
            rate: 1,
            scale: 1,
            x: 0,
            y: 0,
            zIndex,
            aspectRatio: w / h,
          },
          isSelected: false,
          id: frameId,
          // PSD 导入非内置模板，可删除
          isTemplate: false,
        })
      } else {
        skipped += 1
        skippedReasons.push(`「${name}」：无像素数据（空图层或纯填充层）`)
      }
    }
  }

  walk(psd.children, false)

  const page: PsdPageJson = {
    isTemplate: false,
    pageType: 'content',
    pageName,
    container: {
      // 背景宽高 = 画布（PSD 画布）尺寸
      width: psd.width,
      height: psd.height,
      url: containerUrl,
      isTop: false,
      backgroundColor: '#ffffff',
      bleedLine: 0,
      bleedLineDur: 0,
      decorateBackgroundImage: [],
    },
    clothesContainer: null,
    data,
  }

  return {
    meta: {
      fileName: file.name,
      psdWidth: psd.width,
      psdHeight: psd.height,
      textCount,
      imageCount,
      frameCount,
      hasContainerUrl: containerBgFound,
      skippedCount: skipped,
      skippedReasons,
    },
    pages: [page],
  }
}
