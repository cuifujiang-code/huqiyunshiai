import { ANALYSIS_STEPS } from '../../types/diagnosis'

interface Props {
  message?: string
  hasImage?: boolean
  mode?: 'prepare' | 'ocr' | 'diagnosis' | 'async'
}

export default function DiagnosisAnalyzingStep({ message, hasImage, mode = 'diagnosis' }: Props) {
  const prepareSteps = [
    '正在解析试卷...',
    '正在识别答题卡（阿里云手写 OCR）...',
    '即将展示识别结果供您确认',
  ]
  const asyncSteps = [
    '正在解析试卷（Word/PDF）...',
    '正在识别手写答题卡（阿里云 OCR）...',
    '正在 AI 对比分析并生成诊断报告...',
    '预计需要 20-40 秒，请勿关闭页面',
  ]
  const diagnosisSteps = hasImage
    ? ['正在AI对比分析试卷与答题卡...', ...ANALYSIS_STEPS]
    : ANALYSIS_STEPS
  const steps =
    mode === 'prepare' ? prepareSteps : mode === 'async' ? asyncSteps : diagnosisSteps

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
