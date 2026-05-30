# Teacher API · Vercel 部署指南

独立教师 API 部署在 `teacher-api/` 目录，生产域名：**https://api.huqiyunshiai.online**

---

## 部署前必查清单

在 Vercel Dashboard 中创建或打开 **teacher-api** 项目，逐项确认：

### 1. Root Directory（必做）

| 项 | 要求 |
|---|---|
| **Root Directory** | 必须设置为 `teacher-api` |

路径：**Project → Settings → General → Root Directory**

> 若留空或指向仓库根目录，Vercel 会部署前端 SPA，`/api/*` 将返回 HTML 而非 JSON。

### 2. 域名绑定（必做）

| 域名 | 绑定项目 |
|---|---|
| `api.huqiyunshiai.online` | **teacher-api 项目**（非主站前端项目） |

路径：**Project → Settings → Domains**

> 若该域名绑在主站（`huqiyunshiai.online` 同一项目），访问 API 会得到空白页或前端 HTML。

### 3. 构建配置

| 项 | 推荐值 |
|---|---|
| Framework Preset | Other |
| Build Command | 留空（或 `echo skip`） |
| Output Directory | 留空 |
| Install Command | `npm install`（默认即可） |

本项目为 Serverless Functions（`api/` 目录），无需前端 build。

### 4. 环境变量（必做）

在 **Project → Settings → Environment Variables** 中配置（Production / Preview 均需）：

| 变量名 | 说明 |
|---|---|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key（后端专用，勿暴露到前端） |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `BATCH_WORKER_SECRET` | 可选，保护 `/api/batch/worker` |
| `TEACHER_API_ALLOWED_ORIGINS` | 可选，CORS 白名单，默认含 `huqiyunshiai.online` |

> 后端请使用 `SUPABASE_URL`，不要仅依赖 `VITE_` 前缀变量。

### 5. 部署后验证

部署完成后在终端执行：

```bash
curl https://api.huqiyunshiai.online/
```

**期望响应（JSON）：**

```json
{
  "status": "ok",
  "message": "Teacher API is running",
  "service": "teacher-api"
}
```

**错误现象与原因：**

| 现象 | 可能原因 |
|---|---|
| 返回 HTML / 空白页 | Root Directory 未设为 `teacher-api`，或域名绑错项目 |
| `{ status: 'ok' }` 但 `/api/batch/*` 无效 | 需重新部署；检查 `teacher-api/api/` 下对应文件是否存在 |
| 503 Supabase 未配置 | 环境变量缺失 |

再验证业务接口：

```bash
curl "https://api.huqiyunshiai.online/api/batch/progress?teacherId=test&batchId=test"
```

应返回 JSON（含 `success`、`questions: []` 等字段），而非 HTML。

---

## vercel.json 说明

`teacher-api/vercel.json` 仅保留一条 rewrite：

```json
{
  "rewrites": [
    { "source": "/", "destination": "/api" }
  ]
}
```

- `/` → 健康检查（`api/index.js`）
- `/api/*` → 由 `teacher-api/api/` 下各 Serverless Function 自动路由，无需额外 rewrite

请勿添加 `/(.*) → /api/index` 等全局 rewrite，否则会吞掉 `/api/batch/*`、`/api/teacher/*` 等嵌套路由。

---

## 可选：Cron 自动恢复卡住任务

若需每 5 分钟自动重试卡住的批量拆题任务，在 Vercel Dashboard → **Cron Jobs** 中添加：

| 路径 | 频率 |
|---|---|
| `/api/batch/auto-retry` | `*/5 * * * *` |

并配置环境变量 `CRON_SECRET`（Vercel Cron 会自动携带 `Authorization: Bearer <CRON_SECRET>`）。

---

## 本地 CLI 部署（可选）

```bash
cd teacher-api
npm install
vercel --prod
```

首次需 `vercel link` 并选择正确的 team / project。

---

## 相关文件

| 文件 | 用途 |
|---|---|
| `teacher-api/api/index.js` | 根路径健康检查 |
| `teacher-api/api/batch/*.js` | 批量拆题 API |
| `teacher-api/api/teacher/[...path].js` | 教师业务 API |
| `teacher-api/vercel.json` | Vercel 路由配置 |
