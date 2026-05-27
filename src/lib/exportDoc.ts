/** 导出 Word 兼容 HTML（.doc） */
export function exportHtmlAsWord(html: string, filename: string) {
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
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
