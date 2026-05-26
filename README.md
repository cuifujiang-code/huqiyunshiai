# 华祺云师AI

智慧教育 SaaS 平台 · React + Tailwind CSS + Supabase

## 部署到 Vercel

Git 已配置（user: cfj）。完整步骤见 **[docs/零基础部署操作指南.md](./docs/零基础部署操作指南.md)**。

**推荐 GitHub 仓库名**：`huqiyunshiai`

快速提交（Windows 双击）：`scripts/first-push.bat`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并填写：

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase 项目配置
- `QINIUAI_API_KEY` — 七牛云 AI API 密钥（可选，用于联通测试）
- `QINIUAI_API_URL` — 默认 `https://api.qiniu.com`

### 3. 初始化 Supabase 数据库

在 [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor 中执行：

`supabase/migrations/001_create_profiles.sql`

**模拟登录模式**（当前默认）：无需短信，界面保持不变。

登录流程（自动降级）：
1. `signInWithPassword` 登录已有虚拟账号
2. 后端 Admin API 静默创建（可选，需 `SUPABASE_SERVICE_ROLE_KEY`）
3. 客户端 `signUp`（`{手机号}@supabase.co`）
4. **本地模拟登录**（无需任何 Supabase 配置，profiles 存 localStorage）

虚拟账号：`{手机号}@supabase.co`，密码 `HuaqiMock_{手机号}!`

### 4. 启动开发服务器

```bash
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001

### 5. 浏览器预览

打开 http://localhost:5173/login ，使用手机号 + 验证码登录。

- 教师 → `/teacher/dashboard`
- 学生 → `/student/dashboard`

## 项目结构

```
src/
  components/     # Logo、路由守卫等
  context/        # AuthContext 认证状态
  lib/            # Supabase 客户端
  pages/          # 登录页、教师/学生控制台
server/           # Express 后端（七牛云 API 代理）
supabase/         # 数据库迁移 SQL
```

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router
- **后端**：Express（七牛云 API 测试代理）
- **数据库/认证**：Supabase（手机号 OTP + profiles 表）
