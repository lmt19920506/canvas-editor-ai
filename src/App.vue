<script setup lang="ts">
import { ref } from 'vue'
import AssetPanel from '@/components/AssetPanel.vue'
import CanvasArea from '@/components/CanvasArea.vue'
import ConfigPanel from '@/components/ConfigPanel.vue'
import { useEditorStore } from '@/stores/editor'
import { useAssetsStore } from '@/stores/assets'
import { parsePsdFile, PsdParseError, type PsdParseResult } from '@/utils/psd'

const editorStore = useEditorStore()
const assetsStore = useAssetsStore()

/* ================= PSD 解析导入 ================= */

const psdInputRef = ref<HTMLInputElement | null>(null)
/** 是否正在解析 PSD（大文件解析耗时较久，按钮置为加载态） */
const psdParsing = ref(false)
/** 最近一次解析结果（用于下载 JSON / 展示统计） */
const lastPsdResult = ref<PsdParseResult | null>(null)
const psdStatus = ref('')
const psdStatusError = ref(false)

function pickPsd() {
  if (psdParsing.value) return
  psdInputRef.value?.click()
}

async function onPsdFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 允许连续选择同一个文件触发 change
  input.value = ''
  if (!file) return

  psdParsing.value = true
  psdStatus.value = `正在解析「${file.name}」…`
  psdStatusError.value = false

  try {
    // 等两帧，保证按钮禁用态先渲染，避免大文件解析阻塞 UI
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    const result = await parsePsdFile(file)
    lastPsdResult.value = result
    // 完整解析 JSON（page 数组结构）打到控制台，便于调试与对接
    console.log(`[PSD 解析] ${file.name}`, result.pages)

    const added = editorStore.importFromPsd(result)
    const { textCount, imageCount, frameCount, hasContainerUrl } = result.meta
    if (added.length === 0) {
      psdStatusError.value = true
      psdStatus.value = `「${file.name}」未解析出可用图层（文字 ${textCount} · 图片 ${imageCount} · 填充 ${frameCount} · 跳过 ${result.meta.skippedCount}）`
      window.alert(`未从「${file.name}」解析出可用图层。\n跳过原因：\n${result.meta.skippedReasons.slice(0, 10).join('\n') || '无'}`)
    } else {
      psdStatus.value =
        `已导入「${file.name}」：文字 ${textCount} · 图片 ${imageCount} · 填充元素 ${frameCount}` +
        (hasContainerUrl ? ' · 已设置画布背景' : '') +
        (result.meta.skippedCount ? ` · 跳过 ${result.meta.skippedCount} 层` : '') +
        `（画布 ${result.meta.psdWidth} × ${result.meta.psdHeight}）`
    }
  } catch (err) {
    psdStatusError.value = true
    psdStatus.value = err instanceof PsdParseError ? err.message : `解析失败：${String(err)}`
  } finally {
    psdParsing.value = false
  }
}

/** 下载最近一次解析生成的 JSON（page 数组结构：container + data[文字/图片/填充元素]） */
function downloadPsdJson() {
  const result = lastPsdResult.value
  if (!result) return
  const blob = new Blob([JSON.stringify(result.pages, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.meta.fileName.replace(/\.psd$/i, '')}.psd.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 一键载入示例：一张图片 + 一段标题文字 */
function loadDemo() {
  const first = assetsStore.items[0]
  if (first) {
    editorStore.addImage(
      { name: first.name, src: first.src, width: first.width, height: first.height },
      editorStore.canvasWidth * 0.32,
      editorStore.canvasHeight * 0.48,
    )
  }
  editorStore.addText({
    content: '画布编辑器 Demo',
    fontSize: 52,
    fontWeight: 700,
    color: '#3370ff',
    name: '示例标题',
  })
}

function clearCanvas() {
  if (!editorStore.elements.length) return
  if (window.confirm('确定清空画布上所有元素吗？')) {
    editorStore.clearAll()
  }
}
</script>

<template>
  <div class="app-shell">
    <!-- 顶栏 -->
    <header class="topbar">
      <div class="brand">
        <span class="brand__logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" rx="2" fill="#3370ff" />
            <rect x="13" y="3" width="8" height="8" rx="2" fill="#69b1ff" />
            <rect x="3" y="13" width="8" height="8" rx="2" fill="#69b1ff" />
            <rect x="13" y="13" width="8" height="8" rx="2" fill="#2458db" />
          </svg>
        </span>
        <span class="brand__name">素材画布编辑器</span>
        <span class="brand__tech">Vue3 · TS · Pinia · Canvas</span>
      </div>
      <div class="topbar__actions">
        <input
          ref="psdInputRef"
          type="file"
          accept=".psd"
          class="psd-input"
          @change="onPsdFileChange"
        />
        <button class="btn sm primary" :disabled="psdParsing" @click="pickPsd">
          {{ psdParsing ? '⏳ 解析中…' : '▣ 解析 PSD' }}
        </button>
        <button
          v-if="lastPsdResult && !psdParsing"
          class="btn sm"
          title="下载最近一次 PSD 解析生成的 JSON（page 数组：container 背景 + data 元素）"
          @click="downloadPsdJson"
        >
          ⤓ 下载 JSON
        </button>
        <span
          v-if="psdStatus"
          class="psd-status"
          :class="{ 'psd-status--error': psdStatusError }"
          :title="psdStatus"
        >{{ psdStatus }}</span>
        <button class="btn sm" @click="loadDemo">✦ 载入示例</button>
        <button class="btn sm" @click="clearCanvas">清空画布</button>
      </div>
    </header>

    <!-- 三栏主体 -->
    <main class="layout">
      <aside class="col col-left">
        <AssetPanel />
      </aside>

      <section class="col col-center">
        <CanvasArea />
      </section>

      <aside class="col col-right">
        <ConfigPanel />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 顶栏 */
.topbar {
  flex: none;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand__logo {
  display: flex;
}

.brand__name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.brand__tech {
  font-size: 12px;
  color: var(--text-3);
  background: #f2f3f5;
  padding: 3px 8px;
  border-radius: 10px;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 隐藏的 PSD 文件选择框 */
.psd-input {
  display: none;
}

/* PSD 解析状态提示 */
.psd-status {
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-3);
}

.psd-status--error {
  color: var(--danger);
}

/* 三栏 */
.layout {
  flex: 1;
  min-height: 0;
  display: flex;
}

.col {
  min-width: 0;
}

.col-left {
  flex: none;
  width: 248px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
}

.col-center {
  flex: 1;
  min-width: 480px;
}

.col-right {
  flex: none;
  width: 300px;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
}
</style>
