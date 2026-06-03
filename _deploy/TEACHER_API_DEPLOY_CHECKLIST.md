# teacher-api 部署检查清单

独立 API 域名默认：**https://api.huqiyunshiai.online**  
前端多处硬编码或 `VITE_TEACHER_API_URL` 指向该域名。主站 Vercel **不会**自动部署本目录，需单独发布 `teacher-api/` 项目。

---

## 1. 部署前：确认 Git 版本

主仓库 `main` 至少包含以下提交（或等价改动）：

| 提交（示例） | 功能 |
|-------------|------|
| `11455c9` | 辅导书知识图谱 `bookAi.js`、`POST books/knowledge-graph`、讲义 `custom` 模式 |
| `5e99eaf` | `server/batch/studentApi.js` 学生诊断/规划 API |
| `3f11c70` | 前端依赖上述 API（仅主站，但 API 必须在 teacher-api 生效） |

本地核对：

```powershell
cd "e:\华祺云师AI\teacher-api"
git log -1 --oneline   # 若在子目录无独立 git，则在仓库根目录查
```

---

## 2. 必须同步的关键文件

```
teacher-api/
├── server/batch/studentApi.js          ← 学生端 5 个 API（新增）
├── server/apiRouter.js                 ← 注册 /api/student/* 路由
├── server/teacher/bookAi.js            ← 辅导书知识网络图 AI
├── api/teacherApiHandler.js            ← books/knowledge-graph
├── server/teacher/handoutStore.js      ← 讲义 custom 模板
└── vercel.json                         ← 函数超时配置
```

**路由注册（apiRouter.js 应包含）：**

- `pathname.startsWith('/api/student/')` → `studentApiHandler`
- `pathname === '/api/teacher/student-plans'` → `studentApiHandler`
- `handleTeacherApi` 内：`books/knowledge-graph` POST

---

## 3. Vercel 环境变量（Production）

与主站共用同一 Supabase 项目时，变量名保持一致：

| 变量 | 必填 | 用途 |
|------|------|------|
| `VITE_SUPABASE_URL` 或 `SUPABASE_URL` | ✅ | 数据库 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | studentApi、题库、拆题写入 |
| `DEEPSEEK_API_KEY` | ✅ | AI 拆题、知识图谱、OCR 校正 |
| `DEEPSEEK_API_BASE_URL` | 建议 | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 建议 | 默认 `deepseek-chat` |
| `TEACHER_API_URL` | ✅ **必设** | `https://api.huqiyunshiai.online`；内部触发 decompose-process/worker 用，**勿依赖 VERCEL_URL** |
| `DECOMPOSE_PROCESS_SECRET` | 建议 | 与 `SUPABASE_SERVICE_ROLE_KEY` 二选一；保护 `/api/decompose-process` |
| `ALIBABA_ACCESS_KEY_ID` | 拆题/OCR 时需要 | 与主站诊断共用 |
| `ALIBABA_ACCESS_KEY_SECRET` | 拆题/OCR 时需要 | 同上 |

可选（批量拆题）：

- `BATCH_WORKER_SECRET`
- `DEEPSEEK_BATCH_MODEL`
- `BATCH_WORKER_PATH=/api/batch/worker`

---

## 4. 部署步骤（Vercel）

1. Vercel → **Add Project** 或已有 teacher-api 项目  
2. **Root Directory** 必须设为 `teacher-api`（若从 monorepo 导入；错误设为仓库根会导致 `/api/*` 返回主站 HTML）  
3. Framework：**Other**（Serverless Functions）  
4. 绑定域名 `api.huqiyunshiai.online`  
5. Environment Variables：填入第 3 节  
6. **Deploy** → 等待 Production 绿勾  

CLI 示例（已安装 Vercel CLI）：

```powershell
cd "e:\华祺云师AI\teacher-api"
vercel --prod
```

---

## 5. 部署后：接口冒烟测试

将 `BASE` 换为你的 API 域名。

### 5.1 健康 / 批量

```text
GET  {BASE}/api/batch/health
```

期望：`checks` 中 `deepseek`、`supabase` 等为 ok。

### 5.2 辅导书知识图谱（需登录态或按 handler 要求传 body）

```text
POST {BASE}/api/teacher/books/knowledge-graph
Content-Type: application/json

{"questionIds":["<公域或自有题目UUID>"],"subject":"数学"}
```

期望：`success: true`，返回 `nodes` / `edges` 或等价结构。

### 5.3 学生诊断历史

```text
GET {BASE}/api/student/diagnosis-history?userId=<学生UUID>&subject=物理&limit=10
```

期望：`success: true`，`history` 为数组（无数据时可为 `[]`）。

### 5.4 班级对比

```text
GET {BASE}/api/student/class-comparison?userId=<学生UUID>&subject=物理
```

期望：`success: true`，含对比字段（无历史时可能为空结构）。

### 5.5 规划进度

```text
GET {BASE}/api/student/planning-progress?planId=<规划ID>&userId=<学生UUID>
```

```text
POST {BASE}/api/student/planning-progress
Content-Type: application/json

{"planId":"...","userId":"...","taskKey":"0-0","completed":true,"taskName":"..."}
```

期望：GET/POST 均 `success: true`（需先执行 Supabase 迁移 C 段表）。

### 5.6 CORS

浏览器从主站 `https://huqiyunshiai.online`（或你的前端域）打开学生诊断报告时，Network 中上述 GET 不应出现 CORS 错误。  
`studentApi.js` 已设置 `Access-Control-Allow-Origin` 为请求 Origin。

---

## 6. 与主站分工对照

| 能力 | 主站 Vercel (`/api/...`) | teacher-api |
|------|--------------------------|-------------|
| 拍照搜题 OCR+搜题 | ✅ `api/student/photo-search.js` | ❌ 不需要 |
| 诊断提交/OCR/分析 | ✅ `api/diagnosis/*` | ❌ |
| 教育规划生成 | ✅ `api/planning/generate` | ❌ |
| 诊断历史/班级对比 | ❌ | ✅ `studentApi.js` |
| 规划任务勾选同步 | ❌ | ✅ `studentApi.js` |
| 辅导书知识图谱 | 可走主站 `/api/teacher/*` | ✅ 建议走 teacher-api |
| 批量拆题 / 题库 | 部分同源 | ✅ 主要 |

---

## 7. 常见问题

| 现象 | 处理 |
|------|------|
| 404 `未知 API 路由` | 确认已部署含 `apiRouter.js` 最新版，且请求路径为 `/api/student/...` |
| 500 Supabase 表不存在 | 在 Supabase 执行 `_deploy/supabase_manual_migrations.sql` |
| 知识图谱空/失败 | 检查 `DEEPSEEK_API_KEY`；题目需存在且 API 有权限读题库 |
| 拍照搜题匹配不到题库 | 题目 `visibility` 须为 `public`（在教师题库设为公域） |
| CORS 报错 | 重新部署 teacher-api；确认前端 `API_BASE` 与域名一致 |

---

## 8. 回滚

Vercel → Deployments → 选择上一成功 Production → **Promote to Production**。

---

**相关文档：** `_deploy/VERCEL_MAIN_DEPLOY_CHECKLIST.md`、`_deploy/supabase_manual_migrations.sql`
