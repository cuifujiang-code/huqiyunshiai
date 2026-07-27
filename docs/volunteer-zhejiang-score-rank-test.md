# 浙江一分一段表 — 联调测试说明

## 一、部署步骤

### 1. 执行数据库迁移

在 Supabase SQL Editor 依次运行：

- `supabase/migrations/027_zhejiang_admission_framework.sql`（若未执行）
- `supabase/migrations/028_zhejiang_score_rank.sql`

### 2. 导入一分一段数据

```bash
# 预览校验（不写库）
node _scripts/import-zhejiang-score-rank.mjs

# 写入 Supabase（需 .env 配置 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）
node _scripts/import-zhejiang-score-rank.mjs --execute

# 指定 Excel/CSV
node _scripts/import-zhejiang-score-rank.mjs --execute --file path/to/浙江高考一分一段表_整合版.csv
```

预期：1281 行有效，2023=424 / 2024=431 / 2025=426。

### 3. 重启后端

重启 teacher-api 本地服务或重新部署 Vercel。

---

## 二、接口测试用例

### 接口1：分数 ↔ 位次换算

**POST** `/api/volunteer/zhejiang/convert`

| 用例 | 请求体 | 预期 |
|------|--------|------|
| 分数→位次 | `{ "score": 483, "examYear": 2024, "category": "普通类", "subjectType": "综合类", "batch": "一段" }` | `rank=187304`, `sectionNum=1047`, `dataSource=zhejiang_score_rank` |
| 位次→分数 | `{ "rank": 187304, "examYear": 2024 }` | `score=483` |
| 超范围分数 | `{ "score": 800, "examYear": 2024 }` | `success=false`，含参考区间 |
| 历年同位次 | `{ "rank": 187304, "examYear": 2024 }` | `historicalSameRankScores` 含 2023/2024/2025 参考分 |

### 接口2：历年同位次院校对标

**POST** `/api/volunteer/zhejiang/benchmark`

```json
{
  "userRank": 30000,
  "examYear": 2025,
  "subjectType": "物理类",
  "batchSegment": "一段",
  "subjects": ["物理", "化学", "生物"],
  "interestMajor": "计算机"
}
```

预期：`tiers.冲 / tiers.稳 / tiers.保` 数组，每项含 `historicalAdmission`（近三年）。

### 接口3：分数段分布

**POST** `/api/volunteer/zhejiang/score-distribution`

```json
{
  "examYear": 2024,
  "startScore": 600,
  "endScore": 650,
  "category": "普通类",
  "subjectType": "综合类"
}
```

预期：`rankRange`、`totalStudents`、`density[]` 数组。

---

## 三、前端测试

1. 打开 `/student/volunteer`，省份选「浙江」
2. 选择高考年份 2024、批次「一段」
3. 输入分数 **483**，失焦后位次应变为 **187304**，并显示同分人数、位次占比、历年同位次参考
4. 输入位次 **187304**，应反查分数 **483**
5. 点击「生成志愿方案」，右侧冲/稳/保卡片展示位次差（红/绿/黄）
6. 生成后点击「导出 Excel」「导出 PDF」

---

## 四、改动文件清单

| 文件 | 说明 | 对原系统影响 |
|------|------|-------------|
| `supabase/migrations/028_zhejiang_score_rank.sql` | 新建一分一段表 | 无，仅增表 |
| `data/zhejiang/score_rank_integrated.csv` | 整合数据 | 无 |
| `_scripts/import-zhejiang-score-rank.mjs` | 导入脚本 | 无 |
| `teacher-api/server/volunteer/zhejiang/scoreRankService.js` | 查表+缓存 | 浙江专属 |
| `teacher-api/server/volunteer/zhejiang/rankScoreBridge.js` | 换算入口 | 替换 stub，非浙江仍走原逻辑 |
| `teacher-api/server/volunteer/zhejiang/benchmarkRecommend.js` | 对标推荐 | 新增 |
| `teacher-api/server/volunteer/zhejiang/zhejiangVolunteerApi.js` | 新路由 | 扩展，不修改原有 generate |
| `teacher-api/api/volunteer/zhejiang/benchmark.js` | Vercel 路由 | 新增 |
| `teacher-api/api/volunteer/zhejiang/score-distribution.js` | Vercel 路由 | 新增 |
| `src/types/volunteer.ts` | 类型扩展 | 向后兼容 |
| `src/lib/volunteerApi.ts` | API 封装 | 新增函数 |
| `src/lib/volunteerExport.ts` | Excel/PDF 导出 | 新增 |
| `src/components/volunteer/ScoreRankLinkedInput.tsx` | 双向联动+统计 | 浙江表单 |
| `src/components/volunteer/VolunteerCollegeCard.tsx` | 位次差高亮 | 浙江结果 |
| `src/pages/student/VolunteerFilling.tsx` | 导出按钮 | 非浙江仍用原表格 |

**非浙江省份、题库、规划等模块均未改动。**
