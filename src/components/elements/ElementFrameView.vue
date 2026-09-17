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
 * 可填充元素（frame）显示组件，结构对齐徕珂印 frame-container 模板：
 * div.frame-container
 * ├─ img.frame-modify-img（imgList 修饰图片，永远在上层）
 * └─ svg.svg-show（defs/mask 遮罩 + 带遮罩的填充图，参数全部来自 props）
 * 填充图替换即更新 el.image 与 imgContent* 定位字段，模板自动响应。
 */
const props = defineProps<{
  el: FrameElement
  imgList?: FrameImgItem[]
  /** 编辑模式：双击进入，滚轮缩放 mask 内填充图 */
  editing?: boolean
}>()

const containerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: `${props.el.width}px`,
  height: `${props.el.height}px`,
  opacity: props.el.opacity,
}))

/** 遮罩 id：元素内唯一（id 全局唯一，SVG mask 引用全局查找） */
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
