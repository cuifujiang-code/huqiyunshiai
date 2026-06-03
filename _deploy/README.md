# 部署资料包

本目录汇总「前面多轮功能升级」中**无法仅靠 Git 自动完成**的步骤。

| 文件 | 用途 |
|------|------|
| [supabase_manual_migrations.sql](./supabase_manual_migrations.sql) | Supabase SQL Editor 一键执行（题库可见性、后台、诊断/规划、拍照搜题） |
| [TEACHER_API_DEPLOY_CHECKLIST.md](./TEACHER_API_DEPLOY_CHECKLIST.md) | 独立 API `api.huqiyunshiai.online` 发布与冒烟测试 |
| [VERCEL_MAIN_DEPLOY_CHECKLIST.md](./VERCEL_MAIN_DEPLOY_CHECKLIST.md) | 主站 Vercel 环境变量、函数与页面验证 |

**推荐顺序：** Supabase SQL → teacher-api 部署 → 主站 Vercel 确认 → 按检查清单冒烟测试。
