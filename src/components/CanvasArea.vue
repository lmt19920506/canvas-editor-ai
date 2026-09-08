<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/editor'
import { useCanvasEditor } from '@/composables/useCanvasEditor'

const editorStore = useEditorStore()

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const { dragOver } = useCanvasEditor(canvasRef, wrapRef)
</script>

<template>
  <div ref="wrapRef" class="canvas-page">
    <div class="canvas-stage">
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        :width="DESIGN_WIDTH"
        :height="DESIGN_HEIGHT"
      />

      <!-- 拖拽素材悬停提示 -->
      <Transition name="fade">
        <div v-if="dragOver" class="drop-mask">
          <div class="drop-mask__inner">
            <span class="drop-mask__icon">＋</span>
            <p>松开鼠标，将素材添加到画布</p>
          </div>
        </div>
      </Transition>

      <!-- 空画布引导 -->
      <div v-if="editorStore.isEmpty" class="empty-hint">
        <div class="empty-hint__icon">🖼️</div>
        <p>
          将左侧 <b>图片素材</b> 拖拽到此处，生成图片到画布
        </p>
        <p>
          或在左侧「<b>文字</b>」菜单点击 <b>添加文字</b>，在画布中间生成文字
        </p>
      </div>
    </div>

    <div class="canvas-status">
      <span>设计尺寸 {{ DESIGN_WIDTH }} × {{ DESIGN_HEIGHT }}</span>
      <i class="dot" />
      <span>选中后拖动 8 个控制点可<em>等比缩放</em></span>
      <i class="dot" />
      <span>Delete 删除 · Esc 取消选中 · 方向键微调</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-width: 0;
}

.canvas-stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  border-radius: 10px;
  background-color: #e6e9ef;
  background-image: radial-gradient(circle, #cdd3dc 1px, transparent 1px);
  background-size: 18px 18px;
  overflow: hidden;
}

.editor-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 4px 20px rgba(31, 35, 41, 0.14);
  cursor: default;
  touch-action: none;
}

/* 空画布引导 */
.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  color: var(--text-3);
  line-height: 1.8;
  font-size: 13px;
  text-align: center;
  background: rgba(246, 247, 249, 0.55);
}

.empty-hint b {
  color: var(--primary);
}

.empty-hint__icon {
  font-size: 44px;
  margin-bottom: 10px;
  filter: grayscale(0.2);
  opacity: 0.85;
}

/* 拖放高亮遮罩 */
.drop-mask {
  position: absolute;
  inset: 12px;
  border: 2px dashed var(--primary);
  border-radius: 8px;
  background: rgba(51, 112, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;
}

.drop-mask__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--primary);
  font-size: 15px;
  font-weight: 600;
}

.drop-mask__icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 26px;
  line-height: 44px;
  text-align: center;
}

.canvas-status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 0 4px;
  color: var(--text-3);
  font-size: 12px;
}

.canvas-status em {
  font-style: normal;
  color: var(--primary);
  font-weight: 600;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #c9cdd4;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
