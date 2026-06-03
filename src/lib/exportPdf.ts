import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export async function exportExamToPdf(element: HTMLElement, filename: string): Promise<void> {
  return exportToPdf(element, filename)
}

export async function exportToPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10

  const imgWidth = pageWidth - margin * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = margin

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= pageHeight - margin * 2

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= pageHeight - margin * 2
  }

  pdf.save(filename)
}

export async function exportExamToWord(element: HTMLElement, filename: string): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="generator" content="华祺云师AI">
  <title>${filename.replace('.docx', '')}</title>
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

  const blob = new Blob(['\ufeff' + html], {
    type: 'application/msword',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.docx') ? filename : `${filename}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
