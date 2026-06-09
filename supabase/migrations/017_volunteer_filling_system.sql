-- 017: 高考志愿填报系统 — 录取数据 + 志愿方案 + 志愿条目
-- 依据 rules-spec.md §2、§4 及附录 A

-- ============================================================
-- 1. 历年院校专业录取数据
-- ============================================================
CREATE TABLE IF NOT EXISTS college_admission_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  major_name TEXT NOT NULL,
  province TEXT NOT NULL,
  year INTEGER NOT NULL,
  subject_type TEXT NOT NULL DEFAULT '物理类',
  batch_type TEXT NOT NULL DEFAULT '本科',
  min_score NUMERIC,
  avg_score NUMERIC,
  min_rank INTEGER NOT NULL,
  avg_rank INTEGER,
  enrollment_count INTEGER,
  subject_requirement TEXT DEFAULT '不限',
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (college_name, major_name, province, year, subject_type, batch_type)
);

COMMENT ON TABLE college_admission_data IS '历年院校专业录取数据 — 志愿填报算法数据源';
CREATE INDEX IF NOT EXISTS idx_college_admission_province ON college_admission_data(province);
CREATE INDEX IF NOT EXISTS idx_college_admission_year ON college_admission_data(year DESC);
CREATE INDEX IF NOT EXISTS idx_college_admission_college ON college_admission_data(college_name);

-- ============================================================
-- 2. 用户志愿方案草稿
-- ============================================================
CREATE TABLE IF NOT EXISTS volunteer_schemes (
  scheme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  scheme_name TEXT,
  province TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subjects JSONB NOT NULL DEFAULT '[]',
  score NUMERIC,
  rank INTEGER NOT NULL,
  intended_majors JSONB DEFAULT '[]',
  batch_type TEXT NOT NULL DEFAULT '本科',
  input_ext JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE volunteer_schemes IS '用户志愿方案草稿主表';
CREATE INDEX IF NOT EXISTS idx_volunteer_schemes_user ON volunteer_schemes(user_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_schemes_updated ON volunteer_schemes(updated_at DESC);

-- ============================================================
-- 3. 方案志愿条目
-- ============================================================
CREATE TABLE IF NOT EXISTS volunteer_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES volunteer_schemes(scheme_id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  tier_label TEXT NOT NULL CHECK (tier_label IN ('冲', '稳', '保')),
  gradient_level TEXT CHECK (gradient_level IN ('极冲', '冲', '较冲', '稳', '较保', '保')),
  college_name TEXT NOT NULL,
  major_name TEXT NOT NULL,
  admission_data_id UUID REFERENCES college_admission_data(id) ON DELETE SET NULL,
  predicted_rank INTEGER,
  predicted_min_rank INTEGER,
  probability NUMERIC(5, 4),
  rank_ratio NUMERIC(8, 4),
  min_score NUMERIC,
  avg_score NUMERIC,
  min_rank INTEGER,
  subject_requirement TEXT,
  is_manual BOOLEAN DEFAULT false,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE volunteer_items IS '志愿方案条目 — 含冲稳保梯度与排序';
CREATE INDEX IF NOT EXISTS idx_volunteer_items_scheme ON volunteer_items(scheme_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_items_sort ON volunteer_items(scheme_id, sort_order);

-- ============================================================
-- 4. 示例录取数据（浙江省 · 物理类 · 本科）
-- ============================================================
INSERT INTO college_admission_data
  (college_name, major_name, province, year, subject_type, batch_type, min_score, avg_score, min_rank, avg_rank, enrollment_count, subject_requirement)
VALUES
  ('浙江大学', '计算机科学与技术', '浙江', 2024, '物理类', '本科', 685, 692, 3200, 2800, 120, '物理'),
  ('浙江大学', '计算机科学与技术', '浙江', 2023, '物理类', '本科', 682, 689, 3500, 3100, 115, '物理'),
  ('浙江大学', '计算机科学与技术', '浙江', 2022, '物理类', '本科', 680, 686, 3800, 3400, 110, '物理'),
  ('浙江大学', '软件工程', '浙江', 2024, '物理类', '本科', 678, 684, 4500, 4100, 80, '物理'),
  ('浙江大学', '软件工程', '浙江', 2023, '物理类', '本科', 676, 681, 4800, 4400, 75, '物理'),
  ('浙江大学', '软件工程', '浙江', 2022, '物理类', '本科', 674, 679, 5100, 4700, 70, '物理'),
  ('杭州电子科技大学', '计算机科学与技术', '浙江', 2024, '物理类', '本科', 628, 635, 28000, 25000, 150, '物理'),
  ('杭州电子科技大学', '计算机科学与技术', '浙江', 2023, '物理类', '本科', 625, 632, 30000, 27000, 145, '物理'),
  ('杭州电子科技大学', '计算机科学与技术', '浙江', 2022, '物理类', '本科', 622, 629, 32000, 29000, 140, '物理'),
  ('浙江工业大学', '计算机科学与技术', '浙江', 2024, '物理类', '本科', 610, 618, 42000, 38000, 180, '物理'),
  ('浙江工业大学', '计算机科学与技术', '浙江', 2023, '物理类', '本科', 608, 615, 44000, 40000, 175, '物理'),
  ('浙江工业大学', '计算机科学与技术', '浙江', 2022, '物理类', '本科', 605, 612, 46000, 42000, 170, '物理'),
  ('宁波大学', '电子信息工程', '浙江', 2024, '物理类', '本科', 595, 602, 55000, 50000, 100, '物理'),
  ('宁波大学', '电子信息工程', '浙江', 2023, '物理类', '本科', 592, 599, 58000, 53000, 95, '物理'),
  ('宁波大学', '电子信息工程', '浙江', 2022, '物理类', '本科', 590, 596, 60000, 55000, 90, '物理'),
  ('温州医科大学', '临床医学', '浙江', 2024, '物理类', '本科', 620, 628, 35000, 32000, 200, '物理+化学'),
  ('温州医科大学', '临床医学', '浙江', 2023, '物理类', '本科', 618, 625, 37000, 34000, 195, '物理+化学'),
  ('温州医科大学', '临床医学', '浙江', 2022, '物理类', '本科', 615, 622, 39000, 36000, 190, '物理+化学'),
  ('浙江师范大学', '数学与应用数学', '浙江', 2024, '物理类', '本科', 580, 588, 72000, 68000, 120, '物理'),
  ('浙江师范大学', '数学与应用数学', '浙江', 2023, '物理类', '本科', 578, 585, 75000, 71000, 115, '物理'),
  ('浙江师范大学', '数学与应用数学', '浙江', 2022, '物理类', '本科', 575, 582, 78000, 74000, 110, '物理'),
  ('中国计量大学', '测控技术与仪器', '浙江', 2024, '物理类', '本科', 565, 572, 88000, 84000, 90, '物理'),
  ('中国计量大学', '测控技术与仪器', '浙江', 2023, '物理类', '本科', 562, 569, 92000, 88000, 85, '物理'),
  ('中国计量大学', '测控技术与仪器', '浙江', 2022, '物理类', '本科', 560, 566, 95000, 91000, 80, '物理'),
  ('浙江工商大学', '金融学', '浙江', 2024, '物理类', '本科', 590, 597, 60000, 56000, 130, '不限'),
  ('浙江工商大学', '金融学', '浙江', 2023, '物理类', '本科', 588, 594, 63000, 59000, 125, '不限'),
  ('浙江工商大学', '金融学', '浙江', 2022, '物理类', '本科', 585, 591, 66000, 62000, 120, '不限'),
  ('浙江理工大学', '机械设计制造及其自动化', '浙江', 2024, '物理类', '本科', 555, 562, 105000, 100000, 160, '物理'),
  ('浙江理工大学', '机械设计制造及其自动化', '浙江', 2023, '物理类', '本科', 552, 559, 108000, 103000, 155, '物理'),
  ('浙江理工大学', '机械设计制造及其自动化', '浙江', 2022, '物理类', '本科', 550, 556, 111000, 106000, 150, '物理')
ON CONFLICT (college_name, major_name, province, year, subject_type, batch_type) DO NOTHING;
