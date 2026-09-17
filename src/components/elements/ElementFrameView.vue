<!--
  ElementFrameView.vue — 可填充元素（frame）显示组件

  【用处】
    渲染 type === 'frame' 的元素：PSD 中非「素材」「背景图片」的图层解析而来。
    一个 frame = 「一张遮罩定义的形状」+「一张可替换的填充图」+「若干置顶修饰图」。

  【逻辑】
    1. 结构与徕珂印 frame 组件模板一一对应：
       div.frame-container            ← el.x / el.y / el.width / el.height / el.opacity
       ├─ img.frame-modify-img        ← imgList[]（修饰图，zIndex 恒为 2）
       └─ svg.svg-show                ← 真实 DOM 节点（非 v-html）
          ├─ defs > mask#mask-{id}    ← el.maskImageUrl（决定"哪里能被填充"）
          └─ image.frame-content-img  ← el.image + imgContent* 定位（决定"填什么、填在哪"）
    2. SVG 的每个参数（href / viewBox / x / y / width / height / mask）都是 props 响应式绑定，
       所以换填充图、滚轮缩放、拖动平移只需要改 store 数据，组件自动重渲染（不重建字符串）。
    3. 遮罩原理：mask 图是「RGB 全白 + 保留图层原 alpha」的 PNG，
       SVG <mask> 按亮度遮罩（白=显示）→ 等价于「原图层 alpha 区域可见」。
    4. 填充图按 cover 铺满遮罩：imgContent* 四个字段由 store 计算并钳制，
       缩放/拖动都在改这四个值，保证放大缩小后不会露出遮罩外的空白。
    5. 双击进入编辑模式（editing=true）：虚线高亮 + 顶部操作提示，
       滚轮缩放 / 拖动平移由底层 canvas 的指针逻辑驱动（见 useCanvasEditor.ts）。

  【关系】
    - 由 CanvasArea.vue 渲染，editing 由 editorStore.editingFrameId 判断。
    - 数据源：src/types/element.ts 的 FrameElement；几何计算见 src/utils/selection.ts、stores/editor.ts。
-->
<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import type { FrameElement } from '@/types/element'

/** frame 修饰图片项（对齐徕珂印 imgList，PSD 导入默认为空） */
export interface FrameImgItem {
  url: string
  width: number
  height: number
  left: number
  top: number
}

/**
 * 组件入参。
 * - el：待渲染的可填充元素（响应式）
 * - imgList：置顶修饰图列表，缺省为空
 * - editing：是否处于「双击进入」的编辑模式，仅影响视觉提示
 */
const props = defineProps<{
  el: FrameElement
  imgList?: FrameImgItem[]
  /** 编辑模式：双击进入，滚轮缩放 mask 内填充图 */
  editing?: boolean
}>()

/**
 * 外层容器的绝对定位样式。
 * 逻辑：与其它元素组件一致，用设计坐标 + opacity；overflow: hidden 由样式表负责，
 *       保证填充图超出 frame 的部分被裁掉（SVG 视口本身也会裁，这里是双保险）。
 */
const containerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: `${props.el.width}px`,
  height: `${props.el.height}px`,
  opacity: props.el.opacity,
}))

/**
 * 遮罩 id：mask-{元素 id}。
 * 逻辑：SVG 的 mask 引用是全局查找的，用元素唯一 id 派生可避免多个 frame 的 mask 互相覆盖
 *      （元素 id 由 store 保证唯一）。
 */
const maskId = computed(() => `mask-${props.el.id}`)
</script>

<template>
  <div class="frame-container" :class="{ 'is-editing': editing }" :style="containerStyle">
    <!-- 编辑模式提示 -->
    <div v-if="editing" class="edit-hint">滚轮缩放 · 拖动调整位置 · 双击 / Esc 退出</div>
    <img
      v-for="(item, index) in props.imgList ?? []"
      :key="index"
      class="frame-modify-img"
      :src="item.url"
      draggable="false"
      :style="{
        position: 'absolute',
        left: item.left + 'px',
        top: item.top + 'px',
        width: item.width + 'px',
        height: item.height + 'px',
        zIndex: 2,
      }"
    />
    <svg
      class="svg-show"
      xmlns="http://www.w3.org/2000/svg"
      :width="el.width"
      :height="el.height"
      :viewBox="`0 0 ${el.viewBoxWidth} ${el.viewBoxHeight}`"
      preserveAspectRatio="none"
    >
      <defs>
        <mask :id="maskId">
          <image
            class="frame-mask-img"
            :href="el.maskImageUrl"
            x="0"
            y="0"
            :width="el.viewBoxWidth"
            :height="el.viewBoxHeight"
            preserveAspectRatio="none"
          />
        </mask>
      </defs>
      <image
        class="frame-content-img"
        :x="el.imgContentLeft"
        :y="el.imgContentTop"
        :width="el.imgContentWidth"
        :height="el.imgContentHeight"
        :href="el.image"
        preserveAspectRatio="none"
        :mask="`url(#${maskId})`"
      />
    </svg>
  </div>
</template>

<style scoped>
.frame-container {
  overflow: hidden;
}

/* 编辑模式：虚线高亮 + 顶部提示 */
.frame-container.is-editing {
  outline: 2px dashed var(--primary);
  outline-offset: 2px;
}

.edit-hint {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3;
  padding: 2px 8px;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 0 0 6px 0;
  white-space: nowrap;
}

.svg-show {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

.frame-modify-img {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
