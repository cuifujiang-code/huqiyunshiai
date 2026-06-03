/**
 * 规划方案打印视图 — 通过 window.print() 生成排版美观的 PDF 报告
 *
 * 使用方式：调用 printPlanningReport(record) 即可打开打印窗口
 * 报告包含：学生姓名、路线名称、阶段任务清单、进度统计、甘特图
 */
import type { SavedPlanningRecord, PhaseTaskGroup, GanttTask } from '../../types/planning'

const PLAN_ROUTE_NAMES: Record<string, string> = {
  zhongkao: '常规中考',
  gaokao: '浙江新高考3+3',
  qiangji: '强基计划',
  jingsai: '五大学科竞赛',
  yishu: '艺术特长',
  keji: '科技特长',
  gongfei: '公费师范',
}

/** 从规划记录推测路线名称 */
function guessRouteName(record: SavedPlanningRecord): string {
  const title = record.report.title || ''
  for (const [code, name] of Object.entries(PLAN_ROUTE_NAMES)) {
    if (title.includes(name)) return `${name}（${code}）`
  }
  const goalDirs = record.form.goalDirections || record.report.studentProfile?.goalDirections || []
  return goalDirs.length > 0 ? goalDirs.join(' / ') : '自定义路线'
}

/** 从阶段任务构建甘特图数据 */
function buildGanttFromPhases(phaseTasks: PhaseTaskGroup[]): GanttTask[] {
  const colors = ['#1e40af', '#7e22ce', '#be185d', '#047857', '#b45309', '#2563eb']
  const now = new Date()
  const tasks: GanttTask[] = []
  phaseTasks.forEach((phase, pi) => {
    const phaseName = phase.phase || `阶段${pi + 1}`
    const totalDays = phase.days || 30
    const phaseStart = new Date(now)
    phaseStart.setDate(phaseStart.getDate() + pi * totalDays)
    const phaseEnd = new Date(phaseStart)
    phaseEnd.setDate(phaseEnd.getDate() + totalDays)
    const phaseTaskList = phase.tasks || []
    if (phaseTaskList.length === 0) {
      tasks.push({
        id: `print_phase_${pi}`,
        name: phaseName,
        phase: phaseName,
        startDate: phaseStart.toISOString().split('T')[0],
        endDate: phaseEnd.toISOString().split('T')[0],
        completed: false,
        color: colors[pi % colors.length],
      })
    } else {
      phaseTaskList.forEach((t, ti) => {
        const name = typeof t === 'string' ? t : t.name
        const taskStart = new Date(phaseStart)
        taskStart.setDate(taskStart.getDate() + ti * Math.max(1, Math.floor(totalDays / phaseTaskList.length)))
        const taskEnd = new Date(taskStart)
        taskEnd.setDate(taskEnd.getDate() + Math.max(1, Math.floor(totalDays / phaseTaskList.length)))
        tasks.push({
          id: `print_${pi}_${ti}`,
          name,
          phase: phaseName,
          startDate: taskStart.toISOString().split('T')[0],
          endDate: taskEnd.toISOString().split('T')[0],
          completed: false,
          color: colors[pi % colors.length],
        })
      })
    }
  })
  return tasks
}

/** 格式化日期为 YYYY-MM-DD */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return iso.slice(0, 10)
  }
}

/** 打开规划报告打印窗口 */
export function printPlanningReport(record: SavedPlanningRecord, checklistProgress?: Record<string, boolean>) {
  const { form, report } = record
  const studentName = form.studentName || report.studentProfile?.name || '未命名学生'
  const planTitle = report.title || '教育规划方案'
  const routeName = guessRouteName(record)
  const phaseTasks = report.phaseTasks || []
  const ganttTasks = buildGanttFromPhases(phaseTasks)

  // 统计进度
  let totalTasks = 0
  let completedTasks = 0
  phaseTasks.forEach((phase, pi) => {
    const taskList = phase.tasks || []
    taskList.forEach((_, ti) => {
      totalTasks++
      if (checklistProgress?.[`${pi}_${ti}`]) completedTasks++
    })
  })
  const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  // 甘特图数据：计算整体时间范围
  const ganttStartDates = ganttTasks.map((t) => new Date(t.startDate).getTime())
  const ganttEndDates = ganttTasks.map((t) => new Date(t.endDate).getTime())
  const ganttMin = Math.min(...ganttStartDates)
  const ganttMax = Math.max(...ganttEndDates)
  const ganttRange = Math.max(ganttMax - ganttMin, 86400000)

  // 里程碑
  const milestones = report.milestones || []

  const printHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>${planTitle} - 规划报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "PingFang SC","Microsoft YaHei","SimHei",sans-serif; color: #1a1a2e; line-height: 1.7; font-size: 11pt; }
  @page { size: A4; margin: 15mm 12mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  .report-header { text-align: center; border-bottom: 3px solid #1e3a5f; padding-bottom: 16px; margin-bottom: 24px; }
  .report-header h1 { font-size: 22pt; color: #1e3a5f; margin-bottom: 6px; letter-spacing: 2px; }
  .report-header .meta { font-size: 10pt; color: #64748b; }
  .report-header .meta span { margin: 0 10px; }

  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title { font-size: 14pt; font-weight: 700; color: #1e3a5f; border-left: 4px solid #2563eb; padding-left: 10px; margin-bottom: 10px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .info-item { display: flex; }
  .info-label { color: #64748b; min-width: 60px; font-size: 10pt; }
  .info-value { color: #1a1a2e; font-weight: 500; }

  .stats-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .stat-card { flex: 1; text-align: center; padding: 12px 8px; border-radius: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; }
  .stat-card .number { font-size: 22pt; font-weight: 800; }
  .stat-card .label { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .stat-card.green .number { color: #16a34a; }
  .stat-card.blue .number { color: #2563eb; }
  .stat-card.amber .number { color: #d97706; }

  .progress-bar-wrap { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin: 8px 0; }
  .progress-bar-fill { height: 100%; border-radius: 5px; transition: width 0.3s; }

  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }

  .phase-block { margin-bottom: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .phase-header { background: #f1f5f9; padding: 8px 12px; font-weight: 700; font-size: 11pt; color: #1e3a5f; }
  .phase-body { padding: 6px 12px; }
  .task-row { display: flex; align-items: center; padding: 4px 0; border-bottom: 1px dotted #e2e8f0; gap: 8px; }
  .task-row:last-child { border-bottom: none; }
  .task-check { width: 14px; height: 14px; border: 2px solid #94a3b8; border-radius: 3px; flex-shrink: 0; }
  .task-check.done { background: #16a34a; border-color: #16a34a; position: relative; }
  .task-check.done::after { content: '✓'; color: #fff; font-size: 9px; position: absolute; top: -2px; left: 1px; }

  .gantt-chart { position: relative; }
  .gantt-bar { position: relative; height: 22px; border-radius: 4px; margin-bottom: 3px; display: flex; align-items: center; padding: 0 6px; font-size: 8pt; color: #fff; white-space: nowrap; overflow: hidden; }
  .gantt-labels { display: flex; font-size: 8pt; color: #64748b; margin-bottom: 4px; }
  .gantt-labels span { flex: 1; text-align: center; }

  .milestone-table td:first-child { white-space: nowrap; font-weight: 500; }

  .footer { margin-top: 30px; text-align: center; font-size: 9pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
</style></head>
<body>
<div class="report-header">
  <h1>${planTitle}</h1>
  <div class="meta">
    <span>学生：${studentName}</span>
    <span>路线：${routeName}</span>
    <span>生成时间：${fmtDate(record.createdAt)}</span>
  </div>
</div>

<div class="section">
  <div class="section-title">学生基本信息</div>
  <div class="info-grid">
    <div class="info-item"><span class="info-label">姓名</span><span class="info-value">${studentName}</span></div>
    <div class="info-item"><span class="info-label">年级</span><span class="info-value">${form.grade || report.studentProfile?.grade || '-'}</span></div>
    <div class="info-item"><span class="info-label">成绩水平</span><span class="info-value">${form.scoreLevel || report.studentProfile?.scoreLevel || '-'}</span></div>
    <div class="info-item"><span class="info-label">升学目标</span><span class="info-value">${(form.goalDirections || report.studentProfile?.goalDirections || []).join('、') || '-'}</span></div>
    <div class="info-item"><span class="info-label">兴趣方向</span><span class="info-value">${(form.interests || report.studentProfile?.interests || []).join('、') || '-'}</span></div>
    <div class="info-item"><span class="info-label">创建方</span><span class="info-value">${record.createdBy === 'teacher' ? '教师' : '学生自行创建'}</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">进度统计</div>
  <div class="stats-row">
    <div class="stat-card blue"><div class="number">${totalTasks}</div><div class="label">任务总数</div></div>
    <div class="stat-card green"><div class="number">${completedTasks}</div><div class="label">已完成</div></div>
    <div class="stat-card ${rate >= 60 ? 'green' : rate >= 30 ? 'amber' : ''}"><div class="number" style="color:${rate >= 60 ? '#16a34a' : rate >= 30 ? '#d97706' : '#dc2626'}">${rate}%</div><div class="label">完成率</div></div>
  </div>
  <div class="progress-bar-wrap">
    <div class="progress-bar-fill" style="width:${rate}%;background:${rate >= 60 ? '#16a34a' : rate >= 30 ? '#d97706' : '#dc2626'}"></div>
  </div>
</div>

<div class="section">
  <div class="section-title">阶段任务清单</div>
  ${phaseTasks.map((phase, pi) => `
  <div class="phase-block">
    <div class="phase-header">${phase.phase || `阶段${pi + 1}`}${phase.days ? `（${phase.days}天）` : ''}</div>
    <div class="phase-body">
      ${(phase.tasks || []).map((t, ti) => {
        const name = typeof t === 'string' ? t : t.name
        const isComplete = checklistProgress?.[`${pi}_${ti}`] || false
        return `<div class="task-row">
          <div class="task-check ${isComplete ? 'done' : ''}"></div>
          <span>${name}</span>
          ${typeof t !== 'string' && t.criteria ? `<span style="color:#64748b;font-size:9pt">— ${t.criteria}</span>` : ''}
        </div>`
      }).join('')}
    </div>
  </div>`).join('')}
</div>

<div class="section">
  <div class="section-title">甘特图（时间规划）</div>
  <div class="gantt-chart">
    <div class="gantt-labels">
      ${ganttTasks.slice(0, 8).map((_, i, arr) => {
        const d = new Date(ganttMin + (ganttRange / arr.length) * i)
        return `<span>${d.getMonth() + 1}/${d.getDate()}</span>`
      }).join('')}
    </div>
    ${ganttTasks.map((t) => {
      const startMs = new Date(t.startDate).getTime()
      const endMs = new Date(t.endDate).getTime()
      const leftPct = Math.max(0, ((startMs - ganttMin) / ganttRange) * 100).toFixed(1)
      const widthPct = Math.max(1, ((endMs - startMs) / ganttRange) * 100).toFixed(1)
      return `<div class="gantt-bar" style="margin-left:${leftPct}%;width:${widthPct}%;background:${t.color}">
        ${t.phase} · ${t.name}
      </div>`
    }).join('')}
  </div>
</div>

${milestones.length > 0 ? `
<div class="section">
  <div class="section-title">重要里程碑</div>
  <table class="milestone-table">
    <thead><tr><th>日期</th><th>里程碑</th><th>准备建议</th></tr></thead>
    <tbody>
      ${milestones.map((m) => `
      <tr>
        <td>${m.date}</td>
        <td>${m.event}</td>
        <td>${m.preparationAdvice || '-'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<div class="footer">
  <p>由华祺云师 · AI教育规划引擎生成 | 生成时间：${fmtDate(report.generatedAt || record.createdAt)}</p>
  <p>本报告仅供教育规划参考，具体执行请结合实际情况调整</p>
</div>

<script>
  // 页面加载后自动触发打印
  window.onload = function() {
    setTimeout(function() {
      window.print();
    }, 300);
  }
<` + `/script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('请允许弹出窗口以导出 PDF')
    return
  }
  w.document.write(printHtml)
  w.document.close()
}
