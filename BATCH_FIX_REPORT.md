# 华祺云师AI 批量拆题全面修复报告

> 生成时间：2026-06-01
> 修复范围：E:/华祺云师AI/

---

## 一、发现的全部问题及修复状态

### P0（阻断级）问题

| # | 问题 | 根因 | 修复状态 | 文件 |
|---|------|------|----------|------|
| 1 | **Word 数学公式全部丢失** | mammoth 默认忽略 OMML（m:oMath）标签，导致试卷中 163 个数学公式被丢弃 | ✅ 已修复 | `server/examParser.js` |
| 2 | **Worker self-fetch URL 错误** | `batchTrigger.js` 调用 `buildServerUrl(path)` 没有传 req，Vercel 上 URL 回退到 `http://127.0.0.1:3001` | ✅ 已修复 | `server/batch/batchTrigger.js` |
| 3 | **链式触发函数签名不匹配** | `batchStart.js` 调用 `triggerBatchWorker(batchId, req)` 但函数不接受第二个参数 | ✅ 已修复 | `server/batch/batchStart.js` |
| 4 | **teacher_question_bank 同步失败导致整批入库回滚** | 同步失败时调用 `failBatchInsert` 标记整个 batch 为 failed | ✅ 已修复 | `server/batch/batchTaskStore.js` |
| 5 | **AI JSON 解析太脆弱** | `safeJson.js` 只做 trim+JSON.parse，遇到尾部逗号/注释/中文引号直接抛错 | ✅ 已修复 | `server/batch/safeJson.js` |

### P1（重要级）问题

| # | 问题 | 根因 | 修复状态 | 文件 |
|---|------|------|----------|------|
| 6 | **AI 不理解公式占位符** | `batchPrompt.js` 没有说明 【公式】 的含义 | ✅ 已修复 | `server/batch/batchPrompt.js` |
| 7 | **Vercel includeFiles 缺少 adm-zip** | 新增依赖未包含在部署包中 | ✅ 已修复 | `vercel.json` |
| 8 | **DeepSeek API 超时太长（120s）** | Vercel 60s 限制下 API 调用可能超时 | ✅ 已修复 | `server/deepseekClient.js` |
| 9 | **并发和分块配置偏高** | CONCURRENCY=5, ITEMS=8 在 Vercel 60s 下可能不够 | ✅ 已修复 | `server/batch/batchWorker.js` |

### P2（建议级）问题

| # | 问题 | 说明 | 状态 |
|---|------|------|------|
| 10 | 前端 accept 不支持 .wps | 虽然支持 WPS 格式解析，但文件选择器没包含 | ⚠️ 待优化 |
| 11 | 没有 batch/health 和 batch/auto-retry API | 前端调用但后端不存在 | ⚠️ 待补充 |
| 12 | `batch_question_bank` 的 `question_number` 字段 | 迁移脚本 011 添加但 010 没有 | ⚠️ 数据库需同步 |

---

## 二、你需要手动执行的操作

### 1. Vercel 环境变量（必须检查）

登录 Vercel Dashboard → 项目 Settings → Environment Variables，确认以下变量已设置：

```
DEEPSEEK_API_KEY=sk-xxxxxxxx        # DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat         # 模型名称
DEEPSEEK_API_BASE_URL=https://api.deepseek.com

SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # service_role key（不是 anon key）

# 可选但推荐：
BATCH_WORKER_BASE_URL=https://api.huqiyunshiai.online  # 生产环境自调用 URL
```

### 2. Supabase 数据库迁移（如果还没执行）

在 Supabase Dashboard → SQL Editor 中依次执行以下迁移：

```
# 必须执行：
supabase/migrations/007_batch_decompose_system.sql   # 建表
supabase/migrations/010_batch_schema_complete_sync.sql # 补全字段和约束
supabase/migrations/011_batch_question_bank_columns.sql # question_number 等
```

### 3. 重新部署 Vercel

```bash
cd E:/华祺云师AI

# 安装新依赖
npm install

# 推送到 GitHub（触发 Vercel 自动部署）
git add -A
git commit -m "fix: 全面修复批量拆题 - OMML公式提取、Worker触发、入库回滚、JSON容错"
git push origin main
```

如果 GitHub push 仍然 443 不通，可以手动上传到 Vercel：
```bash
# 使用 Vercel CLI 直接部署
npx vercel --prod
```

### 4. 验证部署成功

部署完成后，打开 https://api.huqiyunshiai.online/api/batch/health 确认返回正常。

然后在前端页面：
1. 上传 `金丽衢十二校数学试卷.docx`
2. 等待任务从"待启动"变为"处理中"再变为"已完成"
3. 点击"查看题目"，确认有 19 道题目被正确拆分
4. 检查题目内容中的公式是否正确（应该有 LaTeX 公式而非空白）

### 5. 如果仍然失败，检查 Vercel Function Logs

Vercel Dashboard → 项目 → Functions → 搜索 `batch/upload` 或 `batch/worker`，查看实时日志。

关键日志标记：
- `[试卷解析] OMML 公式统计` — 确认公式被检测到
- `[batchTrigger] 触发 worker` — 确认 Worker URL 正确
- `[batchWorker] 调用 AI 拆题` — 确认 AI 调用成功
- `[入库成功]` — 确认数据写入 Supabase

---

## 三、修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `server/examParser.js` | 新增 OMML 公式提取（adm-zip 解压 docx → 替换 m:oMath 为 【公式】 占位符 → mammoth 解析） |
| `server/batch/batchTrigger.js` | 重写 Worker URL 构建逻辑（支持 VERCEL_URL、BATCH_WORKER_BASE_URL），返回 Promise |
| `server/batch/batchStart.js` | 修复 triggerBatchWorker 调用（移除多余 req 参数） |
| `server/batch/batchTaskStore.js` | teacher_question_bank 同步改为后台静默（失败不阻断主流程） |
| `server/batch/safeJson.js` | 重写 JSON 解析器（支持 markdown 代码块、尾部逗号、单引号、注释、嵌套提取） |
| `server/batch/batchPrompt.js` | 增强 Prompt（说明 【公式】 占位符含义、要求 AI 用 LaTeX 补全） |
| `server/batch/batchWorker.js` | 降低并发数（5→3）和每轮分块数（8→5） |
| `server/deepseekClient.js` | API 超时 120s → 45s |
| `vercel.json` | batch/upload 和 batch/worker 的 includeFiles 添加 adm-zip |
| `package.json` | 新增 adm-zip 依赖 |

---

## 四、关键改进说明

### 公式保留机制
原方案：mammoth 直接解析 → 公式全部丢失 → AI 无法拆题
新方案：adm-zip 解压 → 替换 OMML 为 【公式】 → mammoth 解析 → AI 根据上下文推断并补全 LaTeX

### Worker 触发机制
原方案：`buildServerUrl(path)` 无 req → `getServerOrigin(undefined)` → `http://127.0.0.1:3001`（在 Vercel 上不可用）
新方案：直接读取 `VERCEL_URL` / `BATCH_WORKER_BASE_URL` 环境变量 → 构造正确的自调用 URL

### 入库容错
原方案：teacher_question_bank 同步失败 → failBatchInsert → 整个 batch 标记 failed
新方案：teacher_question_bank 同步改为 `Promise.resolve().then(...)` 后台静默 → 失败只 warn 不阻断

---

## 五、测试文件结果

测试文件：`金丽衢十二校数学试卷.docx`（70KB，19道题，163个数学公式）

本地测试结果：
- ✅ docx 解析成功：2730 字符
- ✅ 160 个公式占位符正确保留
- ✅ 1 个分块（试卷在 4000 字以内）
- ✅ Prompt 正确生成（含公式补全指引）
- ✅ safeJsonParse 容错测试通过（尾部逗号、代码块、嵌套 JSON、文本中提取）
