<!--
  CanvasArea.vue — 画布区域（编辑器主视口）

  【用处】
    中间栏的画布容器：承载「底图 + 所有元素 + 选中框」，并负责画布在可用空间内
    居中显示、尺寸超出可用空间时按比例缩小。

  【逻辑】
    1. 三层结构（DOM 顺序决定层级）：
       .canvas-box（尺寸 = 设计尺寸 × 显示缩放）
       ├─ canvas.editor-canvas   底层：白底 + 网格，同时是唯一的指针交互入口
       ├─ .element-layer         元素层：image / frame / text 三个组件按数组顺序渲染
       └─ .selection-layer       选中框层：SelectionOverlay（虚线框 + 8 控制点），不裁剪
    2. 显示缩放：ResizeObserver 监听 .canvas-stage 尺寸，scale = min(1, 可用宽/画布宽, 可用高/画布高)，
       即「只缩小不放大」，画布始终居中（父级 flex 居中）。
       元素层与选中框层都用 transform: scale(scale) 对齐底 canvas。
    3. 交互全部下沉到 composable（useCanvasEditor）：选中、拖拽移动、8 点等比缩放、
       frame 双击编辑、素材拖放、键盘操作；元素层与选中框层 pointer-events 均为 none，
       所以只有底层 canvas 接收事件，命中靠坐标换算。
    4. 拖放高亮遮罩目前注释掉，dragOver 状态仍由 composable 返回，需要时打开即可。

  【关系】
    - 状态：src/stores/editor.ts（elements / selected / canvasWidth / canvasHeight / editingFrameId）
    - 交互：src/composables/useCanvasEditor.ts
    - 子组件：components/elements/ElementImageView | ElementFrameView | ElementTextView | SelectionOverlay
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useCanvasEditor } from "@/composables/useCanvasEditor";
import ElementImageView from "@/components/elements/ElementImageView.vue";
import ElementFrameView from "@/components/elements/ElementFrameView.vue";
import ElementTextView from "@/components/elements/ElementTextView.vue";
import SelectionOverlay from "@/components/elements/SelectionOverlay.vue";

const editorStore = useEditorStore();

/** 画布最外层 DOM，素材拖放的 dragenter/dragover/drop 监听挂在这里 */
const wrapRef = ref<HTMLDivElement | null>(null);
/** 居中定位容器（flex 居中），其尺寸决定画布的显示缩放比例 */
const stageRef = ref<HTMLDivElement | null>(null);
/** 底层 canvas：白底 + 网格，同时是全部指针交互的入口 */
const bgCanvasRef = ref<HTMLCanvasElement | null>(null);

/**
 * 接入编辑器交互逻辑。
 * 逻辑：只需传入「拖放容器」与「底层 canvas」，composable 内部自行完成渲染、
 *      命中检测、拖拽/缩放、双击编辑、键盘快捷键等全部行为。
 */
const { dragOver } = useCanvasEditor(wrapRef, bgCanvasRef);

/* ================= 显示缩放 ================= */
// 画布始终位于 canvas-stage 中心；超出 stage 宽高时按比例缩小（scale ≤ 1，不放大）。
// 元素层与选中框层均以设计坐标布局，通过 transform: scale 与底 canvas 对齐。

/** 当前显示缩放比（1 = 原尺寸显示） */
const scale = ref(1);
/** 画布显示宽度（px）= 设计宽 × scale，作为 .canvas-box 的宽度 */
const displayW = computed(() =>
  Math.round(editorStore.canvasWidth * scale.value),
);
/** 画布显示高度（px）= 设计高 × scale */
const displayH = computed(() =>
  Math.round(editorStore.canvasHeight * scale.value),
);

/**
 * 元素层 / 选中框层共用的内层样式。
 * 逻辑：内层盒子按「设计尺寸」铺开，再用 transform: scale 缩放；
 *       transform-origin 由样式表设为 0 0，保证缩放后与底 canvas 像素对齐。
 *       两层共用同一个样式对象，避免缩放不一致导致选中框偏移。
 */
const innerStyle = computed<CSSProperties>(() => ({
  width: editorStore.canvasWidth + "px",
  height: editorStore.canvasHeight + "px",
  transform: `scale(${scale.value})`,
}));

let stageObserver: ResizeObserver | null = null;

/**
 * 根据 stage 可用空间重算显示缩放。
 * 逻辑：取 stage 的实际内容尺寸，scale = min(1, 宽比, 高比)；
 *       宽高任一为 0（容器未布局完成）时直接跳过，避免出现 scale=0 的闪烁。
 */
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

// 画布尺寸变化（如 PSD 导入后切换为 PSD 原始尺寸）时重新计算缩放
watch(() => [editorStore.canvasWidth, editorStore.canvasHeight], updateScale);

onMounted(() => {
  // 监听容器尺寸变化（窗口缩放 / 侧栏折叠等），实时更新缩放
  if (stageRef.value && typeof ResizeObserver !== "undefined") {
    stageObserver = new ResizeObserver(updateScale);
    stageObserver.observe(stageRef.value);
  }
  updateScale();
});

onBeforeUnmount(() => {
  // 组件卸载时断开监听，避免内存泄漏
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
          <div class="element-layer__inner" :style="innerStyle">
            <template v-for="el in editorStore.elements" :key="el.id">
              <ElementImageView v-if="el.type === 'image'" :el="el" />
              <ElementFrameView
                v-else-if="el.type === 'frame'"
                :el="el"
                :editing="editorStore.editingFrameId === el.id"
              />
              <ElementTextView v-else-if="el.type === 'text'" :el="el" />
            </template>
          </div>
        </div>

        <!-- 选中框层：独立组件渲染虚线框 + 8 个控制点，位于所有元素之上；
             不设 overflow:hidden，画布边缘元素的控制点才能完整可见 -->
        <div class="selection-layer">
          <div class="element-layer__inner" :style="innerStyle">
            <SelectionOverlay :el="editorStore.selected" />
          </div>
        </div>
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

/* 选中框层：与元素层同坐标系，但不裁剪（画布边缘的控制点需完整可见） */
.selection-layer {
  position: absolute;
  inset: 0;
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
