<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useCanvasEditor } from "@/composables/useCanvasEditor";
import ElementImageView from "@/components/elements/ElementImageView.vue";
import ElementFrameView from "@/components/elements/ElementFrameView.vue";
import ElementTextView from "@/components/elements/ElementTextView.vue";

const editorStore = useEditorStore();

const wrapRef = ref<HTMLDivElement | null>(null);
const stageRef = ref<HTMLDivElement | null>(null);
const bgCanvasRef = ref<HTMLCanvasElement | null>(null);
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null);

const { dragOver } = useCanvasEditor(wrapRef, bgCanvasRef, overlayCanvasRef);

/* ================= 显示缩放 ================= */
// 画布始终位于 canvas-stage 中心；超出 stage 宽高时按比例缩小（scale ≤ 1，不放大）。
// 元素组件层与顶 canvas 均以设计坐标布局，通过 transform: scale 与底 canvas 对齐。
const scale = ref(1);
const displayW = computed(() =>
  Math.round(editorStore.canvasWidth * scale.value),
);
const displayH = computed(() =>
  Math.round(editorStore.canvasHeight * scale.value),
);

let stageObserver: ResizeObserver | null = null;

function updateScale() {
  const stage = stageRef.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  scale.value = Math.min(
    1,
    rect.width / editorStore.canvasWidth,
    rect.height / editorStore.canvasHeight,
  );
}

watch(() => [editorStore.canvasWidth, editorStore.canvasHeight], updateScale);

onMounted(() => {
  if (stageRef.value && typeof ResizeObserver !== "undefined") {
    stageObserver = new ResizeObserver(updateScale);
    stageObserver.observe(stageRef.value);
  }
  updateScale();
});

onBeforeUnmount(() => {
  stageObserver?.disconnect();
  stageObserver = null;
});
</script>

<template>
  <div ref="wrapRef" class="canvas-page">
    <div ref="stageRef" class="canvas-stage">
      <!-- 画布容器：尺寸 = 设计尺寸 × 显示缩放 -->
      <div
        class="canvas-box"
        :style="{ width: displayW + 'px', height: displayH + 'px' }"
      >
        <!-- 底层 canvas：白底 + 网格，同时承载指针交互（选中/拖拽/缩放） -->
        <canvas
          ref="bgCanvasRef"
          class="editor-canvas"
          :width="editorStore.canvasWidth"
          :height="editorStore.canvasHeight"
        />

        <!-- 元素层：image / frame / text 由 Vue 组件渲染（DOM 顺序即 z-index），
             pointer-events 关闭，交互统一由底层 canvas 处理 -->
        <div class="element-layer">
          <div
            class="element-layer__inner"
            :style="{
              width: editorStore.canvasWidth + 'px',
              height: editorStore.canvasHeight + 'px',
              transform: `scale(${scale})`,
            }"
          >
            <template v-for="el in editorStore.elements" :key="el.id">
              <ElementImageView v-if="el.type === 'image'" :el="el" />
              <ElementFrameView v-else-if="el.type === 'frame'" :el="el" />
              <ElementTextView v-else-if="el.type === 'text'" :el="el" />
            </template>
          </div>
        </div>

        <!-- 顶层 canvas：仅绘制选中虚线框与 8 个控制点 -->
        <canvas
          ref="overlayCanvasRef"
          class="overlay-canvas"
          :width="editorStore.canvasWidth"
          :height="editorStore.canvasHeight"
        />
      </div>

      <!-- 拖拽素材悬停提示 -->
      <!-- <Transition name="fade">
        <div v-if="dragOver" class="drop-mask">
          <div class="drop-mask__inner">
            <span class="drop-mask__icon">＋</span>
            <p>松开鼠标，将素材添加到画布</p>
          </div>
        </div>
      </Transition> -->

      <!-- 空画布引导 -->
      <div v-if="editorStore.isEmpty" class="empty-hint">
        <div class="empty-hint__icon">🖼️</div>
        <p>将左侧 <b>图片素材</b> 拖拽到此处，生成图片到画布</p>
        <p>
          或在左侧「<b>文字</b>」菜单点击 <b>添加文字</b>，在画布中间生成文字
        </p>
      </div>
    </div>

    <div class="canvas-status">
      <span
        >设计尺寸 {{ editorStore.canvasWidth }} ×
        {{ editorStore.canvasHeight }}</span
      >
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

/* 画布容器：底 canvas / 元素层 / 顶 canvas 三层对齐 */
.canvas-box {
  position: relative;
  flex: none;
}

.editor-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(31, 35, 41, 0.14);
  cursor: default;
  touch-action: none;
}

/* 元素层：绝对定位在设计坐标系，pointer-events 关闭保证 canvas 正常接收交互 */
.element-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: 4px;
}

.element-layer__inner {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}

.overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  border-radius: 4px;
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
