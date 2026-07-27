/**
 * 志愿方案导出 — Excel / PDF
 */
import * as XLSX from 'xlsx'
import { exportToPdf } from './exportPdf'
import type { VolunteerFormInput, VolunteerItem } from '../types/volunteer'

export function exportVolunteerSchemeExcel(
  items: VolunteerItem[],
  form: VolunteerFormInput,
  schemeName?: string,
) {
  const rows = items.map((item, idx) => ({
    序号: idx + 1,
    档位: item.tierLabel,
    梯度: item.gradientLevel ?? '',
    院校: item.collegeName,
    专业: item.majorName,
    选科要求: item.subjectRequirement ?? '',
    录取概率: item.probability != null ? `${(item.probability * 100).toFixed(1)}%` : '',
    预测位次: item.predictedRank ?? '',
    参考最低位次: item.minRank ?? '',
    参考分: item.avgScore ?? item.minScore ?? '',
  }))

  const meta = [
    { 字段: '方案名称', 值: schemeName || '志愿方案' },
    { 字段: '省份', 值: form.province },
    { 字段: '高考年份', 值: form.examYear ?? '' },
    { 字段: '批次', 值: form.batchSegment ?? form.batchType },
    { 字段: '科类', 值: form.subjectType },
    { 字段: '选考科目', 值: form.subjects.join('、') },
    { 字段: '分数', 值: form.score ?? '' },
    { 字段: '位次', 值: form.rank },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), '考生信息')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '志愿清单')
  const fname = `${schemeName || '志愿方案'}_${form.examYear ?? ''}_${form.rank}.xlsx`
  XLSX.writeFile(wb, fname.replace(/[/\\?*|:]/g, '_'))
}

export function buildVolunteerExportHtml(
  items: VolunteerItem[],
  form: VolunteerFormInput,
  schemeName?: string,
): string {
  const tiers = ['冲', '稳', '保'] as const
  const grouped = tiers.map((t) => ({
    tier: t,
    list: items.filter((i) => i.tierLabel === t),
  }))

  const tierHtml = grouped
    .filter((g) => g.list.length)
    .map(
      (g) => `
      <h3 style="margin:16px 0 8px;color:#333">${g.tier}档（${g.list.length}）</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f1f5f9">
          <th>#</th><th>院校</th><th>专业</th><th>概率</th><th>预测位次</th><th>选科</th>
        </tr></thead>
        <tbody>
          ${g.list
            .map(
              (item) => `<tr>
            <td>${item.sortOrder}</td>
            <td>${item.collegeName}</td>
            <td>${item.majorName}</td>
            <td>${item.probability != null ? `${(item.probability * 100).toFixed(1)}%` : '—'}</td>
            <td>${item.predictedRank?.toLocaleString() ?? '—'}</td>
            <td>${item.subjectRequirement ?? '—'}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>`,
    )
    .join('')

  return `
    <div style="font-family:system-ui,sans-serif;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 12px">${schemeName || '高考志愿方案'}</h1>
      <p style="color:#555;font-size:13px;margin:0 0 16px">
        ${form.province} · ${form.examYear ?? ''}年 · ${form.batchSegment ?? form.batchType} ·
        ${form.subjectType} · 位次 ${form.rank.toLocaleString()} ·
        选考 ${form.subjects.join('、')}
      </p>
      ${tierHtml}
    </div>
  `
}

export async function exportVolunteerSchemePdf(
  items: VolunteerItem[],
  form: VolunteerFormInput,
  schemeName?: string,
) {
  const container = document.createElement('div')
  container.innerHTML = buildVolunteerExportHtml(items, form, schemeName)
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.width = '800px'
  container.style.background = '#fff'
  document.body.appendChild(container)
  try {
    const fname = `${schemeName || '志愿方案'}_${form.examYear ?? ''}.pdf`
    await exportToPdf(container, fname.replace(/[/\\?*|:]/g, '_'))
  } finally {
    document.body.removeChild(container)
  }
}
