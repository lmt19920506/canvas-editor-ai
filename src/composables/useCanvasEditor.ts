import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { MIN_ELEMENT_SIZE, clamp, type ResizeHandle } from '@/config/editor'
import type { EditorElement } from '@/types/element'
import { isFrameElement, isTextElement } from '@/types/element'
import { fileToDataURL, getImageSize } from '@/utils/image'
import {
  HANDLE_CURSOR,
  handleHitRadius,
  handlePoints,
  handleSizeInDesign,
} from '@/utils/selection'
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

/** frame 编辑模式：拖动平移填充图（mask 内内容图） */
interface PanFrameDrag {
  kind: 'pan-frame'
  id: string
  startX: number
  startY: number
  oLeft: number
  oTop: number
}

type DragState = MoveDrag | ResizeDrag | PanFrameDrag

/**
 * 画布编辑器核心 hook
 * 职责：底图网格渲染 / 点击选中 / 拖拽移动 / 8 控制点等比缩放 /
 *       素材拖放接收 / 键盘操作。
 * 元素（image / frame / text）与选中框（SelectionOverlay）均由 Vue 组件渲染，
 * 本 hook 只负责底层画布（白底 + 网格）与全部指针交互。
 */
export function useCanvasEditor(
  wrapRef: Ref<HTMLElement | null>,
  bgCanvasRef: Ref<HTMLCanvasElement | null>,
) {
  const editorStore = useEditorStore()
  const assetsStore = useAssetsStore()

  /** 是否正拖拽素材悬停在画布区域（控制高亮遮罩） */
  const dragOver = ref(false)

  let drag: DragState | null = null
  let rafId = 0
  let lastCursor = ''
  let dragDepth = 0

  /* ================= 渲染 ================= */

  function invalidate() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      render()
    })
  }

  function render() {
    const bg = bgCanvasRef.value
    const bgCtx = bg?.getContext('2d') ?? null
    if (!bg || !bgCtx) return

    const cw = editorStore.canvasWidth
    const ch = editorStore.canvasHeight

    // 底层画布：白底 + 网格（示意透明底）
    // 元素与选中框分别由 ElementXxxView / SelectionOverlay 组件渲染在其上层
    bgCtx.clearRect(0, 0, cw, ch)
    bgCtx.fillStyle = '#ffffff'
    bgCtx.fillRect(0, 0, cw, ch)
    bgCtx.strokeStyle = '#f0f1f3'
    bgCtx.lineWidth = 1
    bgCtx.beginPath()
    for (let x = 0.5; x <= cw; x += 20) {
      bgCtx.moveTo(x, 0)
      bgCtx.lineTo(x, ch)
    }
    for (let y = 0.5; y <= ch; y += 20) {
      bgCtx.moveTo(0, y)
      bgCtx.lineTo(cw, y)
    }
    bgCtx.stroke()
  }

  /* ================= 坐标与命中 ================= */

  function toDesignPoint(e: { clientX: number; clientY: number }) {
    const canvas = bgCanvasRef.value
    if (!canvas) return { x: 0, y: 0 }
    const cw = editorStore.canvasWidth
    const ch = editorStore.canvasHeight
    const rect = canvas.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * cw, 0, cw)
    const y = clamp(((e.clientY - rect.top) / rect.height) * ch, 0, ch)
    return { x, y }
  }

  /**
   * 画布当前显示缩放比（屏幕像素 / 设计坐标像素）。
   * 逻辑：底 canvas 的 DOM 宽度 ÷ 设计宽度，与 toDesignPoint 的换算同源，因此天然一致。
   * 用途：把「屏幕恒定尺寸」换算回设计坐标 —— 控制点 18px、命中半径、线宽等都需要它。
   *       容器尚未布局完成（宽度为 0）时回退为 1，避免出现 NaN / 除零。
   */
  function displayScale(): number {
    const canvas = bgCanvasRef.value
    if (!canvas) return 1
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !editorStore.canvasWidth) return 1
    return rect.width / editorStore.canvasWidth
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

  /**
   * 落点处的 frame 元素（穿透式命中）：
   * 自顶向下查找第一个包含落点的 frame 类型元素。
   * 与 elementAt 不同，上方重叠的 image（乃至 text）元素不会挡住它——
   * 用于素材拖放：图片素材落在 frame 上时，即使 frame 被普通图片盖住，
   * 也会穿透图片直接填充到 frame 的 SVG content image 里。
   */
  function frameAt(p: { x: number; y: number }): Extract<EditorElement, { type: 'frame' }> | null {
    for (let i = editorStore.elements.length - 1; i >= 0; i--) {
      const el = editorStore.elements[i]
      if (!isFrameElement(el)) continue
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

  /**
   * 落点命中的控制点（8 个中的一个）。
   * 逻辑：控制点在屏幕上恒定 18px，所以命中半径必须按当前显示缩放换算回设计坐标：
   *       size = 18 / displayScale，pad = size × 1.25（与 SelectionOverlay 用同一换算）。
   *       控制点中心取自 handlePoints（= 选中框角/边中点），渲染与命中同源，
   *       因此画布缩小时「看到的控制点」和「能点到的区域」始终重合，手感不随缩放变化。
   */
  function handleAt(el: EditorElement, p: { x: number; y: number }): ResizeHandle | null {
    const size = handleSizeInDesign(displayScale()) // 控制点的设计坐标边长
    const pad = handleHitRadius(size) // 命中半径略大于控制点视觉尺寸
    let best: ResizeHandle | null = null
    let bestDist = Infinity
    for (const hp of handlePoints(el, size)) {
      const d = Math.hypot(p.x - hp.x, p.y - hp.y)
      if (d <= pad && d < bestDist) {
        bestDist = d
        best = hp.key
      }
    }
    return best
  }

  function applyCursor(cur: string) {
    const canvas = bgCanvasRef.value
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
    const maxF = Math.min(editorStore.canvasWidth / ow, editorStore.canvasHeight / oh)
    f = clamp(f, minF, maxF)

    const width = ow * f
    const height = oh * f
    let x = ox
    let y = oy
    if (west) x = ox + ow - width
    if (north) y = oy + oh - height
    x = clamp(x, 0, editorStore.canvasWidth - width)
    y = clamp(y, 0, editorStore.canvasHeight - height)
    return { x, y, width, height, scale: f }
  }

  /* ================= 指针交互 ================= */

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    const canvas = bgCanvasRef.value
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
      // 点击其他元素时退出 frame 编辑模式（编辑中的 frame 自身可继续交互）
      if (editorStore.editingFrameId && editorStore.editingFrameId !== el.id) {
        editorStore.stopEditFrame()
      }
      if (editorStore.selectedId !== el.id) editorStore.select(el.id)

      // 编辑模式：拖动 = 平移 mask 内的填充图（不是移动元素）
      if (isFrameElement(el) && editorStore.editingFrameId === el.id) {
        drag = {
          kind: 'pan-frame',
          id: el.id,
          startX: p.x,
          startY: p.y,
          oLeft: el.imgContentLeft,
          oTop: el.imgContentTop,
        }
        canvas.setPointerCapture(e.pointerId)
        applyCursor('move')
        return
      }

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

    // 点击空白：取消选中，并退出 frame 编辑模式
    editorStore.select(null)
    editorStore.stopEditFrame()
  }

  function onPointerMove(e: PointerEvent) {
    const canvas = bgCanvasRef.value
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

    if (drag.kind === 'pan-frame') {
      // 编辑模式：平移填充图（钳制由 store 内处理，保证不露底）
      editorStore.moveFrameImage(
        drag.id,
        drag.oLeft + (p.x - drag.startX),
        drag.oTop + (p.y - drag.startY),
      )
      applyCursor('move')
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
    const canvas = bgCanvasRef.value
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId)
    }
  }

  /* ================= 素材拖放 ================= */

  /** 双击：frame 元素进入/退出编辑模式（编辑模式下滚轮缩放填充图） */
  function onDblClick(e: MouseEvent) {
    const p = toDesignPoint(e)
    const el = elementAt(p)
    if (el && isFrameElement(el)) {
      if (editorStore.editingFrameId === el.id) {
        editorStore.stopEditFrame()
      } else {
        editorStore.startEditFrame(el.id)
      }
    } else {
      editorStore.stopEditFrame()
    }
  }

  /** 编辑模式下滚轮缩放 frame 填充图（上滚放大 / 下滚缩小） */
  function onWheel(e: WheelEvent) {
    if (!editorStore.editingFrameId) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    editorStore.scaleFrameImage(editorStore.editingFrameId, factor)
  }

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

    // 1) 内部素材（asset-item 拖拽）
    const assetId = e.dataTransfer?.getData(DRAG_MIME) ?? ''
    if (assetId) {
      const asset = assetsStore.byId(assetId)
      if (asset) {
        // 落点命中 frame 元素（穿透上方重叠的 image）→ 替换该元素的填充图
        const target = frameAt(p)
        if (target) {
          void getImageSize(asset.src)
            .then((size) => editorStore.replaceFrameImage(target.id, asset.src, size))
            .catch(() => editorStore.replaceFrameImage(target.id, asset.src))
          return
        }
        void addImageFromAsset(asset, p)
        return
      }
    }
    // 2) 外部图片文件直接拖入
    const files = Array.from(e.dataTransfer?.files ?? [])
    const file = files.find((f) => f.type.startsWith('image/'))
    if (file) {
      void fileToDataURL(file).then(async (src) => {
        // 落点命中 frame 元素（穿透上方重叠的 image）→ 替换该元素的填充图
        const target = frameAt(p)
        if (target) {
          const size = await getImageSize(src).catch(() => undefined)
          editorStore.replaceFrameImage(target.id, src, size)
          return
        }
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
      editorStore.stopEditFrame()
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
    const canvas = bgCanvasRef.value
    const wrap = wrapRef.value
    if (!canvas || !wrap) return

    // 首次渲染
    invalidate()

    // 画布尺寸变化（PSD 导入）后重绘底图网格
    // 元素与选中框是 Vue 组件渲染，数据变化由响应式自动驱动，无需手动重绘
    watch(
      () => [editorStore.canvasWidth, editorStore.canvasHeight],
      () => invalidate(),
    )

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    wrap.addEventListener('dragenter', onDragEnter)
    wrap.addEventListener('dragover', onDragOver)
    wrap.addEventListener('dragleave', onDragLeave)
    wrap.addEventListener('drop', onDrop)

    window.addEventListener('keydown', onKeyDown)
  })

  onBeforeUnmount(() => {
    const canvas = bgCanvasRef.value
    const wrap = wrapRef.value
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('wheel', onWheel)
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
