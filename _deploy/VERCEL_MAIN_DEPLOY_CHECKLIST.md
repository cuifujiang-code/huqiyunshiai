# 主站 Vercel 部署检查清单

前端 + 部分 API 部署在**主仓库根目录**（非 `teacher-api/`）。  
默认前端域名示例：`https://huqiyunshiai.online`（以你 Vercel 绑定为准）。

---

## 1. 确认 Git 已部署到 Production

`main` 分支建议至少包含：

| 提交 | 功能 |
|------|------|
| `11455c9` | 讲义/辅导书升级、工作台使用次数 |
| `a456834` | 拍照搜题页面 + `api/student/photo-search*` |
| `3f11c70` | 学生诊断/规划 UI（Chart.js 等） |

Vercel Dashboard → Project → Deployments → 最新 Production 的 commit SHA 与 GitHub 一致。

---

## 2. Supabase（必须先做）

在 SQL Editor 执行：

**`_deploy/supabase_manual_migrations.sql`**

或按段执行 `supabase/migrations/` 中：

- `013_question_visibility.sql`
- `014_admin_system.sql`
- `013_student_diagnosis_planning.sql`
- `015_student_photo_search_history.sql`

执行后设置管理员（可选）：

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = '<你的用户UUID>';
```

---

## 3. 主站环境变量（Production）

| 变量 | 必填 | 用途 |
|------|------|------|
| `VITE_SUPABASE_URL` | ✅ | 前端 Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ | 前端登录 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 服务端写历史、诊断任务 |
| `DEEPSEEK_API_KEY` | ✅ | 诊断、规划、拍照搜题 AI |
| `ALIBABA_ACCESS_KEY_ID` | ✅ | 诊断 OCR、拍照搜题 OCR |
| `ALIBABA_ACCESS_KEY_SECRET` | ✅ | 同上 |
| `VITE_TEACHER_API_URL` | 建议 | 默认 `https://api.huqiyunshiai.online` |

---

## 4. vercel.json 新增函数（拍照搜题）

确认仓库 `vercel.json` 含：

```json
"api/student/photo-search.js": { "maxDuration": 60, "includeFiles": "{server/**,node_modules/@alicloud/pop-core/**}" },
"api/student/photo-search-history.js": { "maxDuration": 30, "includeFiles": "server/**" }
```

部署后 Functions 列表应出现上述两项。

---

## 5. 部署后冒烟测试

### 5.1 页面路由

| 路径 | 说明 |
|------|------|
| `/teacher/handout-builder` | 讲义四模式含「自定义模板」 |
| `/teacher/book-builder` | 题库选题、知识图谱、封面三风格 |
| `/student/photo-search` | 拍照/相册、搜题、历史 |
| `/student/diagnosis` | 报告含趋势图（需 teacher-api 有数据） |
| `/student/planning` | 甘特图/任务清单（进度写 teacher-api） |
| `/admin/dashboard` | 需 `profiles.role = admin` |

### 5.2 拍照搜题 API（同源）

```text
POST https://<主站域>/api/student/photo-search
```

Body 含 `imageBase64`、`userId`（可选）、`imageName`。  
期望：`success: true`，`result` 含 `question/answer/analysis`。

```text
GET https://<主站域>/api/student/photo-search-history?userId=<UUID>
```

期望：`success: true`，`items` 数组。

### 5.3 诊断（异步）

走 `/api/diagnosis/submit` → `run-ocr` → `run-analysis`（与既有流程相同）。

---

## 6. 仍依赖 teacher-api 的功能

以下**主站部署 alone 不够**，必须按 `_deploy/TEACHER_API_DEPLOY_CHECKLIST.md` 部署 teacher-api：

- 学生诊断 **进步趋势图**、**班级对比**（`StudentDiagnosisPage` → `api.huqiyunshiai.online`）
- 教育规划 **任务勾选进度** 持久化
- 辅导书 **AI 知识网络图**（若 `VITE_TEACHER_API_URL` 指向子域）
- 批量拆题、题库大量写操作

---

## 7. 题库公域与拍照搜题

教师将题目设为 **公域（visibility = public）** 后，学生拍照搜题才会优先命中标准答案。  
私域题目仅教师自己可见，不参与搜题匹配。

---

## 8. 一键核对命令（本地）

```powershell
cd "e:\华祺云师AI"
git fetch origin
git log origin/main -3 --oneline
npm run build
```

构建通过 + Vercel Production 指向同一 commit → 主站前端/API 齐套。

---

**相关：** `_deploy/supabase_manual_migrations.sql`、`_deploy/TEACHER_API_DEPLOY_CHECKLIST.md`
