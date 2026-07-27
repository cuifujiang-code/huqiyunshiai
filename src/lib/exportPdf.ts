import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export interface PdfExportOptions {
  /** 章节书签（标题列表，按文档顺序） */
  bookmarks?: { title: string; level?: number }[]
  /** 可打印版更大边距 */
  mode?: 'print' | 'digital'
}

/** 等待元素内所有图片加载完成（导出 PDF 前调用） */
export async function waitForImagesInElement(element: HTMLElement, timeoutMs = 3000): Promise<void> {
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.onload = done
          img.onerror = done
          setTimeout(done, timeoutMs)
        }),
    ),
  )
}

export async function exportExamToPdf(element: HTMLElement, filename: string): Promise<void> {
  return exportToPdf(element, filename)
}

export async function exportToPdf(
  element: HTMLElement,
  filename: string,
  options: PdfExportOptions = {},
): Promise<void> {
  await waitForImagesInElement(element)

  const scale = options.mode === 'print' ? 2.5 : 2
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = options.mode === 'print' ? 12 : 10

  const imgWidth = pageWidth - margin * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = margin
  const pageCount = Math.max(1, Math.ceil(imgHeight / (pageHeight - margin * 2)))

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= pageHeight - margin * 2

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= pageHeight - margin * 2
  }

  // jsPDF 4.x 大纲书签
  if (options.bookmarks?.length) {
    try {
      const outline = (pdf as unknown as { outline?: { add: (...args: unknown[]) => void } }).outline
      if (outline?.add) {
        options.bookmarks.forEach((bm, idx) => {
          const pageNum = Math.min(
            pageCount,
            Math.max(1, Math.floor((idx / options.bookmarks!.length) * pageCount) + 1),
          )
          outline.add(null, bm.title, { pageNumber: pageNum })
        })
      }
    } catch {
      /* 书签不可用时忽略 */
    }
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

/**
 * 服务端 PDF 导出（通过 Puppeteer 渲染，生成真实文本 PDF）
 * 相比前端 html2canvas+jsPDF 方案：
 *   - 真实文本（可选中、可搜索）
 *   - 矢量公式（KaTeX SVG → PDF 矢量）
 *   - 正确分页（CSS page-break 生效）
 *   - 文件体积小（通常 <2MB）
 */
export async function exportToServerPdf(
  html: string,
  filename: string,
  meta: { title: string; coverStyle?: string; outline?: { title: string; level?: number }[] },
): Promise<boolean> {
  try {
    const apiBase = import.meta.env.VITE_TEACHER_API_URL || window.location.origin
    const url = `${apiBase}/api/teacher/books/export-pdf`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        title: meta.title,
        coverStyle: meta.coverStyle || 'academic',
        outline: meta.outline || [],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    const blob = await res.blob()
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)

    return true
  } catch (err) {
    console.error('[exportToServerPdf] 服务端 PDF 导出失败:', err)
    throw err
  }
}

/** 服务端双版本 PDF 导出（学生版 + 教师版，一次请求返回两个 PDF） */
export async function exportDualToServerPdf(
  studentHtml: string,
  teacherHtml: string,
  filenameBase: string,
  meta: { title: string; coverStyle?: string; outline?: { title: string; level?: number }[] },
): Promise<boolean> {
  try {
    const apiBase = import.meta.env.VITE_TEACHER_API_URL || window.location.origin
    const url = `${apiBase}/api/teacher/books/export-pdf`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentHtml,
        teacherHtml,
        title: meta.title,
        coverStyle: meta.coverStyle || 'academic',
        outline: meta.outline || [],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    const data = await res.json()
    if (!data.success) throw new Error(data.error || '导出失败')

    // 下载学生版
    const studentBytes = Uint8Array.from(atob(data.studentBase64), (c) => c.charCodeAt(0))
    const studentBlob = new Blob([studentBytes], { type: 'application/pdf' })
    const studentUrl = URL.createObjectURL(studentBlob)
    const a1 = document.createElement('a')
    a1.href = studentUrl
    a1.download = `${filenameBase}_学生版.pdf`
    document.body.appendChild(a1)
    a1.click()
    document.body.removeChild(a1)
    URL.revokeObjectURL(studentUrl)

    // 下载教师版
    const teacherBytes = Uint8Array.from(atob(data.teacherBase64), (c) => c.charCodeAt(0))
    const teacherBlob = new Blob([teacherBytes], { type: 'application/pdf' })
    const teacherUrl = URL.createObjectURL(teacherBlob)
    const a2 = document.createElement('a')
    a2.href = teacherUrl
    a2.download = `${filenameBase}_教师版.pdf`
    document.body.appendChild(a2)
    a2.click()
    document.body.removeChild(a2)
    URL.revokeObjectURL(teacherUrl)

    return true
  } catch (err) {
    console.error('[exportDualToServerPdf] 服务端双版本 PDF 导出失败:', err)
    throw err
  }
}

export async function exportExamToWord(element: HTMLElement, filename: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="utf-8">
  <meta name="generator" content="华祺云师AI">
  <title>${filename.replace('.docx', '')}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    body { font-family: 'SimSun', '宋体', serif; font-size: 12pt; line-height: 1.6; color: #000; margin: 20mm; }
    h1 { text-align: center; font-size: 16pt; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #000; padding: 4px 8px; }
    @page { margin: 20mm; }
  </style>
</head>
<body>
${element.innerHTML}
</body>
</html>`

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.docx') ? filename : `${filename}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
