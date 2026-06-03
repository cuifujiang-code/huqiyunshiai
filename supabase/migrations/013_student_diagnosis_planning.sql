-- 013: 学生端诊断与规划功能升级 — 数据库迁移
-- 创建日期：2026-06-03

-- ============================================================
-- 1. 诊断记录表（支持趋势图和班级对比）
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnosis_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL,
  student_name TEXT,
  exam_type TEXT,
  subject TEXT,
  score NUMERIC,
  full_score NUMERIC,
  grade_rank INTEGER,
  class_rank INTEGER,
  percentile NUMERIC DEFAULT 0,
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnosis_records_user ON diagnosis_records(student_user_id);
CREATE INDEX IF NOT EXISTS idx_diagnosis_records_subject ON diagnosis_records(student_user_id, subject);
CREATE INDEX IF NOT EXISTS idx_diagnosis_records_created ON diagnosis_records(created_at DESC);

-- ============================================================
-- 2. 规划记录表（支持教师端查看）
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT,
  student_name TEXT,
  creator_user_id TEXT,
  created_by TEXT CHECK (created_by IN ('teacher', 'student')),
  report_title TEXT,
  phase_count INTEGER DEFAULT 0,
  subject TEXT,
  form_data JSONB,
  report_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_records_creator ON planning_records(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_planning_records_student ON planning_records(student_user_id);
CREATE INDEX IF NOT EXISTS idx_planning_records_name ON planning_records(student_name);

-- ============================================================
-- 3. 规划任务进度表（勾选进度存储）
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  phase_index INTEGER NOT NULL,
  task_index INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  task_name TEXT DEFAULT '',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planning_task_progress_plan ON planning_task_progress(plan_id);
CREATE INDEX IF NOT EXISTS idx_planning_task_progress_user ON planning_task_progress(student_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_task_progress_key
  ON planning_task_progress(plan_id, student_user_id, task_key);
