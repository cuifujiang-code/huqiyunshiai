-- 028: 浙江省高考一分一段表（WorkBuddy 2023-2025 整合数据）
-- 对接志愿系统 score↔rank 换算、分数段分布、历年同位次参考

CREATE TABLE IF NOT EXISTS public.zhejiang_score_rank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_year SMALLINT NOT NULL CHECK (exam_year BETWEEN 2020 AND 2035),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 750),
  rank INTEGER NOT NULL CHECK (rank > 0),
  section_num INTEGER NOT NULL DEFAULT 0 CHECK (section_num >= 0),
  category VARCHAR(10) NOT NULL DEFAULT '普通类',
  subject_type VARCHAR(10) NOT NULL DEFAULT '综合类',
  batch VARCHAR(10),
  rank_percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  total_student INTEGER NOT NULL CHECK (total_student > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_year, category, subject_type, score, batch)
);

COMMENT ON TABLE public.zhejiang_score_rank IS '浙江省高考一分一段表（2023-2025 普通类综合类）';
COMMENT ON COLUMN public.zhejiang_score_rank.score IS '高考总分（满分750）';
COMMENT ON COLUMN public.zhejiang_score_rank.rank IS '全省累计位次（分数越低位次越大）';
COMMENT ON COLUMN public.zhejiang_score_rank.section_num IS '本段同分人数';
COMMENT ON COLUMN public.zhejiang_score_rank.rank_percent IS 'rank / total_student';
COMMENT ON COLUMN public.zhejiang_score_rank.batch IS '一段/二段，可空';

-- 分数 → 位次（最高频）
CREATE INDEX IF NOT EXISTS idx_zj_sr_year_score
  ON public.zhejiang_score_rank (exam_year, category, subject_type, score DESC);

-- 位次 → 分数 / 区间查询
CREATE INDEX IF NOT EXISTS idx_zj_sr_year_cat_subj_rank
  ON public.zhejiang_score_rank (exam_year, category, subject_type, rank);

-- 位次百分比筛选
CREATE INDEX IF NOT EXISTS idx_zj_sr_year_rank_pct
  ON public.zhejiang_score_rank (exam_year, rank_percent);

-- 分数区间分布
CREATE INDEX IF NOT EXISTS idx_zj_sr_year_score_range
  ON public.zhejiang_score_rank (exam_year, category, subject_type, score DESC, rank);

-- 批次筛选（可选）
CREATE INDEX IF NOT EXISTS idx_zj_sr_batch
  ON public.zhejiang_score_rank (exam_year, batch)
  WHERE batch IS NOT NULL;
