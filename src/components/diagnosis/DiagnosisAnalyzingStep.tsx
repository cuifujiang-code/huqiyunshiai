import { useEffect, useState } from 'react'
import { ANALYSIS_STEPS } from '../../types/diagnosis'

interface Props {
  onComplete: () => void
  /** 加载总时长（毫秒），默认 2000 */
  durationMs?: number
}

export default function DiagnosisAnalyzingStep({ onComplete, durationMs = 2000 }: Props) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const stepInterval = durationMs / ANALYSIS_STEPS.length
    const timers: number[] = []

    ANALYSIS_STEPS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStepIndex(i), i * stepInterval))
    })
    timers.push(window.setTimeout(onComplete, durationMs))

    return () => timers.forEach(clearTimeout)
  }, [onComplete, durationMs])

  return <AnalyzingContent stepIndex={stepIndex} />
}

function AnalyzingContent({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-400" />
      <p className="mt-8 text-lg font-medium text-blue-100">AI正在分析你的学习数据...</p>
      <div className="mt-6 space-y-3 text-center">
        {ANALYSIS_STEPS.map((text, i) => (
          <p
            key={text}
            className={`text-sm transition-all duration-300 ${
              i === stepIndex ? 'font-medium text-cyan-300' : i < stepIndex ? 'text-slate-500' : 'text-slate-600'
            }`}
          >
            {i <= stepIndex ? '✓ ' : '· '}
            {text}
          </p>
        ))}
      </div>
    </div>
  )
}
