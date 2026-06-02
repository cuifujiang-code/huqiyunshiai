import type { CSSProperties } from 'react'
import type { ExamLayoutConfig, ExamTextAlign } from '../types/examLayout'
import { FONT_FAMILY_CSS, FONT_SIZE_PT } from '../types/examLayout'

export function alignToCss(align: ExamTextAlign): string {
  if (align === 'left') return 'left'
  if (align === 'right') return 'right'
  return 'center'
}

export function layoutToPaperStyle(layout: ExamLayoutConfig): CSSProperties {
  const fontPt = FONT_SIZE_PT[layout.fontSize]
  return {
    fontFamily: FONT_FAMILY_CSS[layout.fontFamily],
    fontSize: `${fontPt}pt`,
    lineHeight: layout.lineHeight,
    paddingTop: layout.margins.top,
    paddingBottom: layout.margins.bottom,
    paddingLeft: layout.margins.left,
    paddingRight: layout.margins.right,
    columnCount: layout.columnMode === 'double' ? 2 : 1,
    columnGap: layout.columnMode === 'double' ? 24 : undefined,
    color: '#111',
    backgroundColor: '#fff',
  }
}

export function layoutToInlineStyle(layout: ExamLayoutConfig): string {
  const fontPt = FONT_SIZE_PT[layout.fontSize]
  const cols = layout.columnMode === 'double' ? 'column-count:2;column-gap:24px;' : ''
  return [
    `font-family:${FONT_FAMILY_CSS[layout.fontFamily]}`,
    `font-size:${fontPt}pt`,
    `line-height:${layout.lineHeight}`,
    `padding:${layout.margins.top}px ${layout.margins.right}px ${layout.margins.bottom}px ${layout.margins.left}px`,
    cols,
    'color:#111',
  ].join(';')
}
