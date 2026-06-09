import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export interface PdfExportOptions {
  /** 章节书签（标题列表，按文档顺序） */
  bookmarks?: { title: string; level?: number }[]
  /** 可打印版更大边距 */
  mode?: 'print' | 'digital'
}

export async function exportExamToPdf(element: HTMLElement, filename: string): Promise<void> {
  return exportToPdf(element, filename)
}

export async function exportToPdf(
  element: HTMLElement,
  filename: string,
  options: PdfExportOptions = {},
): Promise<void> {
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
