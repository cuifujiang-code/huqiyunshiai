import { ANALYSIS_STEPS } from '../../types/diagnosis'

interface Props {
  message?: string
  hasImage?: boolean
}

export default function DiagnosisAnalyzingStep({ message, hasImage }: Props) {
  const steps = hasImage
    ? ['正在上传试卷图片...', '正在识别题目与得分...', ...ANALYSIS_STEPS]
    : ANALYSIS_STEPS

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 opacity-0 animate-[fadeIn_0.5s_ease_forwards]">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-400" />
      <p className="mt-8 text-lg font-medium text-blue-100">
        {message ?? 'AI正在分析你的学习数据...'}
      </p>
      <div className="mt-6 max-w-md space-y-2 text-center">
        {steps.map((text) => (
          <p key={text} className="text-sm text-slate-500">
            · {text}
          </p>
        ))}
      </div>
    </div>
  )
}
