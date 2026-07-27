/**
 * 024 · 高中数学标准专题分类（一级分组 + 二级考点）
 * 在 Supabase SQL Editor 中执行
 */

-- 题目表增加专题字段
ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS topic_group TEXT NOT NULL DEFAULT '';

ALTER TABLE public.teacher_question_bank
  ADD COLUMN IF NOT EXISTS topic_tag TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.teacher_question_bank.topic_group IS '一级专题分组（如：函数与导数），仅数学科目使用';
COMMENT ON COLUMN public.teacher_question_bank.topic_tag IS '二级考点标签（如：导数的综合应用），仅数学科目使用';

CREATE INDEX IF NOT EXISTS tqb_math_topic_group_idx
  ON public.teacher_question_bank (topic_group)
  WHERE subject = '数学' AND topic_group <> '';

CREATE INDEX IF NOT EXISTS tqb_math_topic_tag_idx
  ON public.teacher_question_bank (topic_tag)
  WHERE subject = '数学' AND topic_tag <> '';

-- 标准分类参考表（只读配置，便于后台维护与校验）
CREATE TABLE IF NOT EXISTS public.math_topic_taxonomy (
  id SERIAL PRIMARY KEY,
  group_name TEXT NOT NULL,
  tag_name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.math_topic_taxonomy (group_name, tag_name, sort_order) VALUES
  ('集合与常用逻辑用语', '集合的概念与运算', 101),
  ('集合与常用逻辑用语', '命题与充要条件', 102),
  ('集合与常用逻辑用语', '全称量词与存在量词', 103),
  ('函数与导数', '函数的概念与基本性质', 201),
  ('函数与导数', '基本初等函数', 202),
  ('函数与导数', '函数的图像与变换', 203),
  ('函数与导数', '函数与方程、函数模型应用', 204),
  ('函数与导数', '导数的概念与几何意义', 205),
  ('函数与导数', '导数的运算', 206),
  ('函数与导数', '导数的综合应用', 207),
  ('三角函数与解三角形', '任意角的三角函数与诱导公式', 301),
  ('三角函数与解三角形', '三角恒等变换', 302),
  ('三角函数与解三角形', '三角函数的图像与性质', 303),
  ('三角函数与解三角形', '正弦定理与余弦定理', 304),
  ('三角函数与解三角形', '解三角形实际应用', 305),
  ('数列', '数列的概念与通项公式', 401),
  ('数列', '等差数列', 402),
  ('数列', '等比数列', 403),
  ('数列', '数列求和', 404),
  ('数列', '数列综合应用', 405),
  ('立体几何', '空间几何体表面积与体积', 501),
  ('立体几何', '空间点线面位置关系', 502),
  ('立体几何', '空间角计算', 503),
  ('立体几何', '空间向量应用', 504),
  ('平面解析几何', '直线与圆的方程', 601),
  ('平面解析几何', '椭圆', 602),
  ('平面解析几何', '双曲线', 603),
  ('平面解析几何', '抛物线', 604),
  ('平面解析几何', '圆锥曲线综合应用', 605),
  ('统计与概率', '抽样与样本估计总体', 701),
  ('统计与概率', '古典概型与随机事件概率', 702),
  ('统计与概率', '离散型随机变量与分布列', 703),
  ('统计与概率', '统计案例', 704),
  ('计数原理与复数', '排列组合', 801),
  ('计数原理与复数', '二项式定理', 802),
  ('计数原理与复数', '复数运算', 803),
  ('不等式与推理证明', '不等式性质与一元二次不等式', 901),
  ('不等式与推理证明', '基本不等式', 902),
  ('不等式与推理证明', '简单线性规划', 903),
  ('不等式与推理证明', '推理与证明', 904),
  ('拓展选考题型', '极坐标与参数方程', 1001),
  ('拓展选考题型', '绝对值不等式选讲', 1002),
  ('拓展选考题型', '数学文化与创新题型', 1003)
ON CONFLICT (tag_name) DO NOTHING;

ALTER TABLE public.math_topic_taxonomy ENABLE ROW LEVEL SECURITY;

-- 清理数学题目 tags：仅保留标准考点名（与 math_topic_taxonomy 匹配）
UPDATE public.teacher_question_bank q
SET tags = COALESCE(
  (
    SELECT array_agg(DISTINCT t.tag_name ORDER BY t.tag_name)
    FROM unnest(q.tags) AS old_tag
    JOIN public.math_topic_taxonomy t ON t.tag_name = old_tag
  ),
  '{}'::text[]
)
WHERE q.subject = '数学';

-- 根据 knowledge_point 关键词回填 topic_tag / topic_group（常见考点）
UPDATE public.teacher_question_bank q
SET
  topic_tag = t.tag_name,
  topic_group = t.group_name
FROM public.math_topic_taxonomy t
WHERE q.subject = '数学'
  AND (q.topic_tag = '' OR q.topic_tag IS NULL)
  AND q.knowledge_point ILIKE '%' || split_part(t.tag_name, '与', 1) || '%'
  AND length(split_part(t.tag_name, '与', 1)) >= 2;

-- 导数 / 三角 / 数列 等高频词精确回填
UPDATE public.teacher_question_bank SET topic_group = '函数与导数', topic_tag = '导数的综合应用'
WHERE subject = '数学' AND topic_tag = '' AND (knowledge_point ILIKE '%导数%' OR knowledge_point ILIKE '%极值%');

UPDATE public.teacher_question_bank SET topic_group = '三角函数与解三角形', topic_tag = '三角函数的图像与性质'
WHERE subject = '数学' AND topic_tag = '' AND knowledge_point ILIKE '%三角函数%';

UPDATE public.teacher_question_bank SET topic_group = '数列', topic_tag = '等差数列'
WHERE subject = '数学' AND topic_tag = '' AND knowledge_point ILIKE '%等差数列%';

UPDATE public.teacher_question_bank SET topic_group = '数列', topic_tag = '等比数列'
WHERE subject = '数学' AND topic_tag = '' AND knowledge_point ILIKE '%等比数列%';

UPDATE public.teacher_question_bank SET topic_group = '集合与常用逻辑用语', topic_tag = '集合的概念与运算'
WHERE subject = '数学' AND topic_tag = '' AND knowledge_point ILIKE '%集合%';

UPDATE public.teacher_question_bank SET topic_group = '平面解析几何', topic_tag = '圆锥曲线综合应用'
WHERE subject = '数学' AND topic_tag = '' AND (knowledge_point ILIKE '%椭圆%' OR knowledge_point ILIKE '%双曲线%' OR knowledge_point ILIKE '%抛物线%');

-- 回填后同步 tags
UPDATE public.teacher_question_bank q
SET tags = CASE
  WHEN q.topic_tag <> '' THEN ARRAY[q.topic_tag]
  ELSE '{}'::text[]
END
WHERE q.subject = '数学';
