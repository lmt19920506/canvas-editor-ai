# PSD 解析 JSON 字段对照表

> 来源：`src/utils/psd.ts`（`parsePsdFile`）
> 用途：说明解析结果里每个 key 的类型、取值来源、业务含义，以及它对应到编辑器内部字段 / 模板渲染属性。
> 坐标系：PSD 原始像素，原点左上角，**不做缩放**（画布尺寸 = PSD 尺寸）。
> 图片字段：`url` / `*ImageUrl` 当前是 `data:image/png;base64,...`，对接 OSS 时换成上传后的 URL，结构不变。

---

## 0. 结果最外层 `PsdParseResult`

| key | 类型 | 来源 | 含义 | 对应关系 |
|---|---|---|---|---|
| `meta` | object | 解析过程统计 | **仅调试 / 提示用**，不属于模板 JSON | 下载时**不导出**，只导出 `pages` |
| `pages` | array | `[page]` | 模板页面数组，**最终交付 JSON** | 直接给模板系统使用 |

### `meta`

| key | 类型 | 含义 |
|---|---|---|
| `fileName` | string | 源文件名（含 `.psd`） |
| `psdWidth` / `psdHeight` | number | PSD 画布宽高，导入后即画布尺寸 |
| `textCount` | number | 解析出的文字元素数 |
| `imageCount` | number | 解析出的图片元素数（名称含「素材」） |
| `frameCount` | number | 解析出的可填充元素数（frame） |
| `hasContainerUrl` | boolean | 是否解析到「背景图片」作为画布背景 |
| `skippedCount` | number | 被跳过的图层数（隐藏 / 无坐标 / 无像素 / 重复背景） |
| `skippedReasons` | string[] | 逐条跳过原因，格式 `「图层名」：原因` |

---

## 1. `pages[0]`（单页）

| key | 类型 | 取值 | 含义 |
|---|---|---|---|
| `isTemplate` | boolean | 固定 `false` | 是否内置模板；内置模板不可删除，PSD 导入可删除 |
| `pageType` | string | 固定 `'content'` | 页面类型（内容页） |
| `pageName` | string | 文件名去掉 `.psd` | 页面名称 |
| `container` | object | 见 §2 | 画布容器 |
| `clothesContainer` | null | 固定 `null` | 印花区域；PSD 无此概念 |
| `data` | array | 见 §3 | 页面元素，数组顺序 = 层级，越靠后越上层 |

---

## 2. `container`（画布容器）

| key | 类型 | 取值 | 含义 | 对应渲染属性 |
|---|---|---|---|---|
| `width` | number | `psd.width` | **容器宽 = 画布宽** | `.canvas-box` 宽 / canvas 元素 `width` |
| `height` | number | `psd.height` | **容器高 = 画布高** | `.canvas-box` 高 / canvas 元素 `height` |
| `url` | string | 「背景图片」图层 PNG dataURL；无则 `''` | 容器背景图 | 画布底层背景（导入为最底层 image 元素） |
| `isTop` | boolean | 固定 `false` | 为 `true` 时下方元素不响应事件 | 交互开关（导入保留 false，业务可调） |
| `backgroundColor` | string | 固定 `'#ffffff'` | 画布底色 | 画布填充色 |
| `bleedLine` | number | 固定 `0` | 出血线 | 印刷出血，PSD 无 |
| `bleedLineDur` | number | 固定 `0` | 出血线差值 | 印刷出血，PSD 无 |
| `decorateBackgroundImage` | array | 固定 `[]` | 修饰图（永远置顶、事件可穿透） | PSD 无对应概念；元素结构 `{x,y,width,height,isEdit,url}` |

---

## 3. `data[]` 元素

### 3.1 三类公共字段

| key | 类型 | 来源 | 含义 |
|---|---|---|---|
| `type` | `'text' \| 'image' \| 'frame'` | 按图层名 / 文本内容路由 | 元素类型 |
| `zIndex` | number | 遍历序号，自 1 递增 | 层级序号，自底向上；数组顺序即层级 |
| `name` | string | PSD 图层名（空则按类型补 `图片 N` / `文字 N` / `相片*N`） | 元素名 |
| `x` / `y` | number | `layer.left` / `layer.top` | 左上角坐标（PSD 像素系） |
| `width` / `height` | number | `right - left` / `bottom - top` | 图层包围盒尺寸 |
| `opacity` | number | `clamp(layer.opacity, 0, 1)` | 透明度（PSD 0–255 已归一化） |

---

### 3.2 `text` 专属

| key | 类型 | 来源 | 含义 | 编辑器对应字段 |
|---|---|---|---|---|
| `content` | string | `layer.text.text`，换行统一为 `\n` 并 trim | 文字内容 | `TextElement.content` |
| `fontSize` | number | `round(text.style.fontSize)`，clamp 8–600，缺省 32 | 字号 px | `fontSize` |
| `fontFamily` | string | `"{style.font.name}", Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif` | 带 fallback 的字体串 | `fontFamily` |
| `fontWeight` | number | `fauxBold ? 700 : 400` | 字重 | `fontWeight` |
| `lineHeight` | number | `clamp(leading / fontSize, 0.8, 4)`，缺省 `1.2` | **倍数**（PSD 给的是行距像素，已换算） | `lineHeight` |
| `color` | string | `fillColor` → `#rrggbb`，缺省 `#1f2329` | 文字颜色 | `color` |
| `source.layerName` | string \| null | 图层名 | 溯源 | — |
| `source.fontSize` | number | 原始字号（未取整） | 溯源 | — |
| `source.fontName` | string \| null | PSD 原始字体名 | 排查字体缺失 | — |
| `source.leading` | number \| null | PSD 行距像素 | 溯源 | — |
| `source.box` | object | `{left, top, right, bottom}` | PSD 原始包围盒 | — |

> 注意：导入编辑器后，文字的 `width/height` 会被 `measureText()` **重新测量校正**（PSD 文本框与实际渲染存在基线 / 内边距差异），JSON 里的宽高仅为 PSD 包围盒。

---

### 3.3 `image` 专属（图层名包含「素材」）

| key | 类型 | 来源 | 含义 | 编辑器对应字段 |
|---|---|---|---|---|
| `url` | string | `layer.canvas.toDataURL('image/png')` | 图层像素导出的 PNG dataURL | `ImageElement.src` |
| `x` / `y` / `width` / `height` | number | PSD 图层包围盒 | 位置尺寸 | 同名 |
| `source.canvasWidth` / `canvasHeight` | number | `layer.canvas.width / height` | 图层像素画布尺寸 | 导入时算 `aspectRatio = w / h` |
| `source.layerName` / `source.box` | — | 图层名 / 包围盒 | 溯源 | — |

---

### 3.4 `frame` 专属（非「素材」「背景图片」的其余图层）

| key | 类型 | 取值 | 含义 | 渲染 / 编辑器对应 |
|---|---|---|---|---|
| `name` | string | 图层名，空则 `相片*N` | 元素名 | 元素图层名 |
| `type` | `'frame'` | 固定 | 可填充元素 | `FrameElement` |
| `width` / `height` | number | 图层包围盒 | 渲染尺寸 | 容器 + `<svg width/height>` |
| `x` / `y` | number | 图层 `left` / `top` | 容器坐标 | `.frame-container` 的 `left / top` |
| `zIndex` | number | 遍历序号 | 层级 | 元素在 `elements` 数组中的顺序 |
| `rotate` | number | `0` | 旋转角 | 预留（编辑器未做旋转） |
| `isFlipX` / `isFlipY` | boolean | `false` | 水平 / 垂直翻转 | 预留 |
| `isLocked` | boolean | `false` | 是否锁定 | 预留 |
| `isNeedEdit` | boolean | `true` | 是否需要用户填充 | 业务标记（导入 true） |
| `imgList` | array | `[]` | 修饰图列表（永远在上层） | `<img class="frame-modify-img">`，结构 `{url,width,height,left,top}` |
| `isSelected` | boolean | `false` | 是否选中 | 运行时状态 |
| `id` | string | `crypto.randomUUID()` | 元素 id | `FrameElement.id`（mask id 由其派生） |
| `isTemplate` | boolean | `false` | 是否内置模板 | 同上 |

---

### 3.5 `frame.config`（渲染核心）

| key | 类型 | 取值 | 含义 | 模板中的对应属性 |
|---|---|---|---|---|
| `width` / `height` | number | = 元素宽高 | 渲染尺寸 | `<svg width/height>` |
| `id` | string | = 元素 `id` | 唯一标识 | mask id 派生（编辑器用自身 `el.id`） |
| `contentImageUrl` | string | 图层像素 PNG dataURL | **填充图**（用户可替换） | `<image.frame-content-img :href>` |
| `defaultContentImageUrl` | string | 同上 | 默认填充图（"还原"用） | 预留 |
| `maskImageUrl` | string | RGB 全白 + 保留原 alpha 的 PNG | **遮罩图**：决定"哪里能被填充" | `<mask><image.frame-mask-img :href>` |
| `viewBoxWidth` / `viewBoxHeight` | number | = 元素宽高 | SVG viewBox 尺寸 | `:viewBox="0 0 w h"`、mask image `width/height` |
| `imgContentLeft` / `imgContentTop` | number | `0`（导入时铺满） | 填充图在 viewBox 内的偏移 | `<image :x :y>` |
| `imgContentWidth` / `imgContentHeight` | number | = 元素宽高 | 填充图在 viewBox 内的实际尺寸 | `<image :width :height>` |
| `originImgContentWidth` / `originImgContentHeight` | number | = 元素宽高 | 填充图原始尺寸 | 预留 |
| `isShow` | boolean | `true` | 是否渲染 svg | `v-if` 控制 |
| `left` / `top` | number | `0` | svg 相对容器的偏移 | 预留（编辑器 svg 固定 0,0） |
| `rate` / `scale` | number | `1` | 缩放比例 | 预留 |
| `x` / `y` / `zIndex` | number | 元素坐标 / 层级快照 | 冗余快照 | 预留 |
| `aspectRatio` | number | `w / h` | 宽高比 | 等比缩放基准 |

---

## 4. 渲染关系（`ElementFrameView.vue`）

```
div.frame-container          ← el.x / el.y / el.width / el.height / el.opacity
├─ img.frame-modify-img      ← imgList[]（PSD 导入为空）
└─ svg.svg-show
   ├─ defs > mask#mask-{id}  ← el.maskImageUrl    ← config.maskImageUrl
   └─ image.frame-content-img ← el.image           ← config.contentImageUrl
                                el.imgContentLeft/Top/Width/Height
                                el.viewBoxWidth/Height ← config.viewBoxWidth/Height
```

## 5. `frame` 导入编辑器后的字段映射

| JSON（`config`） | 编辑器 `FrameElement` | 说明 |
|---|---|---|
| `contentImageUrl` | `image` | 替换填充图即改此字段 |
| `maskImageUrl` | `maskImageUrl` | 遮罩形状，换图时不变 |
| `viewBoxWidth` / `viewBoxHeight` | `viewBoxWidth` / `viewBoxHeight` | SVG 视口 |
| `imgContentLeft` / `imgContentTop` / `imgContentWidth` / `imgContentHeight` | 同名字段 | 滚轮缩放 / 拖动平移都在改这 4 个值 |
| `width` / `height` / `x` / `y` | 同名字段 | 元素几何 |
| — | `imgScale` | **编辑器内部**：编辑模式缩放倍数，1 = cover 基准 |
| — | `src` / `svg` / `mask` | 兼容保留的历史字符串字段，模板已不依赖 |
| `id` | `id` | 导入时重新生成，mask id 由 `mask-${el.id}` 派生 |

## 6. 占位字段速查（当前固定值）

- `page.isTemplate = false`、`page.clothesContainer = null`、`page.container.isTop = false`
- `container.bleedLine = 0`、`bleedLineDur = 0`、`decorateBackgroundImage = []`
- `frame.rotate = 0`、`isFlipX/isFlipY/isLocked/isSelected = false`、`isTemplate = false`
- `frame.config.left = 0`、`top = 0`、`rate = 1`、`scale = 1`、`isShow = true`

需要真机验证的字段：`isTop`（事件穿透）、`isNeedEdit`（是否强制用户填充）、`bleedLine` 系列（印刷出血）。
