# 试题试卷模块 — 交付说明与测试用例

## 新增文件清单

### 数据库
| 文件 | 说明 |
|------|------|
| `supabase/migrations/030_paper_resource_module.sql` | 分类树、试卷主表、收藏表及种子数据 |

### 后端（本地 dev server）
| 文件 | 说明 |
|------|------|
| `server/teacher/paperStore.js` | 试卷 CRUD、Storage 上传、收藏 |
| `server/paperRoute.js` | REST API 路由注册 |
| `server/supabaseAdmin.js` | 扩展 `ensurePaperBucket` / `uploadPaperFile` |
| `server/index.js` | 注册 `registerPaperRoutes` |

### 后端（teacher-api 生产镜像）
| 文件 | 说明 |
|------|------|
| `teacher-api/server/teacher/paperStore.js` | 与本地 server 同步 |
| `teacher-api/server/paperRoute.js` | REST 路由 |
| `teacher-api/server/supabaseAdmin.js` | 扩展试卷 Storage |
| `teacher-api/server.js` | 注册 `registerPaperRoutes` |

### 前端
| 文件 | 说明 |
|------|------|
| `src/types/paper.ts` | 类型与筛选常量 |
| `src/lib/paperApi.ts` | API 客户端 |
| `src/pages/PaperResourcePage.tsx` | 教师/学生共用主页面 |
| `src/components/paper/PaperCategorySidebar.tsx` | 左侧分类导航 |
| `src/components/paper/PaperFilterBar.tsx` | 顶部多维筛选 |
| `src/components/paper/PaperCard.tsx` | 试卷卡片 |
| `src/components/paper/PaperUploadModal.tsx` | 教师上传弹窗 |
| `src/components/paper/PaperPreviewModal.tsx` | 在线预览弹窗 |
| `src/components/paper/PaperBasketModal.tsx` | 资源篮弹窗 |

### 路由与导航（修改）
- `src/App.tsx` — `/teacher/paper-resources`、`/student/paper-resources`
- `src/components/layout/FeatureNav.tsx`
- `src/pages/TeacherDashboard.tsx`
- `src/pages/StudentDashboard.tsx`

## 全学科全学段拓展（031）

### 新增/修改
| 文件 | 说明 |
|------|------|
| `supabase/migrations/031_paper_multi_subject.sql` | subject 索引 + 存量补全 |
| `_scripts/backfill-paper-subject.sql` | 单独执行的补全脚本 |
| `src/types/paper.ts` | 8 学科、7~9 + 高中学段、初高隐藏逻辑 |
| `src/components/paper/PaperCategorySidebar.tsx` | 学科一级 + 分类二级导航 |
| `src/components/paper/PaperFilterBar.tsx` | 学科下拉、全年级、文件类型 |
| `src/pages/PaperResourcePage.tsx` | 学科/年级/分类联动 |
| `src/components/paper/PaperUploadModal.tsx` | 全学科全年级上传 |
| `server/teacher/paperStore.js` | subject 筛选、初中排除高考复习 |
| `teacher-api/server/teacher/paperStore.js` | 生产镜像 |

### 部署 SQL（Supabase 执行）
```sql
-- 见 supabase/migrations/031_paper_multi_subject.sql
```

### 测试要点
- [ ] 8 学科左侧导航切换，列表按 subject 隔离
- [ ] 筛选栏学科+年级组合查询
- [ ] 七/八/九年级隐藏「高考复习」导航与数据
- [ ] 跨学科上传自动按 subject+grade+term+category 归档
- [ ] 历史数学试卷 subject=数学 正常展示


1. 在 Supabase 执行迁移：
   ```bash
   # 或通过 Supabase CLI / Dashboard SQL 编辑器运行
   supabase/migrations/030_paper_resource_module.sql
   ```

2. 确保 `.env.local` 含 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`

3. 启动本地服务：
   ```bash
   npm run dev
   ```

4. 访问：
   - 教师端：`http://localhost:5173/teacher/paper-resources`
   - 学生端：`http://localhost:5173/student/paper-resources`

## API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/papers/categories` | 分类树 |
| GET | `/api/papers?userId=&...filters` | 分页列表 |
| GET | `/api/papers/:id` | 详情（+浏览量） |
| POST | `/api/papers` | 上传（teacher） |
| PUT | `/api/papers/:id` | 编辑 |
| DELETE | `/api/papers/:id` | 删除 |
| POST | `/api/papers/:id/collect` | 收藏/取消 |
| POST | `/api/papers/:id/download` | 下载（+计数） |
| GET | `/api/papers/collection?userId=` | 资源篮列表 |

## 测试用例

### 1. 分类与筛选
- [ ] 左侧点击「期末」「一轮复习」等子分类，列表按 `category_id` 刷新
- [ ] 年级/年份/地区/等级筛选组合生效
- [ ] 勾选「答案」「解析」仅显示对应标记试卷
- [ ] 排序标签「最新 / 浏览量 / 年下载」切换正常

### 2. 教师上传
- [ ] 仅教师可见「上传试卷」按钮
- [ ] 上传 PDF ≤80MB，填写分类后自动出现在对应目录
- [ ] 重复同名同大小文件提示失败
- [ ] 上传进度条显示

### 3. 预览与下载
- [ ] PDF/图片点击「查看」弹窗内嵌预览
- [ ] Word/zip 提示下载
- [ ] 下载后 `download_count` 增加

### 4. 收藏
- [ ] 「加入资源篮」后资源篮计数增加
- [ ] 资源篮弹窗可移除、批量下载

### 5. 学生端权限
- [ ] 学生无上传/编辑/删除入口
- [ ] 可筛选、预览、下载、收藏

### 6. 布局
- [ ] 三栏结构：左导航 + 顶筛选 + 主体列表
- [ ] 筛选区随滚动上移，题目区域可见更多卡片
- [ ] 深色主题与题库页一致

## 权限说明

- **教师**：上传、我的上传、编辑、删除、预览、下载、收藏
- **学生**：预览、下载、收藏（无写权限）
- **无 AI**：不调用大模型，不生成解析

## 注意事项

- Storage bucket 默认名 `exam-papers`（公开读）
- 生产环境需同步 `teacher-api` 部署时复制 `paperStore.js`、`paperRoute.js` 并注册路由
- 原有题库、志愿填报、AI 出题模块未改动核心逻辑

## 文件名智能自动填充

| 文件 | 说明 |
|------|------|
| `src/lib/paperFilenameParser.ts` | 解析工具（地区/年份/年级/学期/分类/标题/答案解析） |
| `src/lib/paperFilenameParser.test.ts` | 测试用例 |
| `src/components/paper/PaperUploadModal.tsx` | 选文件后自动回填 + 提示条 |

**验证用文件名：**
1. `浙江宁波市镇海中学2025-2026学年第二学期期末考试高一年级数学试卷.pdf`
2. `2026年高三二轮专题复习数学周测卷（含答案）.zip`
3. `杭州市2025学年第一学期九年级期中数学联考.docx`

