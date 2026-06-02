-- 012_question_bank_visibility.sql
-- 题库可见性：个人题库 vs 公域题库

-- 1. 给 teacher_question_bank 添加 visibility 字段
ALTER TABLE teacher_question_bank 
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'personal' CHECK (visibility IN ('personal', 'public'));

-- 2. 给 batch_question_bank 添加 visibility 字段
ALTER TABLE batch_question_bank 
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'personal' CHECK (visibility IN ('personal', 'public'));

-- 3. 创建索引以加速按可见性查询
CREATE INDEX IF NOT EXISTS idx_teacher_question_bank_visibility ON teacher_question_bank(visibility);
CREATE INDEX IF NOT EXISTS idx_batch_question_bank_visibility ON batch_question_bank(visibility);

-- 4. 创建公域题库的复合索引（按科目+题型+难度+可见性）
CREATE INDEX IF NOT EXISTS idx_teacher_question_bank_public_filter 
ON teacher_question_bank(subject, question_type, difficulty, visibility)
WHERE visibility = 'public';

-- 5. 为已有数据设置默认值
UPDATE teacher_question_bank SET visibility = 'personal' WHERE visibility IS NULL;
UPDATE batch_question_bank SET visibility = 'personal' WHERE visibility IS NULL;

COMMENT ON COLUMN teacher_question_bank.visibility IS '题目可见性: personal=个人题库(仅创建者可见), public=公域题库(所有人可见)';
COMMENT ON COLUMN batch_question_bank.visibility IS '题目可见性: personal=个人题库(仅创建者可见), public=公域题库(所有人可见)';
