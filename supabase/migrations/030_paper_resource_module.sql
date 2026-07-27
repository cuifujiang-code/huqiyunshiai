-- 030: 试题试卷资源模块 — 分类树、试卷主表、收藏表
-- 教师端上传/管理，学生端预览/下载/收藏

CREATE TABLE IF NOT EXISTS public.paper_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.paper_category(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_category_parent ON public.paper_category(parent_id, sort);

COMMENT ON TABLE public.paper_category IS '试题试卷左侧导航分类树';

-- 试卷主表
CREATE TABLE IF NOT EXISTS public.paper (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '数学',
  grade TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '无',
  exam_year INT,
  area TEXT NOT NULL DEFAULT '全国',
  category_id UUID REFERENCES public.paper_category(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT '普通',
  has_answer BOOLEAN NOT NULL DEFAULT false,
  has_analysis BOOLEAN NOT NULL DEFAULT false,
  file_url TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'pdf',
  file_size BIGINT NOT NULL DEFAULT 0,
  page_count INT NOT NULL DEFAULT 0,
  set_type TEXT NOT NULL DEFAULT 'single',
  view_count INT NOT NULL DEFAULT 0,
  download_count INT NOT NULL DEFAULT 0,
  upload_user_id UUID NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  tags TEXT[] NOT NULL DEFAULT '{}',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT paper_level_check CHECK (level IN ('免费', '普通', '特供', '精品', '教辅', '')),
  CONSTRAINT paper_set_type_check CHECK (set_type IN ('single', 'set')),
  CONSTRAINT paper_visibility_check CHECK (visibility IN ('public', 'personal'))
);

CREATE INDEX IF NOT EXISTS idx_paper_grade_term_category ON public.paper(grade, term, category_id);
CREATE INDEX IF NOT EXISTS idx_paper_file_type ON public.paper(file_type);
CREATE INDEX IF NOT EXISTS idx_paper_upload_user ON public.paper(upload_user_id);
CREATE INDEX IF NOT EXISTS idx_paper_created ON public.paper(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_view ON public.paper(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_paper_download ON public.paper(download_count DESC);

COMMENT ON TABLE public.paper IS '试题试卷资源主表';
COMMENT ON COLUMN public.paper.term IS '上学期/下学期/无';
COMMENT ON COLUMN public.paper.set_type IS 'single=单份 set=成套';

-- 收藏 / 资源篮
CREATE TABLE IF NOT EXISTS public.paper_collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  paper_id UUID NOT NULL REFERENCES public.paper(id) ON DELETE CASCADE,
  collect_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_collection_user ON public.paper_collection(user_id);

-- 种子分类数据（幂等：按名称跳过）
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '开学', 1 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '开学' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '周测', 2 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '周测' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '阶段检测', 3 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '阶段检测' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '期中', 4 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '期中' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '期末', 5 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '期末' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '高考复习', 6 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '高考复习' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '竞赛', 7 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '竞赛' AND parent_id IS NULL);
INSERT INTO public.paper_category (id, parent_id, category_name, sort)
SELECT gen_random_uuid(), NULL, '初高衔接', 8 WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = '初高衔接' AND parent_id IS NULL);

-- 高考复习子分类
DO $$
DECLARE
  gaokao_id UUID;
  subs TEXT[] := ARRAY['一轮复习','二轮专题','三轮冲刺','周测','一模','二模','三模','模拟预测','真题','真题汇编','学业考试','强基计划','自主招生'];
  sub TEXT;
  i INT := 0;
BEGIN
  SELECT id INTO gaokao_id FROM public.paper_category WHERE category_name = '高考复习' AND parent_id IS NULL LIMIT 1;
  IF gaokao_id IS NULL THEN RETURN; END IF;
  FOREACH sub IN ARRAY subs LOOP
    i := i + 1;
    INSERT INTO public.paper_category (parent_id, category_name, sort)
    SELECT gaokao_id, sub, i
    WHERE NOT EXISTS (SELECT 1 FROM public.paper_category WHERE category_name = sub AND parent_id = gaokao_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
