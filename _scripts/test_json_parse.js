// 最小化测试：检查为什么合法 JSON 解析失败
import { safeJsonParse, extractJsonFromAiText } from '../teacher-api/server/batch/safeJson.js';
import { preprocessAiJsonString } from '../teacher-api/server/batch/batchPrompt.js';

// repairJsonText 是内部函数，手动复制
function repairJsonText(jsonText) {
  let s = String(jsonText ?? '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')
  s = s.replace(/'([^']+)'\s*:/g, '"$1":')
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

console.log('=== 测试 1: 原始文本 ===');
console.log('原始文本:', testJson.substring(0, 100));

console.log('\n=== 测试 2: preprocessAiJsonString ===');
const preprocessed = preprocessAiJsonString(testJson);
console.log('预处理结果:', preprocessed.substring(0, 200));

console.log('\n=== 测试 3: extractJsonFromAiText ===');
const extracted = extractJsonFromAiText(testJson);
console.log('extract结果:', extracted?.substring(0, 200));

console.log('\n=== 测试 4: 直接 JSON.parse 预处理结果 ===');
try {
  const parsed = JSON.parse(preprocessed);
  console.log('✅ 直接 JSON.parse 成功! 类型:', Array.isArray(parsed) ? 'array' : typeof parsed);
  console.log('题目数:', parsed.length);
} catch (e) {
  console.log('❌ 直接 JSON.parse 失败:', e.message);
  console.log('预处理结果全文:');
  console.log(preprocessed);
}

console.log('\n=== 测试 5: safeJsonParse(原始文本) ===');
try {
  const parsed = safeJsonParse(testJson);
  console.log('✅ safeJsonParse 成功!');
} catch (e) {
  console.log('❌ safeJsonParse 失败:', e.message);
}

console.log('\n=== 测试 6: safeJsonParse(预处理结果) ===');
try {
  const parsed = safeJsonParse(preprocessed);
  console.log('✅ safeJsonParse(preprocessed) 成功!');
} catch (e) {
  console.log('❌ safeJsonParse(preprocessed) 失败:', e.message);
}

console.log('\n=== 测试 7: repairJsonText 测试 ===');
const repaired = repairJsonText(preprocessed);
console.log('repair 结果:', repaired.substring(0, 200));
try {
  JSON.parse(repaired);
  console.log('✅ repair后 JSON.parse 成功!');
} catch (e) {
  console.log('❌ repair后 JSON.parse 失败:', e.message);
}

// 测试 8: 检查 safeJsonParse 内部 candidate 流程
console.log('\n=== 测试 8: 手动追踪 safeJsonParse 内部流程 ===');
const text = preprocessed;
const candidates = [
  String(text).trim(),
  extractJsonFromAiText(text),
  String(text).trim(), // unwrapNestedJson
  text, // sliceJsonFromText
];
console.log('Candidates:');
candidates.forEach((c, i) => {
  if (!c) { console.log(`  [${i}]: (empty)`); return; }
  try {
    JSON.parse(c);
    console.log(`  [${i}]: ✅ parse OK, length=${c.length}`);
  } catch (e) {
    console.log(`  [${i}]: ❌ parse FAIL: ${e.message.substring(0, 100)}`);
    console.log(`        preview: ${c.substring(0, 100)}`);
  }
});

// 测试 9: 检查 repairJsonText 是否搞坏了 JSON
console.log('\n=== 测试 9: repairJsonText 是否破坏合法 JSON ===');
const simple = '{"a": 1, "b": [2, 3]}';
const repairedSimple = repairJsonText(simple);
console.log('原始:', simple);
console.log('修复:', repairedSimple);
console.log('相同?', simple === repairedSimple);

const complex = '[{"question_number": 1, "content": "已知集合A={x|x²-3x+2=0}"}]';
const repairedComplex = repairJsonText(complex);
console.log('\n复杂原始:', complex);
console.log('复杂修复:', repairedComplex);
console.log('相同?', complex === repairedComplex);
try {
  JSON.parse(repairedComplex);
  console.log('✅ repair后 parse OK');
} catch (e) {
  console.log('❌ repair后 parse FAIL:', e.message);
}
