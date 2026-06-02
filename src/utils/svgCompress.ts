/** 压缩 SVG：限制最大宽度并移除多余空白 */
export function compressSvgString(svg: string, maxWidth = 960): string {
  const trimmed = svg.trim()
  if (!trimmed) return trimmed

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(trimmed, 'image/svg+xml')
    const root = doc.documentElement
    if (root.querySelector('parsererror')) return trimmed.replace(/\s{2,}/g, ' ')

    const viewBox = root.getAttribute('viewBox')
    let width = Number.parseFloat(root.getAttribute('width') ?? '')
    let height = Number.parseFloat(root.getAttribute('height') ?? '')

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number)
      if (parts.length === 4) {
        if (!Number.isFinite(width)) width = parts[2]
        if (!Number.isFinite(height)) height = parts[3]
      }
    }

    if (Number.isFinite(width) && width > maxWidth && width > 0) {
      const scale = maxWidth / width
      width = maxWidth
      if (Number.isFinite(height)) height = Math.round(height * scale)
    }

    if (Number.isFinite(width) && width > 0) root.setAttribute('width', String(Math.round(width)))
    if (Number.isFinite(height) && height > 0) root.setAttribute('height', String(Math.round(height)))

    const serialized = new XMLSerializer().serializeToString(root)
    return serialized.replace(/>\s+</g, '><').trim()
  } catch {
    return trimmed.replace(/\s{2,}/g, ' ')
  }
}

export function svgStringToFile(svg: string, filename: string, maxWidth = 960): File {
  const optimized = compressSvgString(svg, maxWidth)
  return new File([optimized], filename, { type: 'image/svg+xml' })
}
