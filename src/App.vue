<script setup lang="ts">
import AssetPanel from '@/components/AssetPanel.vue'
import CanvasArea from '@/components/CanvasArea.vue'
import ConfigPanel from '@/components/ConfigPanel.vue'
import { useEditorStore } from '@/stores/editor'
import { useAssetsStore } from '@/stores/assets'
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@/config/editor'

const editorStore = useEditorStore()
const assetsStore = useAssetsStore()

/** 一键载入示例：一张图片 + 一段标题文字 */
function loadDemo() {
  const first = assetsStore.items[0]
  if (first) {
    editorStore.addImage(
      { name: first.name, src: first.src, width: first.width, height: first.height },
      DESIGN_WIDTH * 0.32,
      DESIGN_HEIGHT * 0.48,
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
  gap: 8px;
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
