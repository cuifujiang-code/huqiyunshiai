/** @deprecated 请使用 topicTaxonomy/index.js */
export {
  enrichTopicFields as enrichMathTopicFields,
  matchQuestionToTopic,
  resolveQuestionTopic,
  questionMatchesTopicFilter,
  buildGroupedTopicStats,
  normalizeTopicTags as normalizeMathTags,
} from './topicTaxonomy/index.js'

import { TAXONOMY_REGISTRY } from './topicTaxonomy/registry.js'

/** 兼容旧代码：高中数学（高三复习版） */
export const MATH_TOPIC_TAXONOMY = TAXONOMY_REGISTRY['高三|数学'] || []

export function isStandardMathTag(tag) {
  const tags = new Set(MATH_TOPIC_TAXONOMY.flatMap((g) => g.tags))
  return tags.has(tag)
}

export function getAllStandardTags() {
  return [...new Set(MATH_TOPIC_TAXONOMY.flatMap((g) => g.tags))]
}
