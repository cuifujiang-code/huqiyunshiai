import type { PhotoSearchResult } from '../../types/photoSearch'

interface Props {
  result: PhotoSearchResult
}

export default function PhotoSearchResultView({ result }: Props) {
  const fromBank = result.source === 'bank'

  return (
    <div className="space-y-5 rounded-2xl border border-blue-500/25 bg-slate-900/70 p-5">
      {fromBank && (
        <span className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
          题库标准答案
        </span>
      )}

      <section>
        <h3 className="text-sm font-medium text-slate-400">识别原文（OCR）</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{result.ocrText}</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-blue-200">原题</h3>
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-white">{result.question}</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-amber-200">答案</h3>
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-amber-50/95">{result.answer}</p>
      </section>

      <section>
        <h3 className="text-sm font-medium text-cyan-200">解析</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{result.analysis || '暂无解析'}</p>
      </section>

      {result.knowledgePoints.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-violet-200">相关知识点</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.knowledgePoints.map((kp) => (
              <span
                key={kp}
                className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-sm text-violet-200"
              >
                {kp}
              </span>
            ))}
          </div>
        </section>
      )}

      {result.isMockFallback && (
        <p className="text-xs text-amber-400/90">AI 服务未配置或不可用，仅展示有限结果。</p>
      )}
    </div>
  )
}
