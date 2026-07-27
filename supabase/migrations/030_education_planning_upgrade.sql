-- 030: 考试复盘 + 霍兰德测评 + 教育财务规划（教育规划升级）

-- 新建：考试复盘记录表
CREATE TABLE IF NOT EXISTS exam_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL,
  exam_name TEXT DEFAULT '期中考试',
  exam_date DATE NOT NULL,
  scores_json JSONB NOT NULL,
  -- 格式: {语文: {score:85, avg:78, max:95}, 数学: {...}, ...}
  ai_report TEXT,
  action_plan TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_records_student ON exam_records(student_user_id);
CREATE INDEX IF NOT EXISTS idx_exam_records_date ON exam_records(exam_date DESC);

-- 在 profiles 表添加霍兰德测评结果字段
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS holland_scores JSONB DEFAULT '{}';
-- 格式: {R: 72, I: 65, A: 80, S: 55, E: 60, C: 40}

-- 选科科目（考试复盘页读取）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS selected_subjects JSONB DEFAULT '["物理","化学","生物"]'::jsonb;

-- 新建：教育财务规划记录
CREATE TABLE IF NOT EXISTS education_finance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  stage_budgets JSONB NOT NULL,
  total_budget NUMERIC,
  ai_advice TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_education_finance_plans_user ON education_finance_plans(user_id);

-- 开启 RLS
ALTER TABLE exam_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_finance_plans ENABLE ROW LEVEL SECURITY;

-- RLS 策略：学生只能查看自己的记录
DROP POLICY IF EXISTS "exam_records_own" ON exam_records;
CREATE POLICY "exam_records_own" ON exam_records
  FOR ALL
  USING (student_user_id = auth.uid()::text)
  WITH CHECK (student_user_id = auth.uid()::text);

DROP POLICY IF EXISTS "finance_plans_own" ON education_finance_plans;
CREATE POLICY "finance_plans_own" ON education_finance_plans
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
