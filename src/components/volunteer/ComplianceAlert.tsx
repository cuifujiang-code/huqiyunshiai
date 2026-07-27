import type { ComplianceIssue } from '../../types/volunteer'

interface ComplianceAlertProps {
  issues?: ComplianceIssue[]
  className?: string
}

export default function ComplianceAlert({ issues = [], className = '' }: ComplianceAlertProps) {
  if (!issues.length) return null

  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  return (
    <div className={`space-y-2 ${className}`}>
      {errors.length > 0 && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-rose-300">填报不合规</p>
          <ul className="space-y-1 text-sm text-rose-100/90">
            {errors.map((e) => (
              <li key={e.code + e.message}>• {e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-amber-300">请注意</p>
          <ul className="space-y-1 text-sm text-amber-100/90">
            {warnings.map((w) => (
              <li key={w.code + w.message}>• {w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
