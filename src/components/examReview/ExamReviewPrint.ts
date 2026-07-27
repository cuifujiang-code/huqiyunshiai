/** 期中考复盘报告打印 */
export function printExamReviewReport(opts: {
  examName: string
  examDate: string
  diagnosis: string
  actionPlan: string
  studentLabel?: string
}) {
  const { examName, examDate, diagnosis, actionPlan, studentLabel = '学生' } = opts
  const mdToHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/\n/g, '<br/>')

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${examName} - 考试复盘</title>
<style>
  body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; color: #1a1a2e; line-height: 1.75; padding: 32px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20pt; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  h2 { font-size: 14pt; color: #1d4ed8; margin-top: 24px; }
  h3 { font-size: 12pt; margin-top: 16px; }
  .meta { color: #64748b; font-size: 10pt; margin-bottom: 24px; }
  ul { padding-left: 20px; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>${examName} · 考试复盘报告</h1>
<p class="meta">${studentLabel} · 考试日期 ${examDate} · 生成时间 ${new Date().toLocaleString('zh-CN')}</p>
<h2>一、诊断分析</h2>
<div>${mdToHtml(diagnosis)}</div>
<h2>二、后半程学习计划</h2>
<div>${mdToHtml(actionPlan)}</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('无法打开打印窗口，请允许弹出窗口')
    return
  }
  w.document.write(html)
  w.document.close()
}

export function copyExamReviewText(diagnosis: string, actionPlan: string): string {
  return `${diagnosis}\n\n---\n\n${actionPlan}`
}
