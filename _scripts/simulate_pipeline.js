// 本地模拟完整拆题管线，诊断失败根因
// 测试文件：金丽衢十二校数学试卷.docx
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

// 动态导入 ES module
const batchPrompt = await import('../teacher-api/server/batch/batchPrompt.js');
const safeJson = await import('../teacher-api/server/batch/safeJson.js');
const deepseekClient = await import('../teacher-api/server/deepseekClient.js');

const { parseBatchSplitAiResponse, buildBatchSplitPrompt } = batchPrompt;
const { safeJsonParse } = safeJson;
const { extractJson } = deepseekClient;

async function main() {
  // Step 1: 解析 docx 文件
  console.log('=== Step 1: 解析 docx 文件 ===');
  
  // 使用资料库中的数学试卷
  const testFile = 'E:/华祺云师AI资料库/高中数学/高一/上学期/01_试卷/高一_上学期_综合_综合_试卷_v1.docx';
  
  let fileBuffer;
  try {
    fileBuffer = readFileSync(testFile);
    console.log(`测试文件: ${testFile}`);
    console.log(`文件大小: ${fileBuffer.length} bytes`);
  } catch (e) {
    console.error('文件不存在:', testFile, e.message);
    return;
  }
  
  // 用 mammoth 提取文本
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const fullText = result.value;
  console.log(`提取文本长度: ${fullText.length} 字符`);
  console.log(`文本预览 (前300字符): ${fullText.substring(0, 300)}`);
  
  // Step 2: 分块
  console.log('\n=== Step 2: 文本分块 ===');
  const MAX_CHUNK = 3000;
  const chunks = [];
  for (let i = 0; i < fullText.length; i += MAX_CHUNK) {
    chunks.push(fullText.substring(i, i + MAX_CHUNK));
  }
  console.log(`分块数: ${chunks.length}, 每块最大 ${MAX_CHUNK} 字符`);
  
  // Step 3: 对第一个分块构造 prompt
  console.log('\n=== Step 3: 构造 Prompt ===');
  const meta = { subject: '数学', grade: '高三' };
  const sortOffset = 0;
  const prompt = buildBatchSplitPrompt(chunks[0], meta, sortOffset);
  console.log(`Prompt 长度: ${prompt.length} 字符`);
  console.log(`System Prompt 长度: ${batchPrompt.BATCH_SYSTEM_PROMPT.length} 字符`);
  
  // Step 4: 模拟 AI 调用（用真实的 DeepSeek API）
  console.log('\n=== Step 4: 调用 AI ===');
  
  const apiKey = process.env.QINIUAI_API_KEY;
  const apiUrl = process.env.QINIUAI_API_URL || 'https://api.qnaigc.com/v1';
  const model = process.env.QINIUAI_MODEL || 'deepseek-v3';
  
  if (!apiKey) {
    console.error('没有 API Key，跳过 AI 调用');
    console.log('改为检查已有代码中的解析逻辑...');
    await dryRunDiagnostic();
    return;
  }
  
  console.log(`API: ${apiUrl}, Model: ${model}`);
  
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: batchPrompt.BATCH_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI API 错误 (${response.status}):`, errText.substring(0, 500));
    return;
  }
  
  const data = await response.json();
  const aiText = data.choices?.[0]?.message?.content || '';
  console.log(`AI 返回长度: ${aiText.length} 字符`);
  console.log(`AI 返回预览 (前500字符):\n${aiText.substring(0, 500)}`);
  
  // Step 5: 解析 AI 返回
  console.log('\n=== Step 5: 解析 AI 返回 ===');
  const parsed = await parseBatchSplitAiResponse(aiText, meta, sortOffset, extractJson, safeJsonParse);
  
  console.log('解析结果:');
  console.log(`  extractPath: ${parsed.extractPath}`);
  console.log(`  questions.length: ${parsed.questions?.length || 0}`);
  console.log(`  rawQuestions.length: ${parsed.rawQuestions?.length || 0}`);
  console.log(`  attempts: ${JSON.stringify(parsed.attempts || [])}`);
  
  if (parsed.parsed) {
    console.log(`  parsed type: ${typeof parsed.parsed}, isArray: ${Array.isArray(parsed.parsed)}`);
    if (!Array.isArray(parsed.parsed) && typeof parsed.parsed === 'object') {
      console.log(`  parsed keys: ${Object.keys(parsed.parsed).join(', ')}`);
    }
  }
  
  // Step 6: 检查 rawQuestions 结构
  console.log('\n=== Step 6: 检查 rawQuestions 结构 ===');
  if (parsed.rawQuestions?.length > 0) {
    const firstQ = parsed.rawQuestions[0];
    console.log(`第一个题目 keys: ${Object.keys(firstQ).join(', ')}`);
    console.log(`第一个题目 content: ${firstQ.content?.substring(0, 200) || '(空)'}`);
    console.log(`第一个题目 question: ${firstQ.question?.substring(0, 200) || '(空)'}`);
  }
  
  // Step 7: normalize
  console.log('\n=== Step 7: Normalize ===');
  const normalizer = await import('../teacher-api/server/batch/questionNormalizer.js');
  const { valid, rawCount, filteredCount } = normalizer.normalizeQuestionsBatch(
    parsed.rawQuestions || [],
    meta,
    sortOffset
  );
  console.log(`原始: ${rawCount}, 有效: ${valid.length}, 过滤: ${filteredCount}`);
  
  if (valid.length > 0) {
    console.log(`第一个有效题目: ${JSON.stringify(valid[0], null, 2).substring(0, 500)}`);
  } else if (parsed.rawQuestions?.length > 0) {
    console.log('⚠️ 所有题目被过滤！检查 isValidQuestion 逻辑...');
    for (let i = 0; i < Math.min(3, parsed.rawQuestions.length); i++) {
      const q = parsed.rawQuestions[i];
      const content = normalizer.cleanText?.(q.content ?? q.question ?? '') ?? (q.content ?? q.question ?? '');
      console.log(`  #${i}: content="${content?.substring(0, 100)}", length=${content?.length}`);
    }
  }
}

async function dryRunDiagnostic() {
  console.log('\n=== 离线诊断：检查解析管线代码 ===');
  
  // 模拟一个典型的 AI 返回
  const mockAiResponse = `\`\`\`json
[
  {
    "question_number": 1,
    "content": "已知集合A={x|x²-3x+2=0}，则A的子集个数为",
    "question_type": "选择题",
    "options": ["A. 2", "B. 3", "C. 4", "D. 8"],
    "answer": "C",
    "analysis": "A={1,2}，共2个元素，子集个数为2²=4",
    "difficulty": "基础",
    "knowledge_point": "集合"
  },
  {
    "question_number": 2,
    "content": "已知复数z满足(1+i)z=2i，则|z|=",
    "question_type": "填空题",
    "answer": "√2",
    "analysis": "z=2i/(1+i)=2i(1-i)/2=i+1，|z|=√2",
    "difficulty": "基础",
    "knowledge_point": "复数"
  }
]
\`\`\``;
  
  console.log('模拟 AI 返回:');
  console.log(mockAiResponse.substring(0, 300));
  
  const parsed = await parseBatchSplitAiResponse(mockAiResponse, { subject: '数学', grade: '高三' }, 0, extractJson, safeJsonParse);
  
  console.log('\n模拟解析结果:');
  console.log(`  extractPath: ${parsed.extractPath}`);
  console.log(`  questions.length: ${parsed.questions?.length}`);
  console.log(`  rawQuestions.length: ${parsed.rawQuestions?.length}`);
  console.log(`  attempts: ${JSON.stringify(parsed.attempts)}`);
  
  if (parsed.questions?.length > 0) {
    console.log(`  ✅ 解析成功！第一个题目: ${parsed.questions[0].content?.substring(0, 100)}`);
  } else {
    console.log('  ❌ 解析失败！');
  }
}

main().catch(console.error);
