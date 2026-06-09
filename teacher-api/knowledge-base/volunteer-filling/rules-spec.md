# 高考志愿填报系统 — 业务规则规范（rules-spec）

> 版本：1.0.0 | 生效日期：2026-06-02  
> **本文件为最高开发准则，所有代码逻辑必须严格遵循，禁止自行发挥。**

---

## §1 系统概述

本系统基于历年院校专业录取位次数据，结合考生分数、位次、选科与意向专业，自动生成「冲 / 稳 / 保」梯度志愿推荐方案，并支持方案草稿的保存与编辑。

---

## §2 资格筛选（Eligibility Filter）

对 `college_admission_data` 中的每条记录，按以下规则逐条判定是否进入候选池：

| 编号 | 规则 | 说明 |
|------|------|------|
| E1 | 省份匹配 | `admission.province` 必须等于用户输入的 `province` |
| E2 | 科类匹配 | `admission.subject_type` 必须等于用户输入的 `subjectType`（如「物理类」「历史类」「综合」） |
| E3 | 批次匹配 | `admission.batch_type` 必须等于用户输入的 `batchType`（默认「本科」） |
| E4 | 选科满足 | 用户 `subjects` 数组必须满足 `admission.subject_requirement` 中的全部必选科目（「不限」则跳过） |
| E5 | 历史数据量 | 同一院校+专业组合至少拥有 **2 个有效年份** 的录取数据，否则排除 |
| E6 | 意向专业（可选） | 若用户填写 `intendedMajors` 且非空，则 `major_name` 须与其中任一项模糊匹配（包含关系，忽略大小写） |

**选科解析规则（E4）：**

- `subject_requirement` 为 `null`、空字符串或「不限」→ 直接通过
- 含「和」或「+」→ 拆分为多个必选科目，用户 `subjects` 须全部包含
- 含「或」→ 拆分为多个选项，用户 `subjects` 须至少包含其中一项

---

## §3 输入参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `userId` | string | 是 | 用户 ID |
| `province` | string | 是 | 高考省份 |
| `subjectType` | string | 是 | 科类 |
| `subjects` | string[] | 是 | 选考科目列表 |
| `score` | number | 否 | 高考分数 |
| `rank` | integer | 是 | 省排位次（数值越小越好） |
| `intendedMajors` | string[] | 否 | 意向专业关键词 |
| `batchType` | string | 否 | 默认「本科」 |
| `schemeName` | string | 否 | 方案名称 |

---

## §4 算法逻辑

### §4.1 数据聚合

对通过 §2 筛选的每条「院校 + 专业」组合，按 `year DESC` 取历年 `min_rank`、`avg_score` 序列。

### §4.2 有效年份权重

默认权重向量（按年份从新到旧，最多取 3 年）：

```
weights = [0.5, 0.3, 0.2]
```

若有效年份数 `n < 3`，取前 `n` 个权重并 **归一化**（使 Σw = 1）。

### §4.3 位次预测 — 加权移动平均法

对 `min_rank` 序列（按年份降序）：

```
predicted_min_rank = round( Σ(w_i × rank_i) / Σ(w_i) )
```

对 `avg_score` 序列（若存在）同样计算 `predicted_avg_score`；缺失年份跳过，仅对有效值加权。

### §4.4 概率计算 — 正态分布 CDF

**标准差 σ：**

```
σ = max(500, stdDev(historical_min_ranks))
```

若仅 1 年数据，σ = 500。

**Z 分数（位次越小越好）：**

```
z = (predicted_min_rank - user_rank) / σ
```

**录取概率：**

```
P = Φ(z) = 0.5 × (1 + erf(z / √2))
```

结果 clamp 到 `[0.01, 0.99]`，保留 4 位小数。

### §4.5 梯度分层 — 6 级分类双判据

**位次比：**

```
rank_ratio = user_rank / predicted_min_rank
```

**概率判据 → 等级：**

| 等级 | 概率 P 范围 |
|------|-------------|
| 极冲 | P < 0.15 |
| 冲 | 0.15 ≤ P < 0.35 |
| 较冲 | 0.35 ≤ P < 0.50 |
| 稳 | 0.50 ≤ P < 0.70 |
| 较保 | 0.70 ≤ P < 0.85 |
| 保 | P ≥ 0.85 |

**位次比判据 → 等级：**

| 等级 | rank_ratio 范围 |
|------|-----------------|
| 极冲 | ≥ 1.40 |
| 冲 | 1.25 ≤ r < 1.40 |
| 较冲 | 1.10 ≤ r < 1.25 |
| 稳 | 0.90 ≤ r < 1.10 |
| 较保 | 0.75 ≤ r < 0.90 |
| 保 | < 0.75 |

**双判据合并规则：**

1. 分别由概率、位次比得到 `level_by_prob`、`level_by_ratio`
2. 取两者在六级序中的 **更激进**（更偏冲）等级作为 `gradient_level`
3. 六级序（冲→保）：极冲(0) < 冲(1) < 较冲(2) < 稳(3) < 较保(4) < 保(5)；取 index **更小** 者

**冲稳保映射：**

| tier_label | 包含 gradient_level |
|------------|---------------------|
| 冲 | 极冲、冲、较冲 |
| 稳 | 稳 |
| 保 | 较保、保 |

### §4.6 志愿推荐生成

1. 对全部候选计算 §4.3–§4.5
2. 按 `tier_label` 分组
3. 各组内按 `probability DESC` 排序
4. 默认配额：**冲 8 / 稳 12 / 保 10**（可通过 `input_ext.quota` 覆盖）
5. 合并后按 冲→稳→保 顺序赋予 `sort_order`

---

## 附录 A — 数据类型表

### A.1 college_admission_data

| 列名 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| college_name | TEXT | 院校名称 |
| major_name | TEXT | 专业名称 |
| province | TEXT | 招生省份 |
| year | INTEGER | 录取年份 |
| subject_type | TEXT | 科类 |
| batch_type | TEXT | 批次，默认「本科」 |
| min_score | NUMERIC | 最低录取分 |
| avg_score | NUMERIC | 平均分 |
| min_rank | INTEGER | 最低录取位次 |
| avg_rank | INTEGER | 平均位次 |
| enrollment_count | INTEGER | 招生人数 |
| subject_requirement | TEXT | 选科要求 |
| ext_json | JSONB | 扩展 |

### A.2 volunteer_schemes

| 列名 | 类型 | 说明 |
|------|------|------|
| scheme_id | UUID | 主键 |
| user_id | TEXT | 用户 ID |
| scheme_name | TEXT | 方案名称 |
| province | TEXT | 省份 |
| subject_type | TEXT | 科类 |
| subjects | JSONB | 选科数组 |
| score | NUMERIC | 分数 |
| rank | INTEGER | 位次 |
| intended_majors | JSONB | 意向专业 |
| batch_type | TEXT | 批次 |
| input_ext | JSONB | 扩展输入 |
| status | TEXT | draft / saved / archived |

### A.3 volunteer_items

| 列名 | 类型 | 说明 |
|------|------|------|
| item_id | UUID | 主键 |
| scheme_id | UUID | 外键 |
| sort_order | INTEGER | 排序 |
| tier_label | TEXT | 冲 / 稳 / 保 |
| gradient_level | TEXT | 六级梯度 |
| college_name | TEXT | 院校 |
| major_name | TEXT | 专业 |
| admission_data_id | UUID | 关联录取数据 |
| predicted_rank | INTEGER | 预测位次 |
| predicted_min_rank | INTEGER | 同 predicted_rank |
| probability | NUMERIC(5,4) | 录取概率 |
| rank_ratio | NUMERIC(8,4) | 位次比 |
| min_score | NUMERIC | 参考最低分 |
| avg_score | NUMERIC | 参考平均分 |
| min_rank | INTEGER | 最近一年最低位次 |
| subject_requirement | TEXT | 选科要求 |
| is_manual | BOOLEAN | 是否手动添加 |
| ext_json | JSONB | 扩展 |

---

## 附录 B — API 契约

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/volunteer/generate | 生成方案并入库 |
| GET | /api/volunteer/schemes | 用户方案列表 |
| GET | /api/volunteer/scheme/:id | 方案详情含 items |
| PUT | /api/volunteer/scheme/:id | 更新方案及 items |
