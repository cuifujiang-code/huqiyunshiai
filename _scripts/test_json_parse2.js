// 深入追踪 safeJsonParse 失败原因
import { safeJsonParse, extractJsonFromAiText } from '../teacher-api/server/batch/safeJson.js';
import { preprocessAiJsonString } from '../teacher-api/server/batch/batchPrompt.js';

// 复制内部函数来调试
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

console.log('\n=== 手动追踪 safeJsonParse ===');
const text = preprocessed;

// Candidate 1: String(text).trim()
const c1 = String(text).trim();
console.log(`Candidate 1 (trim): length=${c1.length}`);
try { JSON.parse(c1); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }

// Candidate 2: extractJsonFromAiText(text)
const c2 = extractJsonFromAiText(text);
console.log(`Candidate 2 (extractJsonFromAiText): length=${c2?.length}, content=${c2?.substring(0,100)}`);
if (c2) {
  try { JSON.parse(c2); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }
}

// Candidate 3: unwrapNestedJson
// 这个函数在 safeJson.js 内部，检查对 preprocessed 的效果
const unwrapped = text.trim();
console.log(`Candidate 3 (unwrapNestedJson): same as trim for non-string`);

// Candidate 4: sliceJsonFromText
const c4 = sliceJsonFromText(text);
console.log(`Candidate 4 (sliceJsonFromText): length=${c4.length}`);
try { JSON.parse(c4); console.log('  ✅ parse OK'); } catch(e) { console.log('  ❌', e.message.substring(0,80)); }

console.log('\n=== 测试 extractJsonFromAiText 对 preprocessed 的中间步骤 ===');
// extractJsonFromAiText 首先检查代码块
const codeBlocks = [...text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/gi)];
console.log('代码块匹配数:', codeBlocks.length);
if (codeBlocks.length) {
  console.log('代码块内容:', codeBlocks[0][1].substring(0, 100));
}

// 然后尝试 sliceJsonFromText
const sliced = sliceJsonFromText(text);
console.log('sliceJsonFromText 结果:', sliced.substring(0, 100));

// 关键：检查 sliceJsonFromText 的括号匹配
// JSON 中包含 "options": ["A. 2", "B. 3", "C. 4", "D. 8"]
// 这里有嵌套的 [ ]
let depth = 0;
let firstClosePos = -1;
for (let i = 0; i < text.length; i++) {
  if (text[i] === '[') depth++;
  else if (text[i] === ']') { depth--; if (depth === 0) { firstClosePos = i; break; } }
}
console.log(`\n括号匹配: 第一个 depth=0 的 ] 在位置 ${firstClosePos}`);
console.log(`该位置字符: '${text[firstClosePos]}'`);
console.log(`截取内容: ${text.substring(0, firstClosePos + 1).substring(0, 200)}`);

// 等等——检查 options 中的 ] 
const optionsIdx = text.indexOf('"options"');
if (optionsIdx >= 0) {
  console.log('\n=== 检查 options 字段 ===');
  const optionsSection = text.substring(optionsIdx, optionsIdx + 80);
  console.log('options 段:', optionsSection);
  
  // 追踪 options 内的括号
  let d = 0;
  for (let i = optionsIdx; i < text.length; i++) {
    if (text[i] === '[') d++;
    else if (text[i] === ']') { d--; }
    if (d === 0 && text[i] === ']' && i > optionsIdx + 5) {
      console.log(`options 内的 ] 在位置 ${i}, 深度归零: d=${d}`);
      break;
    }
  }
}

console.log('\n=== 直接测试 safeJsonParse ===');
try {
  const result = safeJsonParse(preprocessed);
  console.log('✅ safeJsonParse 成功:', JSON.stringify(result).substring(0, 200));
} catch (e) {
  console.log('❌ safeJsonParse 失败:', e.message);
}
