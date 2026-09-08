import { defineStore } from 'pinia'
import type { EditorElement, ElementPatch, ImageElement, TextElement } from '@/types/element'
import { isTextElement } from '@/types/element'
import { DESIGN_HEIGHT, DESIGN_WIDTH, clamp, MIN_ELEMENT_SIZE } from '@/config/editor'
import { measureText } from '@/utils/measure'
import { uid } from '@/utils/uid'

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

    /** 在指定中心点添加一张图片（自动按比例缩放到不超过画布 60%） */
    addImage(
      source: { name: string; src: string; width: number; height: number },
      cx = DESIGN_WIDTH / 2,
      cy = DESIGN_HEIGHT / 2,
    ): ImageElement {
      const ow = source.width > 0 ? source.width : 320
      const oh = source.height > 0 ? source.height : 240
      const scale = Math.min(1, (DESIGN_WIDTH * 0.6) / ow, (DESIGN_HEIGHT * 0.6) / oh)
      const width = Math.max(MIN_ELEMENT_SIZE, Math.round(ow * scale))
      const height = Math.max(MIN_ELEMENT_SIZE, Math.round(oh * scale))

      const el: ImageElement = {
        id: uid('img'),
        type: 'image',
        name: source.name,
        src: source.src,
        aspectRatio: ow / oh,
        x: clamp(Math.round(cx - width / 2), 0, DESIGN_WIDTH - width),
        y: clamp(Math.round(cy - height / 2), 0, DESIGN_HEIGHT - height),
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
        x: Math.round((DESIGN_WIDTH - size.width) / 2),
        y: Math.round((DESIGN_HEIGHT - size.height) / 2),
        width: size.width,
        height: size.height,
        opacity: 1,
        ...merged,
      }
      this.elements.push(el)
      this.selectedId = el.id
      return el
    },

    /** 移动（拖拽/键盘/面板输入） */
    moveElement(id: string, x: number, y: number) {
      const el = this.elements.find((e) => e.id === id)
      if (!el) return
      el.x = clamp(Math.round(x), 0, DESIGN_WIDTH - el.width)
      el.y = clamp(Math.round(y), 0, DESIGN_HEIGHT - el.height)
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
      copy.x = clamp(src.x + 24, 0, DESIGN_WIDTH - src.width)
      copy.y = clamp(src.y + 24, 0, DESIGN_HEIGHT - src.height)
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
    },
  },
})
