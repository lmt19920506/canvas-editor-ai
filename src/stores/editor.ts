import { defineStore } from 'pinia'
import type {
  EditorElement,
  ElementPatch,
  FrameElement,
  ImageElement,
  TextElement,
} from '@/types/element'
import { isFrameElement, isTextElement } from '@/types/element'
import { DESIGN_HEIGHT, DESIGN_WIDTH, clamp, MIN_ELEMENT_SIZE } from '@/config/editor'
import { measureText } from '@/utils/measure'
import { uid } from '@/utils/uid'
import {
  buildFrameSvg,
  buildFrameSvgByConfig,
  svgToDataURL,
  type PsdParseResult,
} from '@/utils/psd'

/** 画布尺寸上下限（PSD 导入后画布 = PSD 原始尺寸） */
const CANVAS_MIN = 16
const CANVAS_MAX = 8000

export const DEFAULT_FONT_FAMILY =
  'Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 默认文字样式 */
const DEFAULT_TEXT_STYLE = {
  content: '点击此处编辑文字',
  fontSize: 40,
  fontWeight: 700,
  fontFamily: DEFAULT_FONT_FAMILY,
  lineHeight: 1.5,
  color: '#1f2329',
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    /** 画布元素，数组顺序即层级（后面的在上层） */
    elements: [] as EditorElement[],
    selectedId: null as string | null,
    /** 画布尺寸（默认设计尺寸；PSD 导入后切换为 PSD 原始尺寸） */
    canvasWidth: DESIGN_WIDTH,
    canvasHeight: DESIGN_HEIGHT,
  }),

  getters: {
    selected(state): EditorElement | null {
      return state.elements.find((e) => e.id === state.selectedId) ?? null
    },
    isEmpty: (state) => state.elements.length === 0,
  },

  actions: {
    select(id: string | null) {
      this.selectedId = id
    },

    /** 切换画布尺寸（PSD 导入时调用，元素坐标保留 PSD 原始像素） */
    setCanvasSize(width: number, height: number) {
      this.canvasWidth = clamp(Math.round(width), CANVAS_MIN, CANVAS_MAX)
      this.canvasHeight = clamp(Math.round(height), CANVAS_MIN, CANVAS_MAX)
    },

    /** 在指定中心点添加一张图片（自动按比例缩放到不超过画布 60%） */
    addImage(
      source: { name: string; src: string; width: number; height: number },
      cx?: number,
      cy?: number,
    ): ImageElement {
      const centerX = cx ?? this.canvasWidth / 2
      const centerY = cy ?? this.canvasHeight / 2
      const ow = source.width > 0 ? source.width : 320
      const oh = source.height > 0 ? source.height : 240
      const scale = Math.min(
        1,
        (this.canvasWidth * 0.6) / ow,
        (this.canvasHeight * 0.6) / oh,
      )
      const width = Math.max(MIN_ELEMENT_SIZE, Math.round(ow * scale))
      const height = Math.max(MIN_ELEMENT_SIZE, Math.round(oh * scale))

      const el: ImageElement = {
        id: uid('img'),
        type: 'image',
        name: source.name,
        src: source.src,
        aspectRatio: ow / oh,
        x: clamp(Math.round(centerX - width / 2), 0, this.canvasWidth - width),
        y: clamp(Math.round(centerY - height / 2), 0, this.canvasHeight - height),
        width,
        height,
        opacity: 1,
      }
      this.elements.push(el)
      this.selectedId = el.id
      return el
    },

    /** 在画布中间区域添加一段文字，支持传入预设样式覆盖 */
    addText(patch: Partial<Pick<TextElement, 'content' | 'fontSize' | 'fontWeight' | 'fontFamily' | 'color' | 'lineHeight' | 'name'>> = {}): TextElement {
      const merged = { ...DEFAULT_TEXT_STYLE, ...patch }
      const size = measureText(merged.content, merged)

      const el: TextElement = {
        id: uid('txt'),
        type: 'text',
        name: patch.name ?? merged.content.slice(0, 12),
        x: Math.round((this.canvasWidth - size.width) / 2),
        y: Math.round((this.canvasHeight - size.height) / 2),
        width: size.width,
        height: size.height,
        opacity: 1,
        ...merged,
      }
      this.elements.push(el)
      this.selectedId = el.id
      return el
    },

    /**
     * 导入 PSD 解析结果（page 数组结构）：
     * 1. 画布尺寸切换为 PSD 原始尺寸（container.width/height = 画布尺寸）
     * 2. data 中元素按 zIndex（自底向上）排序后依次 push，恢复 PSD 图层 z-index
     * 3. 文字按实际测量尺寸校正包围盒；frame 用 config（maskImageUrl/contentImageUrl）
     *    构建 SVG dataURL 渲染（含遮罩效果），svg/mask/image 原样保留在元素上
     */
    importFromPsd(result: PsdParseResult): EditorElement[] {
      const page = result.pages[0]
      if (!page) return []

      this.setCanvasSize(page.container.width, page.container.height)
      if (page.container.url) {
        // 「背景图片」作为画布背景：铺满画布的底层图片元素
        const bg: ImageElement = {
          id: uid('img'),
          type: 'image',
          name: '背景图片',
          src: page.container.url,
          aspectRatio: page.container.width / page.container.height,
          x: 0,
          y: 0,
          width: page.container.width,
          height: page.container.height,
          opacity: 1,
        }
        this.elements = [bg]
      } else {
        this.elements = []
      }

      const added: EditorElement[] = []
      const ordered = [...page.data].sort((a, b) => a.zIndex - b.zIndex)

      for (const item of ordered) {
        if (item.type === 'text') {
          const style = {
            fontSize: item.fontSize,
            fontWeight: item.fontWeight,
            fontFamily: item.fontFamily,
            lineHeight: item.lineHeight,
          }
          const m = measureText(item.content, style)
          const el: TextElement = {
            id: uid('txt'),
            type: 'text',
            name: item.name,
            content: item.content,
            color: item.color,
            ...style,
            x: clamp(item.x, 0, this.canvasWidth - m.width),
            y: clamp(item.y, 0, this.canvasHeight - m.height),
            width: m.width,
            height: m.height,
            opacity: clamp(item.opacity, 0, 1),
          }
          added.push(el)
        } else if (item.type === 'frame') {
          // 可填充元素：由 config 构建渲染 SVG（结构同徕珂印 frame 组件），填充图/遮罩图保留
          const w = Math.max(MIN_ELEMENT_SIZE, item.width)
          const h = Math.max(MIN_ELEMENT_SIZE, item.height)
          const { svg, mask } = buildFrameSvg(item)
          const el: FrameElement = {
            id: uid('frame'),
            type: 'frame',
            name: item.name,
            src: svgToDataURL(svg),
            svg,
            mask,
            maskImageUrl: item.config.maskImageUrl,
            image: item.config.contentImageUrl,
            aspectRatio: w / h,
            x: clamp(item.x, 0, this.canvasWidth - w),
            y: clamp(item.y, 0, this.canvasHeight - h),
            width: w,
            height: h,
            opacity: 1,
          }
          added.push(el)
        } else {
          const w = Math.max(MIN_ELEMENT_SIZE, item.width)
          const h = Math.max(MIN_ELEMENT_SIZE, item.height)
          const el: ImageElement = {
            id: uid('img'),
            type: 'image',
            name: item.name,
            src: item.url,
            aspectRatio: w / h,
            x: clamp(item.x, 0, this.canvasWidth - w),
            y: clamp(item.y, 0, this.canvasHeight - h),
            width: w,
            height: h,
            opacity: clamp(item.opacity, 0, 1),
          }
          added.push(el)
        }
      }

      this.elements.push(...added)
      this.selectedId = null
      return added
    },

    /**
     * 替换 frame 元素的填充图（拖拽素材到 frame 上时调用）：
     * 仅替换 SVG 里的 content image（url），遮罩 maskImageUrl 保持不变；
     * 传入图片原始尺寸时按 cover 裁切铺满遮罩区域（不变形），否则拉伸铺满
     */
    replaceFrameImage(
      id: string,
      url: string,
      natural?: { width: number; height: number },
    ): boolean {
      const el = this.elements.find((e) => e.id === id)
      if (!el || !isFrameElement(el)) return false

      const vw = el.width
      const vh = el.height
      let icLeft = 0
      let icTop = 0
      let icw = vw
      let ich = vh
      if (natural && natural.width > 0 && natural.height > 0) {
        // cover：取较大缩放比铺满 viewBox，居中裁切（超出部分被 SVG 视口裁掉）
        const s = Math.max(vw / natural.width, vh / natural.height)
        icw = Math.round(natural.width * s)
        ich = Math.round(natural.height * s)
        icLeft = Math.round((vw - icw) / 2)
        icTop = Math.round((vh - ich) / 2)
      }

      const { svg, mask } = buildFrameSvgByConfig({
        width: vw,
        height: vh,
        viewBoxWidth: vw,
        viewBoxHeight: vh,
        maskId: `mask-${el.id}`,
        maskImageUrl: el.maskImageUrl,
        imgContentLeft: icLeft,
        imgContentTop: icTop,
        imgContentWidth: icw,
        imgContentHeight: ich,
        contentImageUrl: url,
      })

      el.image = url
      el.svg = svg
      el.mask = mask
      el.src = svgToDataURL(svg)
      this.selectedId = el.id
      return true
    },

    /** 移动（拖拽/键盘/面板输入） */
    moveElement(id: string, x: number, y: number) {
      const el = this.elements.find((e) => e.id === id)
      if (!el) return
      el.x = clamp(Math.round(x), 0, this.canvasWidth - el.width)
      el.y = clamp(Math.round(y), 0, this.canvasHeight - el.height)
    },

    /** 设置几何尺寸；文字在缩放时同步放大/缩小字号 */
    resizeElement(
      id: string,
      rect: { x: number; y: number; width: number; height: number; fontSize?: number },
    ) {
      const el = this.elements.find((e) => e.id === id)
      if (!el) return
      el.x = rect.x
      el.y = rect.y
      el.width = rect.width
      el.height = rect.height
      if (isTextElement(el) && rect.fontSize) {
        el.fontSize = rect.fontSize
      }
    },

    /** 局部更新属性；文字字号/内容等变化后重新测量并同步尺寸 */
    patchElement(id: string, patch: ElementPatch) {
      const el = this.elements.find((e) => e.id === id)
      if (!el) return

      for (const key in patch) {
        const k = key as keyof ElementPatch
        const v = patch[k]
        if (v === undefined) continue
        ;(el as unknown as Record<string, unknown>)[k] = v
      }

      if (isTextElement(el)) {
        // 保护文字最小字号，避免测量异常
        el.fontSize = clamp(Math.round(el.fontSize || 12), 8, 600)
        el.opacity = clamp(el.opacity, 0, 1)
        const size = measureText(el.content, el)
        el.width = size.width
        el.height = size.height
      } else {
        el.opacity = clamp(el.opacity, 0, 1)
        // 图片按原宽高比校正尺寸（防止面板手动改单边破坏比例）
        if (el.width < MIN_ELEMENT_SIZE) el.width = MIN_ELEMENT_SIZE
        if (el.height < MIN_ELEMENT_SIZE) el.height = MIN_ELEMENT_SIZE
      }
    },

    removeElement(id: string) {
      const idx = this.elements.findIndex((e) => e.id === id)
      if (idx === -1) return
      this.elements.splice(idx, 1)
      if (this.selectedId === id) this.selectedId = null
    },

    duplicateElement(id: string) {
      const idx = this.elements.findIndex((e) => e.id === id)
      if (idx === -1) return
      const src = this.elements[idx]
      // 注意：src 是 reactive proxy，不能用 structuredClone，直接展开成普通对象
      const copy: EditorElement = { ...src, id: uid('el') }
      copy.x = clamp(src.x + 24, 0, this.canvasWidth - src.width)
      copy.y = clamp(src.y + 24, 0, this.canvasHeight - src.height)
      this.elements.splice(idx + 1, 0, copy)
      this.selectedId = copy.id
    },

    /** 层级：上移一层 / 下移一层（数组末尾为最上层） */
    bringForward(id: string) {
      const i = this.elements.findIndex((e) => e.id === id)
      if (i > -1 && i < this.elements.length - 1) {
        const [a, b] = [this.elements[i], this.elements[i + 1]]
        this.elements.splice(i, 2, b, a)
      }
    },

    sendBackward(id: string) {
      const i = this.elements.findIndex((e) => e.id === id)
      if (i > 0) {
        const [a, b] = [this.elements[i - 1], this.elements[i]]
        this.elements.splice(i - 1, 2, b, a)
      }
    },

    clearAll() {
      this.elements = []
      this.selectedId = null
      // 清空后恢复默认设计尺寸
      this.canvasWidth = DESIGN_WIDTH
      this.canvasHeight = DESIGN_HEIGHT
    },
  },
})
