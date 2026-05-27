-- 诊断任务分步处理：新增 ocr_result 列，扩展 status 状态
ALTER TABLE public.diagnosis_tasks ADD COLUMN IF NOT EXISTS ocr_result JSONB;

ALTER TABLE public.diagnosis_tasks DROP CONSTRAINT IF EXISTS diagnosis_tasks_status_check;

ALTER TABLE public.diagnosis_tasks
  ADD CONSTRAINT diagnosis_tasks_status_check
  CHECK (status IN ('processing', 'ocr_done', 'completed', 'failed'));

COMMENT ON COLUMN public.diagnosis_tasks.ocr_result IS 'OCR 识别结果（examPaperText、answerSheetOcrText 等）';
