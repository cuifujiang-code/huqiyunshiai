import { useEffect, type RefObject } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export function useKaTeX(containerRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    if (!containerRef.current) return
    renderMathInElement(containerRef.current)
  }, [containerRef, ...deps])
}

/** 在 DOM 元素内渲染 $...$ / $$...$$ 公式 */
export function renderMathInElement(element: HTMLElement) {
  if (!element) return

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.textContent?.includes('$')) {
      textNodes.push(node)
    }
  }

  for (const node of textNodes) {
    const parent = node.parentNode
    if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue

    const html = node.textContent || ''
    const processed = html
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
        try {
          return katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })
        } catch {
          return _
        }
      })
      .replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\$)\$(?!\$)/g, (_, formula) => {
        try {
          return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
        } catch {
          return _
        }
      })

    if (processed !== html) {
      const span = document.createElement('span')
      span.innerHTML = processed
      parent.replaceChild(span, node)
    }
  }
}
