<!--
  App.vue — 应用外壳（根组件）

  【用处】
    搭建整体布局并承载全局操作：
    - 顶栏：品牌区 + 「解析 PSD」「下载 JSON」「载入示例」「清空画布」四个动作 + 解析状态提示
    - 主体：左（素材面板 AssetPanel）/ 中（画布 CanvasArea）/ 右（属性面板 ConfigPanel）三栏

  【逻辑】
    1. 布局只负责「壳」，编辑能力全在子组件与 store：本组件不直接操作画布元素，
       除 PSD 导入、示例数据、清空这三处入口外不做其它业务逻辑。
    2. PSD 导入链路：隐藏的 file input → parsePsdFile() 解析成 page 数组 JSON
       → editorStore.importFromPsd() 按图层顺序铺到画布（画布尺寸同步切换为 PSD 尺寸）
       → 结果留存用于「下载 JSON」与顶栏统计提示。
    3. 解析大文件会阻塞主线程，所以先置 loading 并等一帧再开始，保证按钮的禁用态能先渲染出来。
    4. 状态提示分为正常态与错误态（psdStatusError），错误态用红色文案，长文本用 title 兜底展示全量信息。

  【关系】
    - 解析实现：src/utils/psd.ts（parsePsdFile）
    - 导入动作：src/stores/editor.ts（importFromPsd）
    - 子组件：components/AssetPanel.vue | CanvasArea.vue | ConfigPanel.vue
-->
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

/** 隐藏的 file input，点击顶部按钮时由 pickPsd() 触发 */
const psdInputRef = ref<HTMLInputElement | null>(null)
/** 是否正在解析 PSD（大文件解析耗时较久，按钮置为加载态） */
const psdParsing = ref(false)
/** 最近一次解析结果（用于下载 JSON / 展示统计） */
const lastPsdResult = ref<PsdParseResult | null>(null)
/** 顶栏状态提示文案（成功/失败共用同一位置） */
const psdStatus = ref('')
/** 状态提示是否为错误态（决定红色样式） */
const psdStatusError = ref(false)

/** 点击「解析 PSD」：解析中直接忽略，避免重复触发文件选择 */
function pickPsd() {
  if (psdParsing.value) return
  psdInputRef.value?.click()
}

/**
 * 选择文件后解析并导入画布。
 * 逻辑：
 *   1. 先清空 input.value，保证连续选择同一个文件也能再次触发 change；
 *   2. 置 loading 并等一帧，让按钮禁用态先渲染，避免解析阻塞 UI 造成「点了没反应」的错觉；
 *   3. parsePsdFile 解析为 page 数组 JSON，结果留存供下载；
 *   4. importFromPsd 交给 store 按 zIndex 铺到画布（画布尺寸切为 PSD 尺寸）；
 *   5. 无可用图层时用 alert 列出跳过原因，便于设计师自查命名/隐藏图层问题；
 *   6. 任何异常统一收敛为错误提示，PsdParseError 直接展示其 message。
 */
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

/**
 * 下载最近一次解析生成的 JSON（page 数组结构：container + data[文字/图片/填充元素]）。
 * 逻辑：只导出 pages（meta 为调试统计，不属于模板数据）；
 *       用 Blob + 临时 <a> 触发下载，文件名取源文件名（.psd → .psd.json）。
 */
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

/**
 * 一键载入示例：一张图片 + 一段标题文字。
 * 逻辑：取素材库第一张图放在画布左侧偏上（按当前画布尺寸取相对位置，兼容 PSD 尺寸），
 *       再叠加一段标题文字，用于快速验证画布交互。
 */
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

/** 清空画布：空画布直接返回，否则二次确认后清空（同时恢复默认画布尺寸） */
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
