/**
 * Word OMML (m:oMath) → LaTeX，供试卷预览 KaTeX 渲染
 */
import omml2mathml from 'omml2mathml'
import { MathMLToLaTeX } from 'mathml-to-latex'

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapLatex(latex: string, display: boolean): string {
  const t = latex.trim()
  if (!t) return ''
  if (t.startsWith('$$') && t.endsWith('$$')) return t
  if (t.startsWith('$') && t.endsWith('$') && !t.startsWith('$$')) return t
  return display ? `$$${t}$$` : `$${t}$`
}

/** 将 OMML XML 片段转为 LaTeX 字符串 */
export function ommlXmlToLatex(ommlXml: string, display = false): string | null {
  try {
    let xml = ommlXml.trim()
    if (!xml.includes('xmlns:m=') && !xml.includes(`xmlns:m="`)) {
      if (xml.startsWith('<m:oMathPara')) {
        xml = xml.replace('<m:oMathPara', `<m:oMathPara xmlns:m="${M_NS}"`)
      } else if (xml.startsWith('<m:oMath')) {
        xml = xml.replace('<m:oMath', `<m:oMath xmlns:m="${M_NS}"`)
      }
    }
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    if (doc.querySelector('parsererror')) return null
    const root = doc.documentElement
    const mathEl = omml2mathml(root)
    const mathml = new XMLSerializer().serializeToString(mathEl)
    const latex = MathMLToLaTeX.convert(mathml)
    if (!latex?.trim()) return null
    return wrapLatex(latex, display)
  } catch {
    return null
  }
}

/** 将 LaTeX 写入 Word 运行节点，供 mammoth 转出为 HTML 文本 */
export function latexToWordRun(latex: string): string {
  return `<w:r><w:t xml:space="preserve">${escapeXmlText(latex)}</w:t></w:r>`
}

/** 在 document.xml 中将 OMML 公式替换为 LaTeX 文本节点 */
export function replaceOmmlWithLatexInDocXml(docXml: string): string {
  let xml = docXml
  xml = xml.replace(/<m:oMathPara[\s\S]*?<\/m:oMathPara>/g, (block) => {
    const latex = ommlXmlToLatex(block, true)
    return latex ? latexToWordRun(latex) : '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
  })
  xml = xml.replace(/<m:oMath[\s\S]*?<\/m:oMath>/g, (block) => {
    const latex = ommlXmlToLatex(block, false)
    return latex ? latexToWordRun(latex) : '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
  })
  return xml
}
