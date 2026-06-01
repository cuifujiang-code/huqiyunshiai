// Monkey-patch safeJsonParse 来打印内部状态
import * as safeJsonModule from '../teacher-api/server/batch/safeJson.js';

const originalSafeJsonParse = safeJsonModule.safeJsonParse;

// 临时替换
safeJsonModule.safeJsonParse = function(text) {
  console.log('=== safeJsonParse 内部调试 ===');
  console.log('输入长度:', text?.length);
  
  if (text == null || text === '') {
    console.log('输入为空!');
    throw new Error('JSON 内容为空');
  }
  
  // 手动构建 candidates
  const extractJsonFromAiText = safeJsonModule.extractJsonFromAiText;
  
  // 复制内部函数
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
  
  const candidates = [
    String(text).trim(),
    extractJsonFromAiText(text),
    unwrapNestedJson(String(text).trim()),
    sliceJsonFromText(String(text).trim()),
  ]
  
  const seen = new Set()
  let lastError = null
  
  for (let ci = 0; ci < candidates.length; ci++) {
    const candidate = candidates[ci];
    console.log(`\nCandidate ${ci}: ${candidate ? `length=${candidate.length}, preview=${candidate.substring(0, 60)}` : '(null/empty)'}`);
    
    if (!candidate || seen.has(candidate)) {
      console.log(`  → 跳过 (empty=${!candidate}, seen=${seen.has(candidate)})`);
      continue;
    }
    seen.add(candidate);
    
    // 尝试 0: 直接 parse
    try {
      const result = JSON.parse(candidate);
      console.log(`  → ✅ 直接 parse 成功!`);
      return result;
    } catch (err) {
      console.log(`  → 直接 parse 失败: ${err.message.substring(0, 80)}`);
      lastError = err;
    }
    
    // 尝试 1: repair 后 parse
    const repaired = repairJsonText(candidate);
    if (repaired && !seen.has(repaired)) {
      seen.add(repaired);
      try {
        const result = JSON.parse(repaired);
        console.log(`  → ✅ repair 后 parse 成功!`);
        return result;
      } catch (err) {
        console.log(`  → repair 后 parse 失败: ${err.message.substring(0, 80)}`);
        console.log(`    repair 前后是否相同: ${candidate === repaired}`);
        if (candidate !== repaired) {
          console.log(`    repair 结果 preview: ${repaired.substring(0, 100)}`);
        }
        lastError = err;
      }
    } else {
      console.log(`  → repair 跳过 (empty=${!repaired}, seen=${repaired ? seen.has(repaired) : 'N/A'})`);
    }
  }
  
  console.log('\n❌ 所有 candidate 都失败了!');
  throw lastError instanceof Error ? lastError : new Error('JSON 解析失败');
};

// 现在测试
import { preprocessAiJsonString } from '../teacher-api/server/batch/batchPrompt.js';

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
console.log('preprocessed:', preprocessed);

console.log('\n调用 monkey-patched safeJsonParse...\n');
try {
  const result = safeJsonModule.safeJsonParse(preprocessed);
  console.log('\n最终结果:', JSON.stringify(result).substring(0, 200));
} catch(e) {
  console.log('\n最终错误:', e.message);
}
