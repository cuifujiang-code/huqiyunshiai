// 完全内联 safeJsonParse 的调试版本
import { extractJsonFromAiText } from '../teacher-api/server/batch/safeJson.js';
import { preprocessAiJsonString } from '../teacher-api/server/batch/batchPrompt.js';

// 从 safeJson.js 完全复制所有内部函数
function sliceJsonFromText(text) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  const arrStart = s.indexOf('[')
  const objStart = s.indexOf('{')
  if (arrStart >= 0 && (objStart < 0 || arrStart <= objStart)) {
    let depth = 0; let end = -1
    for (let i = arrStart; i < s.length; i++) {
      if (s[i] === '[') depth++
      else if (s[i] === ']') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end > arrStart) return s.slice(arrStart, end + 1).trim()
    const lastBracket = s.lastIndexOf(']')
    if (lastBracket > arrStart) return s.slice(arrStart, lastBracket + 1).trim()
  }
  if (objStart >= 0) {
    let depth = 0; let end = -1
    for (let i = objStart; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end > objStart) return s.slice(objStart, end + 1).trim()
    const lastBrace = s.lastIndexOf('}')
    if (lastBrace > objStart) return s.slice(objStart, lastBrace + 1).trim()
  }
  return s
}

function unwrapNestedJson(str) {
  let s = str.trim()
  for (let i = 0; i < 5; i++) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      try { s = JSON.parse(s); s = typeof s === 'string' ? s.trim() : JSON.stringify(s) }
      catch { break }
    } else { break }
  }
  return s
}

function repairJsonText(jsonText) {
  let s = String(jsonText ?? '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')
  s = s.replace(/'([^']+)'\s*:/g, '"$1":')
  return s
}

function debugSafeJsonParse(text) {
  console.log('=== debugSafeJsonParse ===');
  console.log('输入长度:', text?.length);
  
  if (text == null || text === '') {
    console.log('输入为空!');
    throw new Error('JSON 内容为空');
  }
  
  const candidates = [
    { label: 'trim', value: String(text).trim() },
    { label: 'extractJsonFromAiText', value: extractJsonFromAiText(text) },
    { label: 'unwrapNestedJson', value: unwrapNestedJson(String(text).trim()) },
    { label: 'sliceJsonFromText', value: sliceJsonFromText(String(text).trim()) },
  ];
  
  const seen = new Set();
  let lastError = null;
  
  for (const { label, value: candidate } of candidates) {
    console.log(`\n[${label}]: ${candidate ? `len=${candidate.length}` : 'null/empty'}`);
    if (candidate) console.log(`  preview: ${candidate.substring(0, 80)}`);
    
    if (!candidate) {
      console.log('  → 跳过 (empty)');
      continue;
    }
    if (seen.has(candidate)) {
      console.log('  → 跳过 (seen)');
      continue;
    }
    seen.add(candidate);
    
    // 直接 parse
    try {
      const result = JSON.parse(candidate);
      console.log('  → ✅ 直接 parse 成功');
      return result;
    } catch (err) {
      console.log(`  → 直接 parse 失败: ${err.message.substring(0, 100)}`);
      lastError = err;
    }
    
    // repair 后 parse
    const repaired = repairJsonText(candidate);
    console.log(`  repair 后: ${repaired ? `len=${repaired.length}` : 'null'}`);
    console.log(`  repair 前后相同? ${candidate === repaired}`);
    if (!repaired) {
      console.log('  → 跳过 repair (empty)');
      continue;
    }
    if (seen.has(repaired)) {
      console.log('  → 跳过 repair (seen)');
      continue;
    }
    seen.add(repaired);
    
    if (candidate !== repaired) {
      console.log(`  repair 差异: ${repaired.substring(0, 100)}`);
    }
    
    try {
      const result = JSON.parse(repaired);
      console.log('  → ✅ repair 后 parse 成功');
      return result;
    } catch (err) {
      console.log(`  → repair 后 parse 失败: ${err.message.substring(0, 100)}`);
      lastError = err;
    }
  }
  
  console.log('\n❌ 所有 candidate 都失败');
  throw lastError instanceof Error ? lastError : new Error('JSON 解析失败');
}

// ===== 测试 =====
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
console.log('preprocessed:');
console.log(preprocessed);

console.log('\n');
try {
  const result = debugSafeJsonParse(preprocessed);
  console.log('\n✅ 成功:', JSON.stringify(result).substring(0, 200));
} catch(e) {
  console.log('\n❌ 失败:', e.message);
}

// 也测试 preprocessed.trim()
console.log('\n\n=== 测试 preprocessed.trim() ===');
try {
  const result = debugSafeJsonParse(preprocessed.trim());
  console.log('\n✅ 成功:', JSON.stringify(result).substring(0, 200));
} catch(e) {
  console.log('\n❌ 失败:', e.message);
}
