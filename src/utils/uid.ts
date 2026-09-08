/** 生成唯一 id */
export function uid(prefix = 'el'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}
