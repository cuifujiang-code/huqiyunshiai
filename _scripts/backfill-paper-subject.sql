-- 存量数学试卷学科字段补全（可单独在 Supabase SQL 编辑器执行）
UPDATE public.paper
SET subject = '数学', updated_at = now()
WHERE subject IS NULL
   OR trim(subject) = ''
   OR subject NOT IN ('语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理');

SELECT subject, count(*) AS cnt FROM public.paper GROUP BY subject ORDER BY cnt DESC;
