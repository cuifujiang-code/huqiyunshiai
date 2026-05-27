-- 若曾创建过 payload 列，执行本脚本移除（表仅保留 result 列）
ALTER TABLE public.diagnosis_tasks DROP COLUMN IF EXISTS payload;
