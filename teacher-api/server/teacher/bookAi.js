import { callDeepSeekAI, extractJson } from '../deepseekClient.js'

/**
 * 根据题目列表生成知识网络图
 */
export async function generateKnowledgeGraph(questions = []) {
  const summary = questions.slice(0, 40).map((q, i) => ({
    index: i + 1,
    knowledge_point: q.knowledge_point || '未分类',
    question_type: q.question_type || '',
    snippet: String(q.content || '').slice(0, 120),
  }))

  const prompt = `你是 K12 学科知识图谱专家。根据以下题目信息，生成知识点关联网络。
要求：
1. nodes 5-12 个，label 为知识点名称
2. edges 表示前置/包含/关联关系，from/to 为 node 的 id
3. 只输出 JSON

题目数据：
${JSON.stringify(summary)}`

  const raw = await callDeepSeekAI('只输出 JSON，不要 markdown', prompt)
  const parsed = JSON.parse(extractJson(raw))

  const nodes = Array.isArray(parsed.nodes)
    ? parsed.nodes.map((n, i) => ({
        id: String(n.id ?? `n${i}`),
        label: String(n.label ?? n.name ?? `知识点${i + 1}`),
      }))
    : []

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = Array.isArray(parsed.edges)
    ? parsed.edges
        .filter((e) => nodeIds.has(String(e.from)) && nodeIds.has(String(e.to)))
        .map((e) => ({
          from: String(e.from),
          to: String(e.to),
          label: e.label ? String(e.label) : undefined,
        }))
    : []

  return { nodes, edges }
}

export function groupQuestionsIntoChapters(questions) {
  const groups = new Map()
  for (const q of questions) {
    const kp = (q.knowledge_point || '综合练习').trim()
    if (!groups.has(kp)) groups.set(kp, [])
    groups.get(kp).push(q)
  }

  let chIdx = 0
  return Array.from(groups.entries()).map(([kp, qs]) => {
    chIdx += 1
    return {
      id: `ch-auto-${chIdx}`,
      title: `第${chIdx}章 ${kp}`,
      sections: [
        {
          id: `sec-auto-${chIdx}`,
          title: kp,
          blocks: qs.map((q, i) => ({
            id: `blk-${q.id || i}`,
            type: 'exercise',
            title: `${q.question_type || '练习'} · ${i + 1}`,
            content: q.content || '',
            questionId: q.id,
          })),
        },
      ],
    }
  })
}
