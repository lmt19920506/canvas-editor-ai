<script setup lang="ts">
import { computed, type CSSProperties, onMounted } from "vue";
import type { FrameElement } from "@/types/element";

/** frame 修饰图片项（对齐徕珂印 imgList，PSD 导入默认为空） */
export interface FrameImgItem {
  url: string;
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * 可填充元素（frame）显示组件，结构对齐徕珂印 frame-container 模板：
 * div.frame-container
 * ├─ img.frame-modify-img（imgList 修饰图片，永远在上层）
 * └─ div.svg-show > svg（defs/mask + 带遮罩的填充图，由 el.svg 提供）
 * 填充图替换后 el.svg 由 store 重建，组件无需感知。
 */
const props = defineProps<{
  el: FrameElement;
  imgList?: FrameImgItem[];
}>();

const containerStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  left: `${props.el.x}px`,
  top: `${props.el.y}px`,
  width: `${props.el.width}px`,
  height: `${props.el.height}px`,
  opacity: props.el.opacity,
}));
console.log("ppp====", props.el);
</script>

<template>
  <div class="frame-container" :style="containerStyle">
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
    <!-- svg 内含 <defs><mask id="mask-{id}"> + 带遮罩的填充图 -->
    <div class="svg-show" v-html="props.el.svg" />
  </div>
</template>

<style scoped>
.frame-container {
  overflow: hidden;
}

.svg-show {
  position: absolute;
  left: 0;
  top: 0;
}

.svg-show :deep(svg) {
  display: block;
}

.frame-modify-img {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
