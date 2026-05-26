import type { AbilityDimension } from '../../types/planning'

interface Props {
  dimensions: AbilityDimension[]
  size?: number
}

export default function RadarChart({ dimensions, size = 220 }: Props) {
  const center = size / 2
  const radius = size * 0.36
  const count = dimensions.length || 6
  const angleStep = (Math.PI * 2) / count

  const pointAt = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2
    const r = (value / 100) * radius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  const gridLevels = [0.25, 0.5, 0.75, 1]

  const dataPoints = dimensions.map((d, i) => pointAt(i, d.score))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[260px]" role="img" aria-label="能力雷达图">
      {gridLevels.map((level) => {
        const pts = Array.from({ length: count }, (_, i) => pointAt(i, level * 100))
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        return (
          <path key={level} d={path} fill="none" stroke="rgba(96,165,250,0.2)" strokeWidth="1" />
        )
      })}

      {dimensions.map((d, i) => {
        const outer = pointAt(i, 100)
        return (
          <line
            key={d.label}
            x1={center}
            y1={center}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(96,165,250,0.15)"
            strokeWidth="1"
          />
        )
      })}

      <path d={dataPath} fill="rgba(59,130,246,0.35)" stroke="rgb(96,165,250)" strokeWidth="2" />

      {dataPoints.map((p, i) => (
        <circle key={dimensions[i].label} cx={p.x} cy={p.y} r="3.5" fill="#67e8f9" />
      ))}

      {dimensions.map((d, i) => {
        const labelPos = pointAt(i, 118)
        return (
          <text
            key={`label-${d.label}`}
            x={labelPos.x}
            y={labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-300 text-[9px]"
          >
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}
