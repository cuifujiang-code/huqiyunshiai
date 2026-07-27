/** 编辑区内嵌图形 — 避免 textarea 展示超长 base64 */

export const EMBEDDED_FIGURE_TOKEN = '【嵌入图形】'

const EMBEDDED_IMG_RE =
  /<img\b[\s\S]*?\bsrc=["'](data:image\/[^"']+)["'][\s\S]*?\/?>/gi

function normalizeFigureTag(src: string): string {
  return `<img src="${src}" alt="图形" class="book-figure max-w-full h-auto my-2" />`
}

/** 提取内嵌图形，正文替换为短占位符 */
export function extractEmbeddedFigures(content: string): { text: string; figures: string[] } {
  const figures: string[] = []
  EMBEDDED_IMG_RE.lastIndex = 0
  const text = content.replace(EMBEDDED_IMG_RE, (_, src: string) => {
    figures.push(normalizeFigureTag(src))
    return `\n${EMBEDDED_FIGURE_TOKEN}\n`
  })
  return { text, figures }
}

/** 将占位符还原为 <img> 标签写回存储 */
export function mergeEmbeddedFigures(display: string, figures: string[]): string {
  const parts = display.split(EMBEDDED_FIGURE_TOKEN)
  let figIdx = 0
  return parts
    .map((part, idx) => {
      if (idx === parts.length - 1) return part
      const fig = figures[figIdx++]
      return fig ? `${part}\n${fig}\n` : part
    })
    .join('')
}

export function countEmbeddedFigureTokens(text: string): number {
  return text.split(EMBEDDED_FIGURE_TOKEN).length - 1
}

export function hasEmbeddedFigures(content: string): boolean {
  if (content.includes(EMBEDDED_FIGURE_TOKEN)) return true
  EMBEDDED_IMG_RE.lastIndex = 0
  return EMBEDDED_IMG_RE.test(content)
}

/** 从 img 标签中提取 data URL 用于缩略图预览 */
export function figureSrcFromTag(tag: string): string | null {
  const m = tag.match(/\bsrc=["'](data:image\/[^"']+)["']/i)
  return m?.[1] ?? null
}
