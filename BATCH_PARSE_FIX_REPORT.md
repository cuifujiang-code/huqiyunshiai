# 批量拆题 Bug 诊断与修复报告

## 问题现象
- 批量拆题任务进度 100%，但 `total_questions=0, imported_questions=0`
- 所有任务状态为 "批量拆题失败"
- `batch_question_bank` 表无新记录

## 根因分析

经过完整的本地模拟管线追踪，定位到根本原因：

### Bug 位置
**文件**: `teacher-api/server/batch/safeJson.js`  
**函数**: `safeJsonParse()` (第 113-144 行)

### Bug 详情
```javascript
// ❌ 旧代码（有 Bug）
for (let candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)  // ← 这里过早加入 seen

    for (const attempt of [candidate, repairJsonText(candidate)]) {
      if (!attempt || seen.has(attempt)) continue  // ← 这里 seen.has(attempt) 返回 true！
      seen.add(attempt)
      try {
        return JSON.parse(attempt)
      } catch (err) {
        lastError = err
      }
    }
  }
```

**问题**: 外层循环先 `seen.add(candidate)`，然后内层循环检查 `seen.has(attempt)`。当 attempt 就是 candidate 本身时，`seen.has(attempt)` 返回 true，导致有效的 JSON 被跳过。由于 `repairJsonText(candidate)` 对合法 JSON 返回相同字符串，也被跳过。

### 影响范围
所有 AI 返回的合法 JSON 全部被丢弃，包括：
- 简单的 `[{"a":1}]`
- 带 markdown 围栏的 ` ```json [...]``` `
- AI 实际返回的题目数组

### 修复
```javascript
// ✅ 修复后
for (let ci = 0; ci < candidates.length; ci++) {
    const candidate = candidates[ci]
    if (!candidate) continue
    // 移除了 seen.add(candidate)，只在 attempt 层面去重

    for (const attempt of [candidate, repairJsonText(candidate)]) {
      if (!attempt || seen.has(attempt)) continue
      seen.add(attempt)
      try {
        const result = JSON.parse(attempt)
        return result
      } catch (err) {
        lastError = err
      }
    }
  }
```

## 验证结果

修复后本地模拟管线测试：
- ✅ 简单 JSON `[{"a":1}]` 解析成功
- ✅ 带 markdown 围栏的 AI 返回解析成功
- ✅ 模拟题目数据（2题）解析成功，extractPath=extractQuestionsFromAiRaw
- ✅ 第一个题目内容正确提取

## 部署状态
- 代码已推送到 GitHub (commit `c06db84`)
- Vercel 自动部署中
- 部署完成后重新测试批量拆题即可验证
