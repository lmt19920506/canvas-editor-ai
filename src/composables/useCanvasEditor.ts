import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  HANDLE_SIZE,
  MIN_ELEMENT_SIZE,
  clamp,
  type ResizeHandle,
} from '@/config/editor'
import type { EditorElement, TextElement } from '@/types/element'
import { isImageElement, isTextElement } from '@/types/element'
import { measureText, fontShorthand } from '@/utils/measure'
import { loadImage, fileToDataURL, getImageSize } from '@/utils/image'
import { useEditorStore } from '@/stores/editor'
import { useAssetsStore, type AssetItem } from '@/stores/assets'

/** 拖拽素材到画布时使用的 dataTransfer 类型 */
const DRAG_MIME = 'application/x-canvas-editor-asset'

interface MoveDrag {
  kind: 'move'
  id: string
  startX: number
  startY: number
  ox: number
  oy: number
}

interface ResizeDrag {
  kind: 'resize'
  id: string
  handle: ResizeHandle
  startX: number
  startY: number
  ox: number
  oy: number
  ow: number
  oh: number
  /** 文字缩放基准字号 */
  font: number
}

type DragState = MoveDrag | ResizeDrag

export interface HandlePoint {
  key: ResizeHandle
  x: number
  y: number
}

/**
 * 画布编辑器核心 hook
 * 职责：canvas 渲染 / 点击选中 / 拖拽移动 / 8 控制点等比缩放 / 素材拖放接收 / 键盘操作
 */
export function useCanvasEditor(
  canvasRef: Ref<HTMLCanvasElement | null>,
  wrapRef: Ref<HTMLElement | null>,
) {
  const editorStore = useEditorStore()
  const assetsStore = useAssetsStore()

  /** 是否正拖拽素材悬停在画布区域（控制高亮遮罩） */
  const dragOver = ref(false)

  const imageCache = new Map<string, HTMLImageElement>()
  let drag: DragState | null = null
  let rafId = 0
  let lastCursor = ''
  let dragDepth = 0

  /* ================= 渲染 ================= */

  function getCtx(): CanvasRenderingContext2D | null {
    return canvasRef.value?.getContext('2d') ?? null
  }

  function invalidate() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      render()
    })
  }

  function render() {
    const canvas = canvasRef.value
    const ctx = getCtx()
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)

    // 背景（棋盘纹理示意透明底）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
    ctx.strokeStyle = '#f0f1f3'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0.5; x <= DESIGN_WIDTH; x += 20) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, DESIGN_HEIGHT)
    }
    for (let y = 0.5; y <= DESIGN_HEIGHT; y += 20) {
      ctx.moveTo(0, y)
      ctx.lineTo(DESIGN_WIDTH, y)
    }
    ctx.stroke()

    for (const el of editorStore.elements) {
      drawElement(ctx, el)
    }

    const sel = editorStore.selected
    if (sel && editorStore.elements.includes(sel)) {
      drawSelection(ctx, sel)
    }
  }

  function drawElement(ctx: CanvasRenderingContext2D, el: EditorElement) {
    ctx.save()
    ctx.globalAlpha = el.opacity

    if (isImageElement(el)) {
      drawImageElement(ctx, el)
    } else if (isTextElement(el)) {
      drawTextElement(ctx, el)
    }

    ctx.restore()
  }

  function drawImageElement(ctx: CanvasRenderingContext2D, el: Extract<EditorElement, { type: 'image' }>) {
    const cached = imageCache.get(el.src)
    if (cached) {
      ctx.drawImage(cached, el.x, el.y, el.width, el.height)
      return
    }
    // 占位并异步加载
    ctx.fillStyle = '#dfe3ea'
    ctx.fillRect(el.x, el.y, el.width, el.height)
    ctx.fillStyle = '#86909c'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('加载中…', el.x + el.width / 2, el.y + el.height / 2)
    loadImage(el.src)
      .then((img) => {
        imageCache.set(el.src, img)
        invalidate()
      })
      .catch(() => {
        /* 忽略坏图 */
      })
  }

  function drawTextElement(ctx: CanvasRenderingContext2D, el: TextElement) {
    const m = measureText(el.content, el)
    ctx.font = fontShorthand(el)
    ctx.fillStyle = el.color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    // 将文本块垂直居中于存储的 box，兼容缩放后的微差
    const top = el.y + (el.height - m.height) / 2
    m.lines.forEach((line, i) => {
      ctx.fillText(line, el.x, top + i * m.lineHeight + m.lineHeight / 2)
    })
  }

  /** 当前选中元素 8 个控制点 */
  function handlePoints(el: EditorElement): HandlePoint[] {
    const { x, y, width: w, height: h } = el
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

  function drawSelection(ctx: CanvasRenderingContext2D, el: EditorElement) {
    const { x, y, width: w, height: h } = el
    const pad = HANDLE_SIZE / 2

    // 选中虚线框
    ctx.save()
    ctx.strokeStyle = '#3370ff'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2)
    ctx.restore()

    // 8 个控制方块
    const pts = handlePoints(el)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#3370ff'
    ctx.lineWidth = 1.5
    for (const p of pts) {
      ctx.beginPath()
      ctx.rect(p.x - pad, p.y - pad, HANDLE_SIZE, HANDLE_SIZE)
      ctx.fill()
      ctx.stroke()
    }
  }

  /* ================= 坐标与命中 ================= */

  function toDesignPoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.value
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * DESIGN_WIDTH, 0, DESIGN_WIDTH)
    const y = clamp(((e.clientY - rect.top) / rect.height) * DESIGN_HEIGHT, 0, DESIGN_HEIGHT)
    return { x, y }
  }

  function elementAt(p: { x: number; y: number }): EditorElement | null {
    for (let i = editorStore.elements.length - 1; i >= 0; i--) {
      const el = editorStore.elements[i]
      if (
        p.x >= el.x &&
        p.x <= el.x + el.width &&
        p.y >= el.y &&
        p.y <= el.y + el.height
      ) {
        return el
      }
    }
    return null
  }

  function handleAt(el: EditorElement, p: { x: number; y: number }): ResizeHandle | null {
    const pad = HANDLE_SIZE / 2 + 6 // 命中半径略大于控制点视觉尺寸
    let best: ResizeHandle | null = null
    let bestDist = Infinity
    for (const hp of handlePoints(el)) {
      const d = Math.hypot(p.x - hp.x, p.y - hp.y)
      if (d <= pad && d < bestDist) {
        bestDist = d
        best = hp.key
      }
    }
    return best
  }

  const HANDLE_CURSOR: Record<ResizeHandle, string> = {
    nw: 'nwse-resize',
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
  }

  function applyCursor(cur: string) {
    const canvas = canvasRef.value
    if (!canvas || cur === lastCursor) return
    lastCursor = cur
    canvas.style.cursor = cur
  }

  /* ================= 等比缩放计算 ================= */

  /**
   * 以对角/对边为锚点，保持宽高比计算缩放结果。
   * 8 个控制点均参与：角点按主位移轴决定系数，边中点按本方向位移决定系数，
   * 宽度与高度始终同比例变化（含文字字号）。
   */
  function computeResize(ds: ResizeDrag, p: { x: number; y: number }) {
    const { handle, ox, oy, ow, oh, startX, startY } = ds
    const dx = p.x - startX
    const dy = p.y - startY
    const west = handle.includes('w')
    const east = handle.includes('e')
    const north = handle.includes('n')
    const south = handle.includes('s')

    let f = 1
    if (west || east) {
      const fw = (east ? ow + dx : ow - dx) / ow
      if (north || south) {
        const fh = (south ? oh + dy : oh - dy) / oh
        f = Math.abs(dy) / oh > Math.abs(dx) / ow ? fh : fw
      } else {
        f = fw
      }
    } else {
      // n / s
      f = (south ? oh + dy : oh - dy) / oh
    }

    // 最小/最大限制
    const minF = MIN_ELEMENT_SIZE / Math.max(ow, oh)
    const maxF = Math.min(DESIGN_WIDTH / ow, DESIGN_HEIGHT / oh)
    f = clamp(f, minF, maxF)

    const width = ow * f
    const height = oh * f
    let x = ox
    let y = oy
    if (west) x = ox + ow - width
    if (north) y = oy + oh - height
    x = clamp(x, 0, DESIGN_WIDTH - width)
    y = clamp(y, 0, DESIGN_HEIGHT - height)
    return { x, y, width, height, scale: f }
  }

  /* ================= 指针交互 ================= */

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    const canvas = canvasRef.value
    if (!canvas) return
    const p = toDesignPoint(e)

    const sel = editorStore.selected
    if (sel) {
      const h = handleAt(sel, p)
      if (h) {
        drag = {
          kind: 'resize',
          id: sel.id,
          handle: h,
          startX: p.x,
          startY: p.y,
          ox: sel.x,
          oy: sel.y,
          ow: sel.width,
          oh: sel.height,
          font: isTextElement(sel) ? sel.fontSize : 1,
        }
        canvas.setPointerCapture(e.pointerId)
        applyCursor(HANDLE_CURSOR[h])
        return
      }
    }

    const el = elementAt(p)
    if (el) {
      if (editorStore.selectedId !== el.id) editorStore.select(el.id)
      drag = {
        kind: 'move',
        id: el.id,
        startX: p.x,
        startY: p.y,
        ox: el.x,
        oy: el.y,
      }
      canvas.setPointerCapture(e.pointerId)
      applyCursor('move')
      return
    }

    // 点击空白：取消选中
    editorStore.select(null)
  }

  function onPointerMove(e: PointerEvent) {
    const canvas = canvasRef.value
    if (!canvas) return
    const p = toDesignPoint(e)

    // 未在拖拽时仅更新光标
    if (!drag) {
      const sel = editorStore.selected
      if (sel && handleAt(sel, p)) {
        applyCursor(HANDLE_CURSOR[handleAt(sel, p)!])
      } else if (elementAt(p)) {
        applyCursor('move')
      } else {
        applyCursor('default')
      }
      return
    }

    if (drag.kind === 'move') {
      const el = editorStore.elements.find((x) => x.id === drag!.id)
      if (!el) return
      editorStore.moveElement(
        drag.id,
        drag.ox + (p.x - drag.startX),
        drag.oy + (p.y - drag.startY),
      )
    } else {
      const el = editorStore.elements.find((x) => x.id === drag!.id)
      if (!el) return
      const r = computeResize(drag, p)
      const fontSize = isTextElement(el) ? Math.round(drag.font * r.scale) : undefined
      const { scale: _s, ...rect } = r
      editorStore.resizeElement(drag.id, { ...rect, fontSize })
      applyCursor(HANDLE_CURSOR[drag.handle])
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag) return
    drag = null
    applyCursor('default')
    const canvas = canvasRef.value
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId)
    }
  }

  /* ================= 素材拖放 ================= */

  function hasDnD(e: DragEvent): boolean {
    const types = e.dataTransfer?.types ?? []
    return types.includes(DRAG_MIME) || types.includes('Files')
  }

  function onDragEnter(e: DragEvent) {
    if (!hasDnD(e)) return
    e.preventDefault()
    dragDepth += 1
    dragOver.value = true
  }

  function onDragOver(e: DragEvent) {
    if (!hasDnD(e)) return
    e.preventDefault() // 必须阻止默认，drop 才会触发
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e: DragEvent) {
    if (!hasDnD(e)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dragOver.value = false
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragDepth = 0
    dragOver.value = false
    const p = toDesignPoint(e)

    // 1) 内部素材
    const assetId = e.dataTransfer?.getData(DRAG_MIME) ?? ''
    if (assetId) {
      const asset = assetsStore.byId(assetId)
      if (asset) {
        void addImageFromAsset(asset, p)
        return
      }
    }
    // 2) 外部图片文件直接拖入
    const files = Array.from(e.dataTransfer?.files ?? [])
    const file = files.find((f) => f.type.startsWith('image/'))
    if (file) {
      void fileToDataURL(file).then(async (src) => {
        const size = await getImageSize(src)
        editorStore.addImage(
          { name: file.name, src, width: size.width, height: size.height },
          p.x,
          p.y,
        )
      })
    }
  }

  async function addImageFromAsset(asset: AssetItem, p: { x: number; y: number }) {
    const size = await getImageSize(asset.src)
    editorStore.addImage(
      { name: asset.name, src: asset.src, width: size.width, height: size.height },
      p.x,
      p.y,
    )
  }

  /* ================= 键盘 ================= */

  function isTypingTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null
    if (!t) return false
    if (t.isContentEditable) return true
    const tag = t.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e)) return
    const sel = editorStore.selected
    if (!sel) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      editorStore.removeElement(sel.id)
      return
    }
    if (e.key === 'Escape') {
      editorStore.select(null)
      return
    }

    // 方向键微调（Shift 加速）
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      }
      const [dx, dy] = map[e.key] ?? [0, 0]
      editorStore.moveElement(sel.id, sel.x + dx, sel.y + dy)
    }
  }

  /* ================= 生命周期 ================= */

  onMounted(() => {
    const canvas = canvasRef.value
    const wrap = wrapRef.value
    if (!canvas || !wrap) return

    // 首次渲染
    invalidate()

    // 数据变化后重绘
    watch(
      () => editorStore.elements,
      () => invalidate(),
      { deep: true },
    )
    watch(
      () => editorStore.selectedId,
      () => invalidate(),
    )

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    wrap.addEventListener('dragenter', onDragEnter)
    wrap.addEventListener('dragover', onDragOver)
    wrap.addEventListener('dragleave', onDragLeave)
    wrap.addEventListener('drop', onDrop)

    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    const canvas = canvasRef.value
    const wrap = wrapRef.value
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
    if (wrap) {
      wrap.removeEventListener('dragenter', onDragEnter)
      wrap.removeEventListener('dragover', onDragOver)
      wrap.removeEventListener('dragleave', onDragLeave)
      wrap.removeEventListener('drop', onDrop)
    }
    window.removeEventListener('keydown', onKeyDown)
    if (rafId) cancelAnimationFrame(rafId)
  })

  return { dragOver }
}
