-- 012_question_catalog.sql
-- 题库目录系统：目录组 → 目录分类 → 题目关联

-- 目录组表（如「高一数学」「高三物理」）
CREATE TABLE IF NOT EXISTS public.catalog_group (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 目录分类表（如「第一章」「期中考试」）
CREATE TABLE IF NOT EXISTS public.catalog_item (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.catalog_group(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'folder',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 题目目录关联表
CREATE TABLE IF NOT EXISTS public.question_catalog (
  question_id UUID NOT NULL,
  catalog_id UUID REFERENCES public.catalog_item(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (question_id, catalog_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_catalog_group_user ON public.catalog_group(user_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_group ON public.catalog_item(group_id);
CREATE INDEX IF NOT EXISTS idx_question_catalog_q ON public.question_catalog(question_id);
CREATE INDEX IF NOT EXISTS idx_question_catalog_c ON public.question_catalog(catalog_id);

-- RLS：前端不直连，由 service_role API 访问
ALTER TABLE public.catalog_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_direct_catalog_group" ON public.catalog_group;
CREATE POLICY "deny_direct_catalog_group" ON public.catalog_group FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_catalog_item" ON public.catalog_item;
CREATE POLICY "deny_direct_catalog_item" ON public.catalog_item FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_direct_question_catalog" ON public.question_catalog;
CREATE POLICY "deny_direct_question_catalog" ON public.question_catalog FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.catalog_group IS '题库目录组，如「高一数学」「高三物理」';
COMMENT ON TABLE public.catalog_item IS '目录分类/文件夹，如「第一章」「期中考试」';
COMMENT ON TABLE public.question_catalog IS '题目与目录分类的多对多关联';
