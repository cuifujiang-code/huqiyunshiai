-- 029: 补全 volunteer_schemes 浙江字段（若未执行 027 完整迁移）
ALTER TABLE public.volunteer_schemes
  ADD COLUMN IF NOT EXISTS exam_year INTEGER,
  ADD COLUMN IF NOT EXISTS batch_segment TEXT NOT NULL DEFAULT '一段';

COMMENT ON COLUMN public.volunteer_schemes.exam_year IS '高考年份';
COMMENT ON COLUMN public.volunteer_schemes.batch_segment IS '浙江批次：一段/二段';

-- 刷新 PostgREST schema cache（Supabase 通常自动刷新，执行后等待数秒即可）
NOTIFY pgrst, 'reload schema';
