/**
 * 图片加载工具：缓存已加载的 HTMLImageElement，
 * 保证 canvas 上重复绘制同一张图不会反复解码。
 */
const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)

  let p = pending.get(src)
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        cache.set(src, img)
        pending.delete(src)
        resolve(img)
      }
      img.onerror = () => {
        pending.delete(src)
        reject(new Error(`图片加载失败: ${src.slice(0, 60)}`))
      }
      img.src = src
    })
    pending.set(src, p)
  }
  return p
}

/** 获取图片自然尺寸 */
export async function getImageSize(
  src: string,
): Promise<{ width: number; height: number }> {
  const img = await loadImage(src)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/** File 读取为 dataURL */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
