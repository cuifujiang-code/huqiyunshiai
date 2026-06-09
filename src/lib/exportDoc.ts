/** 导出 Word 兼容 HTML（.doc），保留字体/颜色/分栏 */

export interface WordExportOptions {
  mode?: 'print' | 'digital'
  title?: string
}

export function exportHtmlAsWord(html: string, filename: string, options: WordExportOptions = {}) {
  const mode = options.mode ?? 'print'
  const margin = mode === 'print' ? '25.4mm 31.7mm' : '19mm 25.4mm'

  const doc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="华祺云师 AI">
<title>${options.title ?? filename}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page Section1 { size: 595.3pt 841.9pt; margin: ${margin}; mso-page-orientation: portrait; }
div.Section1 { page: Section1; }
body { font-family: "Microsoft YaHei", SimSun, 宋体, serif; }
p, div, span, h1, h2, h3, h4 { mso-style-parent: ""; }
</style>
</head>
<body>
<div class="Section1">
${html}
</div>
</body>
</html>`

  const blob = new Blob(['\ufeff', doc], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

export function questionsToHtml(title: string, sections: { question_type: string; questions: { number?: number; content: string; score?: number }[] }[]) {
  let html = `<h1 style="text-align:center">${title}</h1>`
  for (const sec of sections) {
    html += `<h2>${sec.question_type}</h2>`
    for (const q of sec.questions) {
      html += `<p><strong>${q.number}.</strong>（${q.score ?? 0}分）${q.content.replace(/\n/g, '<br/>')}</p>`
    }
  }
  return html
}

export function handoutToHtml(content: { title: string; modules: { title: string; content: string }[] }) {
  let html = `<h1 style="text-align:center">${content.title}</h1>`
  for (const m of content.modules) {
    html += `<h2>${m.title}</h2><div>${m.content.replace(/\n/g, '<br/>')}</div>`
  }
  return html
}
