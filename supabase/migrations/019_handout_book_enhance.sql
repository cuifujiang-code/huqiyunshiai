-- 019: 讲义/辅导书增强 — custom 模式、辅导书排版元数据

ALTER TABLE public.handouts DROP CONSTRAINT IF EXISTS handouts_mode_check;
ALTER TABLE public.handouts ADD CONSTRAINT handouts_mode_check
  CHECK (mode IN ('school', 'tutoring', 'targeted', 'custom'));

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS cover_style TEXT DEFAULT 'academic';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS knowledge_graph JSONB DEFAULT NULL;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS layout_template TEXT DEFAULT 'classic';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS layout_settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS foreword TEXT DEFAULT '';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS epilogue TEXT DEFAULT '';
