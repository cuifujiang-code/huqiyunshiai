import type { BankQuestion, BookChapter } from '../types/teacher'

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** 按知识点自动归类为章节 */
export function groupQuestionsIntoChapters(questions: BankQuestion[]): BookChapter[] {
  const groups = new Map<string, BankQuestion[]>()
  for (const q of questions) {
    const kp = (q.knowledge_point || '综合练习').trim()
    if (!groups.has(kp)) groups.set(kp, [])
    groups.get(kp)!.push(q)
  }

  let chIdx = 0
  return Array.from(groups.entries()).map(([kp, qs]) => {
    chIdx += 1
    return {
      id: newId('ch'),
      title: `第${chIdx}章 ${kp}`,
      sections: [
        {
          id: newId('sec'),
          title: kp,
          blocks: qs.map((q, i) => ({
            id: newId('blk'),
            type: 'exercise' as const,
            title: `${q.question_type || '练习'} ${i + 1}`,
            content: q.content || '',
            questionId: q.id,
          })),
        },
      ],
    }
  })
}
