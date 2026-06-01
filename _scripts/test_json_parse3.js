// 检查 unwrapNestedJson 是否是罪魁祸首
import { safeJsonParse } from '../teacher-api/server/batch/safeJson.js';
import { preprocessAiJsonString } from '../teacher-api/server/batch/batchPrompt.js';

// 复制 unwrapNestedJson
function unwrapNestedJson(str) {
  let s = str.trim()
  for (let i = 0; i < 5; i++) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try { s = JSON.parse(s); s = typeof s === 'string' ? s.trim() : JSON.stringify(s) }
      catch { break }
    } else {
      break
    }
  }
  return s
}

const testJson = `\`\`\`json
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
  }
]
\`\`\``;

const preprocessed = preprocessAiJsonString(testJson);
console.log('preprocessed starts with:', preprocessed.startsWith('['));
console.log('preprocessed ends with:', preprocessed.endsWith(']'));

// Candidate 1: trim
const c1 = preprocessed.trim();
console.log('\nCandidate 1 (trim):');
console.log('  starts with ":', c1.startsWith('"'));
console.log('  ends with ":', c1.endsWith('"'));
try { JSON.parse(c1); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }

// Candidate 3: unwrapNestedJson
const c3 = unwrapNestedJson(c1);
console.log('\nCandidate 3 (unwrapNestedJson):');
console.log('  result:', c3.substring(0, 200));
console.log('  same as c1?', c1 === c3);
try { JSON.parse(c3); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }

// 现在手动模拟 safeJsonParse 的完整流程
console.log('\n=== 手动模拟 safeJsonParse ===');
function safeJsonParseManual(text) {
  if (text == null || text === '') throw new Error('JSON 内容为空')
  const candidates = [
    String(text).trim(),
    null, // extractJsonFromAiText - 我们跳过
    unwrapNestedJson(String(text).trim()),
    null, // sliceJsonFromText - 我们跳过
  ]
  const seen = new Set()
  let lastError = null
  for (let candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      console.log(`  跳过 candidate (empty or seen): ${typeof candidate}`)
      continue
    }
    seen.add(candidate)
    // 直接 parse
    try {
      const result = JSON.parse(candidate)
      console.log(`  ✅ 直接 parse 成功`)
      return result
    } catch (err) {
      console.log(`  直接 parse 失败: ${err.message.substring(0, 80)}`)
      lastError = err
    }
    // repair 后 parse - 跳过
  }
  throw lastError || new Error('JSON 解析失败')
}

try {
  safeJsonParseManual(preprocessed);
} catch(e) {
  console.log('手动模拟也失败了:', e.message);
}

// 真正的问题：检查 extractJsonFromAiText 返回的内容是否和 candidate 1 相同
console.log('\n=== 检查 Set 去重 ===');
const s = new Set();
s.add(preprocessed.trim());
console.log('添加 trim 后 Set size:', s.size);
s.add(unwrapNestedJson(preprocessed.trim()));
console.log('添加 unwrap 后 Set size:', s.size);
console.log('Set 内容相同?', s.size === 1);

// 最终测试：只用 trim 直接调用 safeJsonParse
console.log('\n=== 最终测试 ===');
try {
  const result = safeJsonParse(preprocessed.trim());
  console.log('✅ safeJsonParse(trim) 成功!');
} catch(e) {
  console.log('❌ safeJsonParse(trim) 失败:', e.message);
}

// 测试 extractJsonFromAiText 对 preprocessed.trim() 的行为
import { extractJsonFromAiText } from '../teacher-api/server/batch/safeJson.js';
const extracted = extractJsonFromAiText(preprocessed.trim());
console.log('\nextractJsonFromAiText(preprocessed.trim()):');
console.log('  结果:', extracted?.substring(0, 100));
if (extracted) {
  try { JSON.parse(extracted); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }
}
