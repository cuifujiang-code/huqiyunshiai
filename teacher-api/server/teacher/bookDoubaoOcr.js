/**
 * 辅导书 OCR — 豆包视觉识别 + 结构化章节
 */
import { callDoubaoAI, isDoubaoConfigured } from '../doubaoClient.js'
import { extractJson } from '../deepseekClient.js'
import { repairJSON } from '../batch/jsonRepairEngine.js'
import { ocrPageImagesWithDoubao } from './handoutDoubaoOcr.js'
import { formatBookLayoutWithAi } from './bookFormatAi.js'

function requireDoubaoOcr() {
  if (!isDoubaoConfigured()) {
    throw new Error(
      '豆包 OCR 未就绪：请在 .env.local 配置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL（ep- 推理接入点 ID）',
    )
  }
}

function normalizeBookShape(data, meta = {}) {
  if (data && typeof data === 'object') {
    const obj = { ...data }
    if (!Array.isArray(obj.chapters) && Array.isArray(obj.modules)) {
      obj.chapters = null
    }
    return obj
  }
  throw new Error('辅导书结构化结果格式无效')
}

function fallbackBookFromOcr(ocrText, meta = {}) {
  return {
    version: '1.0',
    source: 'doubao-vision',
    title: meta.title || 'OCR 导入辅导书',
    grade: meta.grade || '',
    level: meta.level || '基础',
    rawText: ocrText,
  }
}

function parseStructureJson(raw, meta = {}) {
  try {
    return normalizeBookShape(JSON.parse(extractJson(raw)), meta)
  } catch (firstErr) {
    try {
      const repaired = repairJSON(raw)
      return normalizeBookShape(repaired, meta)
    } catch (repairErr) {
      console.warn('[bookOcr] JSON 结构化失败，使用 OCR 原文兜底', {
        first: firstErr instanceof Error ? firstErr.message : firstErr,
        repair: repairErr instanceof Error ? repairErr.message : repairErr,
      })
      return fallbackBookFromOcr(meta._ocrText || '', meta)
    }
  }
}

/** 将 OCR 文本结构化为辅导书 JSON */
export async function structureBookOcrToJson(ocrText, meta = {}) {
  requireDoubaoOcr()
  const prompt = `你是 K12 教辅辅导书整理专家。将以下豆包视觉 OCR 结果整理为辅导书 JSON。

元信息：${JSON.stringify({ title: meta.title, subject: meta.subject, grade: meta.grade, level: meta.level })}

OCR 原文（含 [题目]/[解答]/[板书] 标签与 LaTeX）：
${ocrText.slice(0, 14000)}

只输出 JSON（不要 markdown）：
{
  "version": "1.0",
  "source": "doubao-vision",
  "title": "辅导书书名",
  "grade": "年级",
  "level": "基础|提高|竞赛",
  "foreword": "前言（若 OCR 中有则提取，否则空字符串）",
  "epilogue": "后记（若 OCR 中有则提取，否则空字符串）",
  "chapters": [
    {
      "title": "第X章 章节名",
      "sections": [
        {
          "title": "第X节 小节名",
          "blocks": [
            {
              "type": "knowledge|example|exercise|summary",
              "title": "块标题",
              "content": "正文（保留 LaTeX 与区域标签）",
              "answer": "答案或空字符串",
              "hasAnswer": true
            }
          ]
        }
      ]
    }
  ]
}

规则：
- 按 OCR 中的章节/标题自然分段；若无明确章节则按「题目N」每题一节
- [板书]/知识点讲解 → type=knowledge
- [题目] 例题 → type=example；练习题 → type=exercise
- 章节总结 → type=summary
- 无答案则 hasAnswer=false
- content 必须用 $...$ 包裹行内公式，$$...$$ 包裹独立公式
- 保留 OCR 中的 [FIGURE:页码:x,y,w,h] 图形位置标记，不要删除或改写
- 保留 content 中已有的 <img> 图形标签
- [题目]、[解答] 标签单独成行；解答步骤之间换行
- JSON 字符串内的反斜杠必须写成双反斜杠（如 \\\\frac），确保输出合法 JSON`

  const raw = await callDoubaoAI('只输出合法 JSON，不要 markdown 包裹', prompt, {
    label: 'Doubao-Book-Structure',
    timeoutMs: 120000,
  })
  return parseStructureJson(raw, { ...meta, _ocrText: ocrText })
}

/** 完整 OCR 流程：图片 → 豆包识别 → 结构化 → AI 排版校准 */
export async function processBookOcrImages(pageImages, meta = {}) {
  if (!pageImages?.length) throw new Error('请提供 pageImages')
  const { ocrText, provider } = await ocrPageImagesWithDoubao(pageImages, { profile: 'book' })
  let bookJson = await structureBookOcrToJson(ocrText, meta)
  bookJson = { ...bookJson, ocrText }

  // 导入 bookImport 做初步转换后由 format 处理 — 在 ocrService 中调用 format
  return { ocrText, bookJson, provider, needsFormat: true }
}
