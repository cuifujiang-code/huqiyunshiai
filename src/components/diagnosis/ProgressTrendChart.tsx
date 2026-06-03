import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { DiagnosisHistoryItem } from '../../types/diagnosis'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  history: DiagnosisHistoryItem[]
}

export default function ProgressTrendChart({ history }: Props) {
  const data = useMemo(() => {
    const sorted = [...history].sort(
      (a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
    )
    const labels = sorted.map((h) => `${h.examType}\n${new Date(h.generatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`)
    const scores = sorted.map((h) => h.score)
    const percentiles = sorted.map((h) => h.percentile)
    const ranks = sorted.map((h) => h.gradeRank ?? null)

    return {
      labels,
      datasets: [
        {
          label: '得分',
          data: scores,
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34, 211, 238, 0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: '#22d3ee',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          yAxisID: 'y',
        },
        {
          label: '百分位 (%)',
          data: percentiles,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167, 139, 250, 0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#a78bfa',
          pointBorderColor: '#0f172a',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          yAxisID: 'y1',
          borderDash: [5, 3],
        },
        ...(ranks.some((r) => r != null)
          ? [
              {
                label: '年级排名',
                data: ranks,
                borderColor: '#f472b6',
                backgroundColor: 'rgba(244, 114, 182, 0.05)',
                fill: false,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: '#f472b6',
                pointBorderColor: '#0f172a',
                pointBorderWidth: 2,
                yAxisID: 'y2',
                borderDash: [8, 4],
              },
            ]
          : []),
      ],
    }
  }, [history])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: '#94a3b8', usePointStyle: true, padding: 20, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(34, 211, 238, 0.3)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 10 } },
          grid: { color: 'rgba(51, 65, 85, 0.4)' },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: { display: true, text: '得分', color: '#22d3ee' },
          ticks: { color: '#22d3ee' },
          grid: { color: 'rgba(51, 65, 85, 0.4)' },
          min: 0,
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          title: { display: true, text: '百分位 (%)', color: '#a78bfa' },
          ticks: { color: '#a78bfa' },
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100,
        },
        y2: {
          type: 'linear' as const,
          display: false,
          position: 'right' as const,
          grid: { drawOnChartArea: false },
          reverse: true,
        },
      },
    }),
    [],
  )

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 text-center">
        <h3 className="mb-2 text-sm font-semibold text-blue-100">进步趋势图</h3>
        <p className="text-xs text-slate-500">完成更多诊断后可查看趋势变化</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
      <h3 className="mb-1 text-sm font-semibold text-blue-100">进步趋势图</h3>
      <p className="mb-4 text-xs text-slate-500">
        近 {history.length} 次诊断 · 得分与年级排名变化
      </p>
      <div className="h-64 w-full">
        <Line data={data} options={options} />
      </div>
      {history.length >= 2 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
          <span>
            首考 {history[0].score} 分 → 末考{' '}
            <strong className="text-cyan-300">{history[history.length - 1].score} 分</strong>
          </span>
          <span className="text-cyan-500">
            {history[history.length - 1].score - history[0].score >= 0 ? '↑' : '↓'}{' '}
            {Math.abs(history[history.length - 1].score - history[0].score)} 分
          </span>
        </div>
      )}
    </div>
  )
}
