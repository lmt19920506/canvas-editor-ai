<!--
  ConfigPanel.vue — 右侧「属性配置」面板

  【用处】
    选中画布元素后，在这里修改它的属性：
    - 图片 / 填充元素（frame）：名称、尺寸（等比联动）、位置、不透明度、层级、复制删除
    - 文字：内容、字号、字重、字体、颜色，外加公共的位置 / 不透明度 / 层级操作

  【逻辑】
    1. 全部为「受控输入」：值的显示来自 store（computed），修改统一走 store 的 action
       （patchElement / moveElement / bringForward / sendBackward / duplicateElement / removeElement），
       组件自身不保存任何副本状态，保证画布与面板永远一致。
    2. 类型收窄：模板用 v-if="img" / v-else-if="txt" 区分两套表单；
       img 同时涵盖 image 与 frame（frame 复用图片的属性面板，只是徽标文案不同）。
    3. 尺寸联动：改宽按 aspectRatio 算高、改高算宽，始终保持等比（与画布上的等比缩放一致）。
    4. 位置输入复用 moveElement，越界钳制逻辑只在 store 里维护一份。

  【关系】
    - 状态与操作：src/stores/editor.ts
    - 元素显示：components/elements/*（改完属性画布即时更新）
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { DEFAULT_FONT_FAMILY } from '@/stores/editor'
import type { ElementPatch } from '@/types/element'
import type { FrameElement, ImageElement, TextElement } from '@/types/element'

const store = useEditorStore()

/** 当前选中元素（store getter；未选中或已删除时为 null） */
const sel = computed(() => store.selected)

/** 收窄后的图片/填充(frame)/文字元素，模板里用 v-if="img"/"txt" 做类型收窄 */
const img = computed<ImageElement | FrameElement | null>(() =>
  sel.value?.type === 'image' || sel.value?.type === 'frame' ? sel.value : null,
)
const txt = computed<TextElement | null>(() =>
  sel.value?.type === 'text' ? sel.value : null,
)

/** 可选字体列表（value 为带 fallback 的 font-family 串，直接写回元素字段） */
const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '默认（无衬线）', value: DEFAULT_FONT_FAMILY },
  { label: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
  { label: '苹方 / 雅黑', value: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { label: '黑体', value: '"SimHei", "黑体", sans-serif' },
  { label: '宋体', value: '"SimSun", "宋体", serif' },
  { label: '楷体', value: '"KaiTi", "楷体", serif' },
  { label: 'Georgia 衬线', value: 'Georgia, "Times New Roman", serif' },
]

/** 常用颜色快捷色板（点击即写入文字颜色） */
const COLOR_SWATCHES = ['#1f2329', '#f53f3f', '#ff9f0a', '#00b42a', '#3370ff', '#722ed1', '#ffffff']

/**
 * 选中元素在 elements 数组中的下标。
 * 逻辑：数组顺序即层级（越靠后越上层），所以用下标就能判断能否上移/下移；
 *       未选中时为 -1。
 */
const selectedIndex = computed(() =>
  sel.value ? store.elements.findIndex((e) => e.id === sel.value!.id) : -1,
)
/** 能否上移一层：不是最顶层才有意义 */
const hasPrev = computed(() => selectedIndex.value > 0)
/** 能否下移一层：不是最底层（且确实有选中）才有意义 */
const hasNext = computed(() => selectedIndex.value > -1 && selectedIndex.value < store.elements.length - 1)

/**
 * 统一的部分属性更新入口。
 * 逻辑：所有表单控件都通过它调用 store.patchElement，避免在模板里散落 store 调用；
 *       sel 为空时静默忽略（选中被清空后输入框的残留事件）。
 */
function patch(p: ElementPatch) {
  if (sel.value) store.patchElement(sel.value.id, p)
}

/** 设置位置：复用 moveElement 保证不越界（钳制逻辑只在 store 里维护一份） */
function setPos(key: 'x' | 'y', raw: string) {
  const el = sel.value
  if (!el) return
  const v = Number(raw)
  if (!Number.isFinite(v)) return
  const x = key === 'x' ? v : el.x
  const y = key === 'y' ? v : el.y
  store.moveElement(el.id, x, y)
}

/** 图片 / 填充元素尺寸：宽或高任一变化都按 aspectRatio 联动另一边，维持等比；最小 16px */
function setImageSize(key: 'width' | 'height', raw: string) {
  const el = img.value
  if (!el) return
  const v = Number(raw)
  if (!Number.isFinite(v) || v < 16) return
  const nv = Math.max(16, Math.round(v))
  if (key === 'width') {
    const h = Math.round(nv / el.aspectRatio)
    store.patchElement(el.id, { width: nv, height: Math.max(16, h) })
  } else {
    const w = Math.round(nv * el.aspectRatio)
    store.patchElement(el.id, { height: nv, width: Math.max(16, w) })
  }
}

/** 不透明度滑杆：UI 用 0~100 整数百分比，store 存 0~1 小数，这里做换算 */
function setOpacity(raw: string) {
  patch({ opacity: Number(raw) / 100 })
}
</script>

<template>
  <div class="config-panel">
    <div class="panel-head">
      <span>属性配置</span>
      <span v-if="img || txt" class="type-badge" :class="img ? 'img' : 'txt'">
        {{ img ? (img.type === 'frame' ? '填充元素' : '图片') : '文字' }}
      </span>
    </div>

    <!-- 未选中 -->
    <div v-if="!sel" class="empty">
      <div class="empty__icon">☰</div>
      <p>选中画布中的<b>图片或文字</b></p>
      <p>在这里配置属性</p>
    </div>

    <div v-else class="panel-body">
      <!-- ============ 图片 ============ -->
      <template v-if="img">
        <div class="preview-block">
          <div class="preview-block__thumb">
            <img :src="img.src" :alt="img.name" />
          </div>
          <div class="preview-block__meta">
            <input class="ctrl" :value="img.name" @input="patch({ name: ($event.target as HTMLInputElement).value })" />
            <span class="preview-block__note">宽高联动 · 保持等比</span>
          </div>
        </div>

        <p class="sec-title">尺寸</p>
        <div class="row2">
          <div class="field">
            <label class="field__label">宽 (px)</label>
            <input
              class="ctrl"
              type="number"
              min="16"
              :value="Math.round(img.width)"
              @change="setImageSize('width', ($event.target as HTMLInputElement).value)"
            />
          </div>
          <div class="field">
            <label class="field__label">高 (px)</label>
            <input
              class="ctrl"
              type="number"
              min="16"
              :value="Math.round(img.height)"
              @change="setImageSize('height', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </template>

      <!-- ============ 文字 ============ -->
      <template v-else-if="txt">
        <div class="field">
          <label class="field__label">文字内容</label>
          <textarea
            class="ctrl"
            rows="3"
            :value="txt.content"
            placeholder="输入文字内容，支持回车换行"
            @input="patch({ content: ($event.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>

        <div class="row2">
          <div class="field">
            <label class="field__label">字号</label>
            <input
              class="ctrl"
              type="number"
              min="8"
              max="600"
              :value="txt.fontSize"
              @input="patch({ fontSize: Number(($event.target as HTMLInputElement).value) || 12 })"
            />
          </div>
          <div class="field">
            <label class="field__label">字重</label>
            <div class="seg">
              <button type="button" class="seg__item" :class="{ on: txt.fontWeight === 400 }" @click="patch({ fontWeight: 400 })">常规</button>
              <button type="button" class="seg__item" :class="{ on: txt.fontWeight === 700 }" @click="patch({ fontWeight: 700 })">加粗</button>
            </div>
          </div>
        </div>

        <div class="field">
          <label class="field__label">字体</label>
          <select class="ctrl" :value="txt.fontFamily" @change="patch({ fontFamily: ($event.target as HTMLSelectElement).value })">
            <option v-for="o in FONT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>

        <div class="field">
          <label class="field__label">颜色</label>
          <div class="color-row">
            <input type="color" class="ctrl color-picker" :value="txt.color" @input="patch({ color: ($event.target as HTMLInputElement).value })" />
            <input class="ctrl" type="text" :value="txt.color" @change="patch({ color: ($event.target as HTMLInputElement).value })" />
          </div>
          <div class="swatches">
            <button
              v-for="c in COLOR_SWATCHES"
              :key="c"
              type="button"
              class="swatch"
              :style="{ background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #e5e6eb' : '' }"
              @click="patch({ color: c })"
            ></button>
          </div>
        </div>
      </template>

      <!-- ============ 公共 ============ -->
      <p class="sec-title">位置</p>
      <div class="row2">
        <div class="field">
          <label class="field__label">X</label>
          <input class="ctrl" type="number" :value="Math.round(sel.x)" @change="setPos('x', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="field">
          <label class="field__label">Y</label>
          <input class="ctrl" type="number" :value="Math.round(sel.y)" @change="setPos('y', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>

      <div class="field">
        <label class="field__label">
          不透明度
          <span>{{ Math.round(sel.opacity * 100) }}%</span>
        </label>
        <input
          class="range"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="Math.round(sel.opacity * 100)"
          @input="setOpacity(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="size-info">元素尺寸：{{ Math.round(sel.width) }} × {{ Math.round(sel.height) }} px</div>

      <p class="sec-title">层级</p>
      <div class="row2">
        <button class="btn sm" :disabled="!hasNext" @click="store.bringForward(sel.id)">⬆ 上移一层</button>
        <button class="btn sm" :disabled="!hasPrev" @click="store.sendBackward(sel.id)">⬇ 下移一层</button>
      </div>

      <div class="action-row">
        <button class="btn sm" @click="store.duplicateElement(sel.id)">⧉ 复制</button>
        <button class="btn sm danger" @click="store.removeElement(sel.id)">✕ 删除</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
}

.panel-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}

.type-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
}

.type-badge.img {
  background: #e8f3ff;
  color: #165dff;
}

.type-badge.txt {
  background: #f3f0ff;
  color: #722ed1;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-3);
  text-align: center;
  line-height: 1.8;
}

.empty b {
  color: var(--primary);
}

.empty__icon {
  width: 52px;
  height: 52px;
  margin-bottom: 8px;
  border-radius: 50%;
  background: #f2f3f5;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c9cdd4;
}

.sec-title {
  margin: 6px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

/* 图片预览 */
.preview-block {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.preview-block__thumb {
  width: 76px;
  height: 57px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #f7f8fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-block__thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-block__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-block__note {
  font-size: 11px;
  color: var(--text-3);
}

/* 两列 */
.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.row2 .field {
  margin-bottom: 12px;
}

/* 分段按钮 */
.seg {
  display: flex;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.seg__item {
  flex: 1;
  font-size: 12px;
  background: #fff;
  color: var(--text-2);
}

.seg__item + .seg__item {
  border-left: 1px solid var(--border);
}

.seg__item.on {
  background: var(--primary-weak);
  color: var(--primary);
  font-weight: 600;
}

/* 颜色 */
.color-row {
  display: flex;
  gap: 8px;
}

.color-picker {
  width: 44px;
  flex: none;
}

.swatches {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  transition: transform 0.12s;
}

.swatch:hover {
  transform: scale(1.15);
}

/* 滑杆 */
.range {
  width: 100%;
  accent-color: var(--primary);
  cursor: pointer;
}

.size-info {
  font-size: 12px;
  color: var(--text-3);
  background: #f7f8fa;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 6px;
}

.action-row {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.action-row .btn {
  flex: 1;
}
</style>
