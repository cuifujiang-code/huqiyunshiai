import { useMemo } from 'react'
import { Radar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import type { AbilityDimension } from '../../types/planning'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

interface Props {
  dimensions: AbilityDimension[]
  height?: number
}

export default function PlanningSummaryRadarChart({ dimensions, height = 260 }: Props) {
  const chartData = useMemo(
    () => ({
      labels: dimensions.map((d) => d.label),
      datasets: [
        {
          label: '综合画像',
          data: dimensions.map((d) => d.score),
          backgroundColor: 'rgba(59, 130, 246, 0.35)',
          borderColor: 'rgb(96, 165, 250)',
          borderWidth: 2,
          pointBackgroundColor: '#67e8f9',
          pointBorderColor: '#0f172a',
          pointRadius: 4,
        },
      ],
    }),
    [dimensions],
  )

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, display: false },
          grid: { color: 'rgba(96, 165, 250, 0.15)' },
          angleLines: { color: 'rgba(96, 165, 250, 0.15)' },
          pointLabels: {
            color: '#94a3b8',
            font: { size: 11 },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { r: number } }) => ` ${ctx.parsed.r} 分`,
          },
        },
      },
    }),
    [],
  )

  return (
    <div style={{ height }} className="w-full max-w-[320px] mx-auto">
      <Radar data={chartData} options={options} />
    </div>
  )
}
