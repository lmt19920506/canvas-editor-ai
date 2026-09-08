import { defineStore } from 'pinia'
import { uid } from '@/utils/uid'

/** 素材项 */
export interface AssetItem {
  id: string
  name: string
  src: string
  width: number
  height: number
}

/** 生成一张内置的 SVG dataURL 占位示例图 */
function sampleSvg(name: string, c1: string, c2: string, deco: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#g)"/>
  ${deco}
  <text x="200" y="170" font-size="42" fill="#ffffff" text-anchor="middle"
    font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" font-weight="700">${name}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildSamples(): AssetItem[] {
  const list: AssetItem[] = []
  const samples: Array<[string, string, string, string]> = [
    ['示例 · 晴空', '#36cfc9', '#1d39c4', '<circle cx="320" cy="70" r="80" fill="rgba(255,255,255,.28)"/>'],
    ['示例 · 落日', '#ffc53d', '#fa541c', '<circle cx="90" cy="250" r="70" fill="rgba(255,255,255,.2)"/>'],
    ['示例 · 青野', '#95de64', '#237804', '<path d="M0 300 Q100 180 210 260 T420 240 T400 300 Z" fill="rgba(255,255,255,.22)"/>'],
  ]
  samples.forEach(([name, c1, c2, deco], i) => {
    list.push({ id: uid('asset'), name, src: sampleSvg(name, c1, c2, deco), width: 400, height: 300 })
  })
  return list
}

export const useAssetsStore = defineStore('assets', {
  state: () => ({
    items: buildSamples() as AssetItem[],
  }),

  getters: {
    byId: (state) => (id: string) => state.items.find((i) => i.id === id),
  },

  actions: {
    addAsset(name: string, src: string, width = 0, height = 0): AssetItem {
      const item: AssetItem = { id: uid('asset'), name, src, width, height }
      this.items.push(item)
      return item
    },
  },
})
