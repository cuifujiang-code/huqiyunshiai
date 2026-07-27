import { useCallback, useEffect, useState } from 'react'
import { convertScoreRank } from '../../lib/volunteerApi'
import type { HistoricalSameRankScore, ScoreRankConvertResult } from '../../types/volunteer'

export interface ScoreRankMeta {
  sectionNum?: number
  rankPercent?: number
  totalStudent?: number
  dataSource?: string
  historicalSameRankScores?: HistoricalSameRankScore[]
}

interface ScoreRankLinkedInputProps {
  score?: number
  rank: number
  examYear?: number
  subjectType: string
  batchSegment?: string
  province?: string
  onScoreChange: (score?: number) => void
  onRankChange: (rank: number) => void
  onMetaChange?: (meta: ScoreRankMeta | null) => void
  disabled?: boolean
}

export default function ScoreRankLinkedInput({
  score,
  rank,
  examYear,
  subjectType,
  batchSegment,
  province = '浙江',
  onScoreChange,
  onRankChange,
  onMetaChange,
  disabled,
}: ScoreRankLinkedInputProps) {
  const [syncing, setSyncing] = useState<'score' | 'rank' | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [meta, setMeta] = useState<ScoreRankMeta | null>(null)

  const applyResult = useCallback(
    (res: ScoreRankConvertResult) => {
      if (!res.success) {
        setHint(res.message || '换算失败')
        setMeta(null)
        onMetaChange?.(null)
        return
      }
      const next: ScoreRankMeta = {
        sectionNum: res.sectionNum,
        rankPercent: res.rankPercent,
        totalStudent: res.totalStudent,
        dataSource: res.dataSource,
        historicalSameRankScores: res.historicalSameRankScores,
      }
      setMeta(next)
      onMetaChange?.(next)
      if (res.dataSource === 'zhejiang_score_rank') {
        setHint(null)
      } else if (res.message) {
        setHint(res.message)
      }
    },
    [onMetaChange],
  )

  const syncFromScore = useCallback(async () => {
    if (score == null || score <= 0) return
    setSyncing('score')
    setHint(null)
    try {
      const res = await convertScoreRank({
        score,
        examYear,
        subjectType,
        batchSegment,
        province,
      })
      if (res.success && res.rank != null) {
        onRankChange(res.rank)
        applyResult(res)
      } else {
        setHint(res.message || '位次换算失败')
        setMeta(null)
        onMetaChange?.(null)
      }
    } catch {
      setHint('网络异常，请稍后重试')
    } finally {
      setSyncing(null)
    }
  }, [score, examYear, subjectType, batchSegment, province, onRankChange, applyResult, onMetaChange])

  const syncFromRank = useCallback(async () => {
    if (!rank || rank <= 0) return
    setSyncing('rank')
    setHint(null)
    try {
      const res = await convertScoreRank({
        rank,
        examYear,
        subjectType,
        batchSegment,
        province,
      })
      if (res.success && res.score != null) {
        onScoreChange(res.score)
        applyResult(res)
      } else {
        setHint(res.message || '分数换算失败')
        setMeta(null)
        onMetaChange?.(null)
      }
    } catch {
      setHint('网络异常，请稍后重试')
    } finally {
      setSyncing(null)
    }
  }, [rank, examYear, subjectType, batchSegment, province, onScoreChange, applyResult, onMetaChange])

  useEffect(() => {
    if (province !== '浙江' || !rank || rank <= 0) return
    const t = setTimeout(() => {
      convertScoreRank({ rank, examYear, subjectType, batchSegment, province })
        .then(applyResult)
        .catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [rank, examYear, subjectType, batchSegment, province, applyResult])

  const pct = (v?: number) => (v != null ? `${(v * 100).toFixed(2)}%` : '—')

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-slate-300">高考分数</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={score ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onScoreChange(e.target.value ? Number(e.target.value) : undefined)
              }
              onBlur={() => {
                if (province === '浙江' && score) syncFromScore()
              }}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white disabled:opacity-50"
              placeholder="输入后自动换算"
            />
            <button
              type="button"
              disabled={disabled || syncing != null || score == null}
              onClick={syncFromScore}
              title="根据分数查位次"
              className="shrink-0 rounded-lg border border-cyan-600/50 bg-cyan-950/40 px-2 text-xs text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-40"
            >
              {syncing === 'score' ? '…' : '→位次'}
            </button>
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-slate-300">省排位次 *</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={rank}
              disabled={disabled}
              onChange={(e) => onRankChange(Number(e.target.value))}
              onBlur={() => {
                if (province === '浙江' && rank > 0) syncFromRank()
              }}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white disabled:opacity-50"
              required
            />
            <button
              type="button"
              disabled={disabled || syncing != null || !rank}
              onClick={syncFromRank}
              title="根据位次查分数"
              className="shrink-0 rounded-lg border border-cyan-600/50 bg-cyan-950/40 px-2 text-xs text-cyan-200 hover:bg-cyan-900/40 disabled:opacity-40"
            >
              {syncing === 'rank' ? '…' : '→分数'}
            </button>
          </div>
        </label>
      </div>

      {syncing && (
        <p className="text-xs text-cyan-400/80">正在查询一分一段表…</p>
      )}

      {meta?.dataSource === 'zhejiang_score_rank' && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-300">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>同分人数 <strong className="text-cyan-200">{meta.sectionNum?.toLocaleString() ?? '—'}</strong></span>
            <span>位次占比 <strong className="text-cyan-200">{pct(meta.rankPercent)}</strong></span>
            <span>当年考生 <strong className="text-slate-200">{meta.totalStudent?.toLocaleString() ?? '—'}</strong></span>
          </div>
          {meta.historicalSameRankScores && meta.historicalSameRankScores.length > 0 && (
            <div className="mt-2 border-t border-white/5 pt-2">
              <span className="text-slate-500">历年同位次参考分数：</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {meta.historicalSameRankScores.map((h) => (
                  <span
                    key={h.examYear}
                    className="rounded bg-slate-700/60 px-2 py-0.5 text-slate-200"
                  >
                    {h.examYear}年 {h.score ?? '—'}分
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hint && (
        <p className="text-xs text-amber-400/90">{hint}</p>
      )}
    </div>
  )
}
