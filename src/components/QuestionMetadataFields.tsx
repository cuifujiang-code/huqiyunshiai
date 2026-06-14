import type { BankQuestion } from '../types/teacher'
import {
  ABILITY_DIMENSIONS,
  DIFFICULTIES,
  QUESTION_SOURCE_EXAMPLES,
  SUITABLE_STAGES,
  inputClass,
} from '../types/teacher'
import KnowledgePointTreeSelector from './knowledge/KnowledgePointTreeSelector'

interface Props {
  draft: BankQuestion
  onChange: (patch: Partial<BankQuestion>) => void
  disabled?: boolean
}

export default function QuestionMetadataFields({ draft, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">题源/出处</span>
          <input
            className={inputClass}
            list="question-source-examples"
            placeholder="如：2024年高考数学全国卷I"
            value={draft.source ?? ''}
            onChange={(e) => onChange({ source: e.target.value })}
            disabled={disabled}
          />
          <datalist id="question-source-examples">
            {QUESTION_SOURCE_EXAMPLES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">能力维度</span>
          <select
            className={inputClass}
            value={draft.ability_dimension ?? ''}
            onChange={(e) => onChange({ ability_dimension: e.target.value })}
            disabled={disabled}
          >
            <option value="">请选择</option>
            {ABILITY_DIMENSIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">教材版本</span>
          <select
            className={inputClass}
            value={draft.textbook_version ?? ''}
            onChange={(e) => onChange({ textbook_version: e.target.value })}
            disabled={disabled}
          >
            <option value="">请选择</option>
            {TEXTBOOK_VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">适用阶段</span>
          <select
            className={inputClass}
            value={draft.suitable_stage ?? ''}
            onChange={(e) => onChange({ suitable_stage: e.target.value })}
            disabled={disabled}
          >
            <option value="">请选择</option>
            {SUITABLE_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8A94A9]">预估答题时间（秒）</span>
          <input
            type="number"
            min={0}
            className={inputClass}
            placeholder="如：300"
            value={draft.estimated_time ?? ''}
            onChange={(e) => onChange({
              estimated_time: e.target.value === '' ? undefined : Number(e.target.value),
            })}
            disabled={disabled}
          />
        </label>
      </div>

      <KnowledgePointTreeSelector
        subject={draft.subject}
        grade={draft.grade}
        value={draft.knowledge_point_ids ?? []}
        onChange={(ids) => onChange({ knowledge_point_ids: ids })}
        disabled={disabled}
      />
    </div>
  )
}
