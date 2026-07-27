/**
 * Word OMML (m:oMath) → LaTeX（Node 服务端，供教辅书 DOCX 导入）
 * 依赖缺失时降级为【公式】占位，不阻断 docx-import 模块加载
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let omml2mathml = null
let MathMLToLaTeX = null
let getDom = null

try {
  omml2mathml = require('omml2mathml')
  MathMLToLaTeX = require('mathml-to-latex').MathMLToLaTeX
  getDom = require('get-dom')
} catch (err) {
  console.warn('[ommlToLatex] 可选依赖未安装，Office 公式转 LaTeX 已禁用:', err?.message || err)
}

const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'

function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function wrapLatex(latex, display) {
  const t = String(latex || '').trim()
  if (!t) return ''
  if (t.startsWith('$$') && t.endsWith('$$')) return t
  if (t.startsWith('$') && t.endsWith('$') && !t.startsWith('$$')) return t
  return display ? `$$${t}$$` : `$${t}$`
}

function parseOmmlXml(ommlXml) {
  if (!getDom) return null
  const dom = getDom.document()
  return new dom.defaultView.DOMParser().parseFromString(ommlXml, 'text/xml')
}

/** OMML XML 片段 → LaTeX */
export function ommlXmlToLatex(ommlXml, display = false) {
  if (!omml2mathml || !MathMLToLaTeX) return null
  try {
    let xml = String(ommlXml || '').trim()
    if (!xml.includes('xmlns:m=')) {
      if (xml.startsWith('<m:oMathPara')) {
        xml = xml.replace('<m:oMathPara', `<m:oMathPara xmlns:m="${M_NS}"`)
      } else if (xml.startsWith('<m:oMath')) {
        xml = xml.replace('<m:oMath', `<m:oMath xmlns:m="${M_NS}"`)
      }
    }
    const doc = parseOmmlXml(xml)
    if (!doc || doc.querySelector('parsererror')) return null
    const mathEl = omml2mathml(doc.documentElement)
    const mathml = mathEl?.outerHTML || ''
    const latex = MathMLToLaTeX.convert(mathml)
    if (!latex?.trim()) return null
    return wrapLatex(latex, display)
  } catch {
    return null
  }
}

export function latexToWordRun(latex) {
  return `<w:r><w:t xml:space="preserve">${escapeXmlText(latex)}</w:t></w:r>`
}

/** document.xml 中将 OMML 公式替换为 LaTeX 文本节点 */
export function replaceOmmlWithLatexInDocXml(docXml) {
  let converted = 0
  let xml = docXml
  xml = xml.replace(/<m:oMathPara[\s\S]*?<\/m:oMathPara>/g, (block) => {
    const latex = ommlXmlToLatex(block, true)
    if (latex) {
      converted += 1
      return latexToWordRun(latex)
    }
    return '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
  })
  xml = xml.replace(/<m:oMath[\s\S]*?<\/m:oMath>/g, (block) => {
    const latex = ommlXmlToLatex(block, false)
    if (latex) {
      converted += 1
      return latexToWordRun(latex)
    }
    return '<w:r><w:t xml:space="preserve">【公式】</w:t></w:r>'
  })
  return { xml, ommlConverted: converted }
}
