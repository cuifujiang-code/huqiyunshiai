# 华祺云师AI - 批量拆题 Bug 修复任务清单

## 背景
批量拆题任务卡在"处理中"，最终提示"拆题流程结束但未检测到入库题目（batch_question_bank count=0）"。

## 已完成的修复
文件：`teacher-api/server/batch/batchTaskStore.js` - `insertBatchQuestions` 函数

**修改内容（第 397-461 行）：**
1. 去掉 `insert(rows).select('id')` → 改为不带 select 的 `insert(rows)`，避免 service_role 客户端下 select 返回空数组导致误判
2. 写入后独立执行 `COUNT(*)` 查询 `batch_question_bank WHERE batch_id = ? AND item_id = ?` 来验证写入行数
3. `COUNT=0` 时不再直接 `failBatchInsert`，只打 warn 日志，由最终兜底逻辑 `finalizeBatchTaskFromDatabase` 决定任务状态
4. 更新进度时用 `finalCount`（verifyCount 验证值）而非依赖 insert 返回值

---

## 请 Cursor 全面检查以下文件，找出所有潜在风险

### 第一组：Worker 触发链路
- [ ] `teacher-api/api/batch/start.js` - handler 最外层是否有 try-catch？`waitUntil` 触发前是否确认 `markBatchRunning` 已成功写入 DB？
- [ ] `teacher-api/server/batch/batchStart.js` - `startBatchProcessing` 函数中，双通道触发（waitUntil + HTTP）是否可能因 `BATCH_WORKER_SECRET` 配置错误导致 HTTP 触发始终失败且无人感知？
- [ ] `teacher-api/server/batch/batchTrigger.js` - `triggerBatchWorker` 的 URL 拼接逻辑：`BATCH_WORKER_URL` / `TEACHER_API_URL` / `VITE_TEACHER_API_URL` 三个环境变量优先级是否正确？线上环境是否配置了其中至少一个？
- [ ] `teacher-api/api/batch/worker.js` - handler 最外层是否有 try-catch？`verifyBatchWorkerSecret` 若 `BATCH_WORKER_SECRET` 未配置会返回 true（第9行），这是否符合预期？

### 第二组：Worker 核心逻辑
- [ ] `teacher-api/server/batch/batchWorker.js` - `runBatchWorkerCore` 函数中，第 381 行 `fetchPendingItems(batchId, ITEMS_PER_INVOCATION)` 的返回值是否可能为 null（而非空数组）？第 384 行 `if (!pending.length)` 是否能正确拦截 null？
- [ ] 同上 - 第 404 行 `if (counts.pending > 0 || counts.processing > 0)` 触发 `chainNextWorker`，但若 `chainNextWorker` 内部所有重试均失败，`safeMarkBatchFailed` 被调用后，任务状态是否正确更新为 `failed`？
- [ ] `chainNextWorker` 函数 - waitUntil 兜底调用 `safeRunBatchWorker` 时，是否可能因 Vercel Serverless 超时（maxDuration=60s）导致下一轮未完成就被杀死？

### 第三组：数据库与环境变量
- [ ] `teacher-api/server/supabaseAdmin.js` - `createServiceRoleClient` / `getSupabaseAdmin` / `getServiceRoleKey` 的实现是否正确？是否有可能在生产环境中 `SUPABASE_SERVICE_ROLE_KEY` 未被正确注入？
- [ ] `teacher-api/server/batch/batchTaskStore.js` - `insertBatchQuestions` 中 `getBatchQuestionBankClient()` 与 `getSupabaseAdmin()` 是否指向同一个 Supabase 实例？如果 ` Supabase URL` 在两个客户端中不一致，会导致 COUNT 验证查不到数据。
- [ ] 同上 - 第 464-497 行同步写入 `teacher_question_bank` 时，如果 `teacher_question_bank` 表结构与 `rows` 字段不匹配，是否会静默失败但不影响主流程？

### 第四组：AI 解析与题目归一化
- [ ] `teacher-api/server/batch/batchPrompt.js` - `parseBatchSplitAiResponse` 返回的字段名是否为 `questions`？`normalizeQuestionsBatch` 是否能正确处理 AI 返回的各种字段名变体（如 `question`、`title`、`content`）？
- [ ] `teacher-api/server/batch/questionNormalizer.js` - `normalizeQuestionsBatch` 函数是否可能返回 `valid` 为空数组，但 `rawCount > 0`，导致 `processOneItem` 第 251 行 `if (!normalizedQuestions.length)` 触发，分块被标记为 failed 但题目实际上已被 AI 解析出来？

### 第五组：Supabase 表结构
- [ ] 请检查 Supabase 中 `batch_question_bank` 表是否有 `updated_at` 字段？`batch_decompose_tasks` 和 `batch_decompose_items` 表是否都有 `updated_at` 字段？如果缺少，所有 `resetStuckProcessingItems` 和 `isTaskStale` 逻辑都会失效。
- [ ] `batch_question_bank` 表是否启用了 RLS？如果启用，是否有正确的 INSERT/SELECT policy？

---

## 修复优先级

**P0（立即修复）：**
1. `batchTaskStore.js` 的 `insertBatchQuestions` - ✅ 已完成（见上方"已完成的修复"）
2. `supabaseAdmin.js` - 确认 `SUPABASE_SERVICE_ROLE_KEY` 环境变量名拼写是否正确（注意是 `ROLE` 还是 `ROLE`？代码中用的是 `SUPABASE_SERVICE_ROLE_KEY`）

**P1（本次检查）：**
3. `batch/worker.js` handler 最外层加 try-catch
4. `batchStart.js` 中确认 `TEACHER_API_URL` 在生产环境已配置
5. 确认 `supabaseAdmin.js` 中客户端初始化逻辑正确

**P2（后续优化）：**
6. `chainNextWorker` 增加指数退避重试
7. 为 `batch_question_bank` 写入增加单条 insert 降级（当前是批量 insert，若有一条格式错误则整批失败）

---

## 给 Cursor 的执行指令

请按以下顺序执行：

1. 读取 `teacher-api/server/supabaseAdmin.js`，确认 `SUPABASE_SERVICE_ROLE_KEY` 环境变量名的拼写，以及 `createServiceRoleClient` 的实现是否正确使用 `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`
2. 读取 `teacher-api/server/batch/batchPrompt.js` 和 `teacher-api/server/batch/questionNormalizer.js`，确认 AI 返回的题目字段名与 `normalizeBankInsertRow` 中的字段提取逻辑一致
3. 读取 `teacher-api/api/batch/worker.js`，在 handler 函数最外层（第 16 行 `export default async function handler(req, res) {` 之后）加入 try-catch，确保任何未捕获的同步异常都能被 `markBatchFailed` 处理
4. 读取 `teacher-api/api/batch/start.js`，同样检查最外层 try-catch 是否完备
5. 检查 `vercel.json` 或 `teacher-api/vercel.json`，确认 `batch/start` 和 `batch/worker` 的 `maxDuration` 配置是否合理（worker 建议 >= 60）
6. 生成一份检查报告，列出所有发现的问题和修复建议

---

## 环境验证清单（需人工确认）

请在 Vercel Dashboard → Settings → Environment Variables 中确认以下变量已配置：
- [ ] `SUPABASE_URL` = `https://xxxxx.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbG...`（service_role key，不是 anon key）
- [ ] `TEACHER_API_URL` = `https://api.huqiyunshiai.online`（生产环境必需）
- [ ] `BATCH_WORKER_SECRET` = 一个随机字符串（用于 worker 接口鉴权）
- [ ] `DEEPSEEK_API_KEY` = 有效的 DeepSeek API Key
- [ ] `BATCH_WORKER_URL`（可选，若不配置则使用 `TEACHER_API_URL` + `/api/batch/worker`）

请在 Supabase Dashboard 中确认：
- [ ] `batch_question_bank` 表存在，且字段与 `normalizeBankInsertRow` 的输出一致
- [ ] `batch_question_bank` 表的 RLS 已关闭，或已为 `service_role` 添加 ALL policy
- [ ] `batch_decompose_tasks` 表存在，且有 `status`、`updated_at`、`imported_questions`、`total_questions` 字段
- [ ] `batch_decompose_items` 表存在，且有 `status`、`updated_at`、`item_index`、`chunk_text` 字段
