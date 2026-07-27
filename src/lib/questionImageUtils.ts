/** 是否为文件名型附图引用（前端渲染用，与后端 questionImageIndex 保持一致） */
export function isFileLikeImageRef(name = ''): boolean {
  const t = String(name).trim()
  if (!t || t.length < 4) return false
  if (/\.(wmf|emf|png|jpe?g|gif|bmp|webp)$/i.test(t)) return true
  if (/_p\d+_\d+/i.test(t) || /_图\d+/i.test(t)) return true
  if (/[\w\u4e00-\u9fff].*[_-]\d+\.(wmf|png|jpe?g)/i.test(t)) return true
  return false
}
