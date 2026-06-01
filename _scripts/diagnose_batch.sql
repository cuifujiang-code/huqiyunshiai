-- ============================================================
-- 批量拆题失败诊断 SQL（在 Supabase SQL Editor 中执行）
-- ============================================================

-- 1. 查看最近3个任务的概要
SELECT id, status, total_items, completed_items, 
       total_questions, imported_questions, 
       error_message, created_at
FROM batch_decompose_tasks
ORDER BY created_at DESC
LIMIT 3;

-- 2. 查看最近任务的 items（含 AI 原始返回和错误信息）
--    先找到最新任务的 ID，然后查它的 items
WITH latest_task AS (
  SELECT id FROM batch_decompose_tasks 
  ORDER BY created_at DESC LIMIT 1
)
SELECT 
  i.item_index,
  i.status,
  i.error_message,
  -- 截取前 500 字符的 AI 原始返回
  LEFT(COALESCE(i.ai_raw_response::text, '(空)'), 500) as ai_raw_preview,
  -- 截取前 200 字符的文本块
  LEFT(COALESCE(i.chunk_text, '(空)'), 200) as chunk_preview,
  i.created_at
FROM batch_decompose_items i
JOIN latest_task t ON i.batch_id = t.id
ORDER BY i.item_index
LIMIT 5;

-- 3. 查看 items 表结构（所有列名和类型）
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'batch_decompose_items' 
ORDER BY ordinal_position;

-- 4. 查看 question_bank 表记录数
SELECT COUNT(*) as total_questions FROM batch_question_bank;

-- 5. 查看 question_bank 最新记录
SELECT id, batch_id, item_id, created_at 
FROM batch_question_bank 
ORDER BY created_at DESC 
LIMIT 5;
