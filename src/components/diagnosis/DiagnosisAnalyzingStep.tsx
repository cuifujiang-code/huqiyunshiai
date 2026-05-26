import { ANALYSIS_STEPS } from '../../types/diagnosis'

interface Props {
  message?: string
  hasImage?: boolean
  mode?: 'ocr' | 'diagnosis'
}

export default function DiagnosisAnalyzingStep({ message, hasImage, mode = 'diagnosis' }: Props) {
  const ocrSteps = [
    '正在加载 OCR 识别引擎...',
    '正在逐页识别试卷文字...',
    '识别完成后将展示文字供您确认',
  ]
  const diagnosisSteps = hasImage
    ? ['正在分析 OCR 识别文本...', ...ANALYSIS_STEPS]
    : ANALYSIS_STEPS
  const steps = mode === 'ocr' ? ocrSteps : diagnosisSteps

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
