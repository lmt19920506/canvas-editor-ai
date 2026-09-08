<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAssetsStore, type AssetItem } from '@/stores/assets'
import { useEditorStore } from '@/stores/editor'
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/editor'
import { fileToDataURL, getImageSize } from '@/utils/image'

const DRAG_MIME = 'application/x-canvas-editor-asset'

type MenuKey = 'image' | 'text'

const assetsStore = useAssetsStore()
const editorStore = useEditorStore()

const active = ref<MenuKey>('image')
const fileRef = ref<HTMLInputElement | null>(null)

/* ---------- 图片 ---------- */

function triggerUpload() {
  fileRef.value?.click()
}

async function handleFiles(files: FileList | File[]) {
  const list = Array.from(files)
  for (const file of list) {
    if (!file.type.startsWith('image/')) continue
    const src = await fileToDataURL(file)
    try {
      const size = await getImageSize(src)
      assetsStore.addAsset(file.name, src, size.width, size.height)
    } catch {
      assetsStore.addAsset(file.name, src)
    }
  }
  if (fileRef.value) fileRef.value.value = ''
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void handleFiles(input.files)
}

function onZoneDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files?.length) void handleFiles(files)
}

function onAssetDragStart(e: DragEvent, item: AssetItem) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(DRAG_MIME, item.id)
  e.dataTransfer.effectAllowed = 'copy'
}

/** 点击素材 → 添加到画布正中间（拖拽之外的另一快捷方式） */
async function addAssetToCenter(item: AssetItem) {
  let { width, height } = item
  if (!width || !height) {
    try {
      const size = await getImageSize(item.src)
      width = size.width
      height = size.height
    } catch {
      /* ignore */
    }
  }
  editorStore.addImage(
    { name: item.name, src: item.src, width, height },
    DESIGN_WIDTH / 2,
    DESIGN_HEIGHT / 2,
  )
}

/* ---------- 文字 ---------- */

interface TextPreset {
  label: string
  content: string
  fontSize: number
  fontWeight: number
  color: string
}

const TEXT_PRESETS: TextPreset[] = [
  { label: '大标题', content: '主标题文字', fontSize: 56, fontWeight: 700, color: '#1f2329' },
  { label: '副标题', content: '这里是副标题文字', fontSize: 36, fontWeight: 700, color: '#4e5969' },
  { label: '正文', content: '这里是正文内容，支持多行输入。', fontSize: 24, fontWeight: 400, color: '#1f2329' },
  { label: '强调', content: 'NEW · 限时优惠', fontSize: 30, fontWeight: 700, color: '#f53f3f' },
]

function addDefaultText() {
  editorStore.addText()
}

function addPreset(p: TextPreset) {
  editorStore.addText({
    content: p.content,
    fontSize: p.fontSize,
    fontWeight: p.fontWeight,
    color: p.color,
    name: `${p.label}文字`,
  })
}

const textCount = computed(() => editorStore.elements.filter((e) => e.type === 'text').length)
</script>

<template>
  <div class="asset-panel">
    <!-- 两个菜单 -->
    <div class="menu-tabs">
      <button
        class="menu-tab"
        :class="{ on: active === 'image' }"
        @click="active = 'image'"
      >
        图片
      </button>
      <button
        class="menu-tab"
        :class="{ on: active === 'text' }"
        @click="active = 'text'"
      >
        文字
      </button>
    </div>

    <!-- 图片菜单 -->
    <div v-show="active === 'image'" class="panel-body">
      <input
        ref="fileRef"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="onFileChange"
      />
      <button
        class="upload-zone"
        type="button"
        @click="triggerUpload"
        @dragover.prevent
        @drop.prevent="onZoneDrop"
      >
        <span class="upload-zone__icon">▲</span>
        <span class="upload-zone__title">图片上传</span>
        <span class="upload-zone__tip">点击选择文件，或将图片直接拖到此处</span>
      </button>

      <p class="sec-title">图片素材</p>
      <p class="sec-tip">拖拽到右侧画布，即可生成图片</p>

      <ul class="asset-grid">
        <li
          v-for="item in assetsStore.items"
          :key="item.id"
          class="asset-item"
          draggable="true"
          :title="`${item.name}\n拖拽到画布添加`"
          @dragstart="onAssetDragStart($event, item)"
          @click="addAssetToCenter(item)"
        >
          <div class="asset-thumb">
            <img :src="item.src" :alt="item.name" />
          </div>
          <span class="asset-name">{{ item.name }}</span>
        </li>
      </ul>
    </div>

    <!-- 文字菜单 -->
    <div v-show="active === 'text'" class="panel-body">
      <button class="add-text-btn" type="button" @click="addDefaultText">
        <span class="add-text-btn__plus">＋</span>
        添加文字
      </button>
      <p class="sec-tip">文字将在画布中间生成，可在右侧修改内容与样式</p>

      <p class="sec-title">文字预设</p>
      <ul class="preset-list">
        <li
          v-for="p in TEXT_PRESETS"
          :key="p.label"
          class="preset-item"
          @click="addPreset(p)"
        >
          <span
            class="preset-preview"
            :style="{
              fontSize: p.fontSize + 'px',
              fontWeight: p.fontWeight,
              color: p.color,
              lineHeight: '1.35',
            }"
          >
            {{ p.content }}
          </span>
          <span class="preset-label">{{ p.label }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.asset-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 两个菜单 */
.menu-tabs {
  flex: none;
  display: flex;
  padding: 10px;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}

.menu-tab {
  flex: 1;
  height: 32px;
  border-radius: var(--radius);
  font-size: 14px;
  color: var(--text-2);
  transition: all 0.15s;
}

.menu-tab:hover {
  color: var(--primary);
  background: #f4f6f9;
}

.menu-tab.on {
  background: var(--primary-weak);
  color: var(--primary);
  font-weight: 600;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* 上传区 */
.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 16px 8px 14px;
  border: 1.5px dashed #b9c1cc;
  border-radius: 8px;
  background: #fafbfc;
  color: var(--text-2);
  transition: all 0.15s;
}

.upload-zone:hover {
  border-color: var(--primary);
  background: var(--primary-weak);
  color: var(--primary);
}

.upload-zone__icon {
  font-size: 18px;
  color: var(--primary);
}

.upload-zone__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
}

.upload-zone__tip {
  font-size: 11px;
  color: var(--text-3);
}

/* 区块标题 */
.sec-title {
  margin: 14px 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.sec-tip {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 8px;
}

/* 图片素材网格 */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.asset-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  background: #fff;
  transition: all 0.15s;
  user-select: none;
}

.asset-item:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(51, 112, 255, 0.16);
  transform: translateY(-1px);
}

.asset-item:active {
  cursor: grabbing;
}

.asset-thumb {
  aspect-ratio: 4 / 3;
  background: linear-gradient(135deg, #f2f3f5, #e8eaee);
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none; /* 避免 img 原生拖拽干扰 */
  display: block;
}

.asset-name {
  display: block;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 添加文字 */
.add-text-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 38px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s;
}

.add-text-btn:hover {
  background: var(--primary-strong);
}

.add-text-btn__plus {
  font-size: 18px;
  line-height: 1;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-item {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  overflow: hidden;
  background: #fff;
  transition: all 0.15s;
}

.preset-item:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(51, 112, 255, 0.14);
}

.preset-preview {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-label {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f2f3f5;
  color: var(--text-3);
}
</style>
