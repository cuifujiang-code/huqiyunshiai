-- 016: 教育规划系统 — 五张核心配置表 + 家长绑定表 + 7大路线种子数据
-- 创建日期：2026-06-03
-- 设计理念：所有升学路线、阶段、任务均为配置化，新增路线只需插数据，不改代码。
-- ext_json 字段承载所有未来扩展属性，永久不需新增数据库字段。

-- ============================================================
-- 1. 升学路线配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_plan_route (
  route_id TEXT PRIMARY KEY,
  route_name TEXT NOT NULL,
  route_code TEXT NOT NULL UNIQUE,
  route_desc TEXT,
  sort INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sys_plan_route IS '升学路线配置表 — 新增DSE/华侨生等路线仅需INSERT数据';
COMMENT ON COLUMN sys_plan_route.route_code IS '唯一编码，前端路由映射：zhongkao/gaokao/qiangji/jingsai/yishu/keji/gongfei';

-- ============================================================
-- 2. 阶段配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_plan_stage (
  stage_id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES sys_plan_route(route_id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INTEGER DEFAULT 0,
  stage_desc TEXT,
  sort INTEGER DEFAULT 0,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sys_plan_stage IS '阶段配置表 — 每条路线可自由新增启蒙/预科等阶段';
CREATE INDEX IF NOT EXISTS idx_sys_plan_stage_route ON sys_plan_stage(route_id);

-- ============================================================
-- 3. 任务模板表
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_task_template (
  task_temp_id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES sys_plan_stage(stage_id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  content TEXT,
  suggest_total_hours NUMERIC,
  suggest_daily_minutes NUMERIC,
  suggest_weekly_hours NUMERIC,
  relate_knowledge JSONB DEFAULT '[]',
  complete_standard TEXT,
  is_parallel BOOLEAN DEFAULT false,
  pre_task_id TEXT,
  sort INTEGER DEFAULT 0,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE sys_task_template IS '任务模板表 — 所有扩展属性存入ext_json，永久不用新增字段';
CREATE INDEX IF NOT EXISTS idx_sys_task_template_stage ON sys_task_template(stage_id);

-- ============================================================
-- 4. 学生个人规划主表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_student_plan (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL,
  student_name TEXT,
  route_id TEXT REFERENCES sys_plan_route(route_id),
  plan_title TEXT,
  plan_start_date DATE,
  plan_end_date DATE,
  creator_user_id TEXT,
  created_by TEXT CHECK (created_by IN ('teacher', 'student', 'parent')),
  plan_data JSONB DEFAULT '{}',
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_student_plan_student ON user_student_plan(student_user_id);
CREATE INDEX IF NOT EXISTS idx_user_student_plan_creator ON user_student_plan(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_user_student_plan_route ON user_student_plan(route_id);

-- ============================================================
-- 5. 用户实际任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_task_record (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES user_student_plan(plan_id) ON DELETE CASCADE,
  temp_id TEXT,
  task_name TEXT NOT NULL,
  route_type TEXT,
  stage_name TEXT,
  start_date DATE,
  end_date DATE,
  task_days INTEGER DEFAULT 0,
  is_parallel BOOLEAN DEFAULT false,
  pre_task_id TEXT,
  complete_rate INTEGER DEFAULT 0 CHECK (complete_rate >= 0 AND complete_rate <= 100),
  status TEXT DEFAULT 'unfinish' CHECK (status IN ('unfinish', 'doing', 'finish', 'delay')),
  notes TEXT,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE user_task_record IS '用户实际任务表 — 自定义任务temp_id为空，模板任务关联模板ID';
CREATE INDEX IF NOT EXISTS idx_user_task_record_plan ON user_task_record(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_task_record_status ON user_task_record(status);

-- ============================================================
-- 6. 家长绑定表
-- ============================================================
CREATE TABLE IF NOT EXISTS parent_binding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL,
  parent_user_id TEXT NOT NULL,
  bind_type TEXT DEFAULT 'invite_code' CHECK (bind_type IN ('invite_code', 'phone', 'batch')),
  invite_code TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'unbound')),
  bound_at TIMESTAMPTZ,
  unbound_at TIMESTAMPTZ,
  ext_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE parent_binding IS '家长绑定表 — 1名学生最多3位家长，1位家长最多5名学生';
CREATE INDEX IF NOT EXISTS idx_parent_binding_student ON parent_binding(student_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_binding_parent ON parent_binding(parent_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_binding_unique
  ON parent_binding(student_user_id, parent_user_id)
  WHERE status = 'active';

-- ============================================================
-- 7. 邀请码表（学生端生成，家长输入绑定）
-- ============================================================
CREATE TABLE IF NOT EXISTS invite_code (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_code_code ON invite_code(code);

-- ============================================================
-- 种子数据：七大升学路线
-- ============================================================

-- Route 1: 常规中考
INSERT INTO sys_plan_route (route_id, route_name, route_code, route_desc, sort) VALUES
('r001', '常规中考路线', 'zhongkao', '适用五年级下学期至初三，对标浙江中考', 1),
('r002', '浙江新高考3+3路线', 'gaokao', '适用高一至高三，7选3选科制', 2),
('r003', '强基计划路线', 'qiangji', '数理导向，适配985数学单科140+破格政策', 3),
('r004', '五大学科竞赛', 'jingsai', '数/物/化/生/信奥竞赛体系', 4),
('r005', '艺术特长路线', 'yishu', '美术/声乐通用，艺考统考方向', 5),
('r006', '科技特长路线', 'keji', '科创/青少年创新大赛方向', 6),
('r007', '公费&定向师范生路线', 'gongfei', '公费师范生/定向师范生方向', 7)
ON CONFLICT (route_id) DO UPDATE SET route_name=EXCLUDED.route_name, route_desc=EXCLUDED.route_desc, sort=EXCLUDED.sort;

-- Stage: 常规中考
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s001', 'r001', '筑基阶段', 1, '五年级下学期～六年级（小升初打底）', 1),
('s002', 'r001', '进阶阶段', 2, '初一～初二全学年', 2),
('s003', 'r001', '冲刺阶段', 3, '初三全年三轮复习', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 浙江新高考
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s004', 'r002', '筑基阶段', 1, '高一全学年（选科定位）', 1),
('s005', 'r002', '进阶阶段', 2, '高二全学年（选择性必修）', 2),
('s006', 'r002', '冲刺阶段', 3, '高三全年高考备考', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 强基计划
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s007', 'r003', '筑基阶段', 1, '小六～初升高暑假', 1),
('s008', 'r003', '进阶阶段', 2, '高一~高二上 联赛备考', 2),
('s009', 'r003', '冲刺阶段', 3, '高三3月起 报名+校测备考', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 五大学科竞赛
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s010', 'r004', '筑基阶段', 1, '小学3~6年级奥数启蒙', 1),
('s011', 'r004', '进阶阶段', 2, '全初中 省预赛备考', 2),
('s012', 'r004', '冲刺阶段', 3, '高一高二 全国联赛冲刺', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 艺术特长
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s013', 'r005', '筑基阶段', 1, '小学低中段艺术基础启蒙', 1),
('s014', 'r005', '进阶阶段', 2, '初高中考级专项集训', 2),
('s015', 'r005', '冲刺阶段', 3, '高三艺考统考备考', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 科技特长
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s016', 'r006', '筑基阶段', 1, '小学科普+小发明', 1),
('s017', 'r006', '进阶阶段', 2, '初中赛事选题筹备', 2),
('s018', 'r006', '冲刺阶段', 3, '高中省级赛事打磨', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- Stage: 公费师范生
INSERT INTO sys_plan_stage (stage_id, route_id, stage_name, stage_order, stage_desc, sort) VALUES
('s019', 'r007', '筑基阶段', 1, '初一初二全科均衡夯实', 1),
('s020', 'r007', '进阶阶段', 2, '全高中文理兼顾学习', 2),
('s021', 'r007', '冲刺阶段', 3, '高三政策研读+志愿规划', 3)
ON CONFLICT (stage_id) DO UPDATE SET stage_name=EXCLUDED.stage_name, stage_order=EXCLUDED.stage_order;

-- ============================================================
-- 种子数据：7大路线全部任务模板
-- ============================================================

-- Route 1: 常规中考 — 筑基阶段
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, suggest_daily_minutes, complete_standard, is_parallel, sort) VALUES
('t001', 's001', '小学数学计算专项+小升初衔接预习', '每日固定计算限时训练（分数、小数、四则混合），每周1套小升初分班真题，预习初一整式基础内容，错题单独建档归集。', 3.5, 40, '日常计算错题率＜5%，小升初模拟卷稳定85分及以上。', true, 1),
('t002', 's001', '文言启蒙+整本书精读训练', '精读《世说新语》短篇文言，落实字词释义；完成义务教育课标必读书目，每周一篇短篇习作，积累作文素材。', 3, 35, '校内语文单元测试平均分≥82分，全部书目完成阅读并留存读书笔记。', true, 2),
('t003', 's001', '英语音标+分级阅读闭环', '系统学习国际音标，RAZ分级读物每日打卡，课内单词当天背诵当天默写复盘。', 2.5, 30, '单词听写正确率≥90%，对应分级阅读蓝思值达标。', true, 3)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 1: 常规中考 — 进阶阶段
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t004', 's002', '初中整式、方程与几何基础专项', '整式运算、一元一次方程、三角形题型专项刷题，按错误类型分类整理错题本，每月复盘错题。', 5, '本模块单元测试≥85分，同类题型二次出错率＜10%。', true, 1),
('t005', 's002', '课内文言文逐篇翻译训练', '初中语文课本文言逐字落实翻译，每周1篇记叙文写作，归纳文言实词虚词。', 3, '文言板块失分≤满分10%。', true, 2),
('t006', 's002', '浙江中考人机对话专项训练', '采用浙江中考同源听力素材日常练习，适配本地中考人机考试题型。', 3, '听力模考达到中考合格分数线。', true, 3)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 1: 常规中考 — 冲刺阶段
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, pre_task_id, sort) VALUES
('t007', 's003', '一轮全课本地毯式梳理复习', '语数英+科学+道法历史全课本知识点梳理，搭建个人知识清单，补齐课本盲区。', NULL, '课本基础题型正确率≥90%。', true, NULL, 1),
('t008', 's003', '二轮中考分题型专项突破', '拆分近5年浙江中考真题，按选择、填空、解答分类刷题，攻克各科重难点。', NULL, '重难点题型失分控制在15%以内。', false, 't007', 2),
('t009', 's003', '三轮定时全真模考+错题溯源', '按月严格按照中考时间闭卷模考，考完逐题复盘，薄弱知识点立刻补强。', NULL, '连续三次模考总分稳定在本地普高录取线之上。', false, 't008', 3)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 2: 新高考 — 筑基
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, suggest_daily_minutes, complete_standard, is_parallel, sort) VALUES
('t010', 's004', '高中必修全科学习+选科测评定位', '吃透语数英+7选3全部必修内容，每月全科测试，结合分数确定最终3门选科。', 18, NULL, '各科必修测验平均分≥75，确定最终选科组合。', true, 1),
('t011', 's004', '高中函数全专题训练', '集合、幂指对、三角函数必修全题型刷题，整理易错模型。', 5, NULL, '函数单元测试≥78分。', true, 2),
('t012', 's004', '高中课标课外阅读落地', '按照新课标要求完成课外英文阅读量，积累高考高频词汇、长难句式。', NULL, 40, '英语阅读题型得分率≥75%。', true, 3)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 2: 新高考 — 进阶
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t013', 's005', '选定科目选择性必修系统学习', '所选三科选修课本同步学习，搭配对应模块真题训练。', 4.5, '选考科目模块测试平均分≥75。', true, 1),
('t014', 's005', '语文阅读+古诗文专项训练', '整本书阅读落地，分文体训练现代文、古诗文答题思路。', 4, '阅读大题平均失分低于20%。', true, 2)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 2: 新高考 — 冲刺
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, pre_task_id, sort) VALUES
('t015', 's006', '一轮全教材查漏复习', '高中全部课本知识点复盘，梳理知识漏洞并补强。', 6, '基础题目失分＜8%。', true, NULL, 1),
('t016', 's006', '二轮重难点专题集训', '数学导数、物理电磁、化学有机等高考压轴专题专项刷题。', 6.5, '压轴题型得分率≥55%。', false, 't015', 2),
('t017', 's006', '高考标准全真模考', '严格高考时间成套刷题，根据分数换算省内位次。', NULL, '模考位次稳定在目标院校投档区间。', false, 't016', 3)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 3: 强基计划
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t018', 's007', '初高中数学衔接+强基入门题型训练', '补齐初高中知识断层，学习高中预科内容，练习强基基础入门题。', 6, '衔接综合试卷得分≥120分。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t019', 's008', '对应学科全国联赛系统备考', '遵照竞赛大纲，刷近10年省预赛、联赛真题，拔高课内深度。', NULL, '拿到省二等奖及以上（强基报名硬性门槛）。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_daily_minutes, complete_standard, is_parallel, pre_task_id, sort) VALUES
('t020', 's009', '高考高分冲刺（数学冲145+）', '主攻语数英高分段训练，数学冲刺高分满足院校破格入围条件。', 180, '高考分数达到目标院校入围分数线。', true, NULL, 1),
('t021', 's009', '目标院校校测真题研习', '收集目标强基高校往年校测考题，针对性刷题训练。', 150, '校测模拟达到院校考核基准线。', true, NULL, 2)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 4: 五大学科竞赛
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t022', 's010', '小学奥数七大体系系统学习', '计算、数论、几何、行程、应用题等七大专题分阶段授课+配套习题。', 3.5, '校内数学竞赛可以获奖。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t023', 's011', '初中竞赛教材+预赛真题集训', '依据初中竞赛大纲系统学习，赛前集中刷预赛真题。', NULL, '成功晋级省级预赛。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t024', 's012', '高中联赛历年真题限时训练', '整套国初真题限时模考，攻克难点、冷门考点。', 7, '斩获省一或省二奖项。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 5: 艺术特长
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t025', 's013', '素描/乐理基础日常训练', '素描排线、基础静物或乐理识谱、基础曲目每日常态化练习。', 3, '顺利通过艺术入门等级考试。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t026', 's014', '考级作品针对性打磨', '围绕考级大纲，打磨画作/曲目，阶段性模拟考级测评。', NULL, '取得对应中高级艺术考级证书。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t027', 's015', '本省艺考统考全科目集训', '贴合本省艺考考纲全天集训，定期全真模拟艺考。', NULL, '统考成绩过本省合格线。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 6: 科技特长
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t028', 's016', '科普阅读+简易科创制作', '阅读科普读物，动手完成小实验、简易发明。', 2, '完成3项完整原创小作品。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t029', 's017', '科创大赛选题与初稿制作', '对标全国青少年科创大赛规则，确定课题、查阅资料、制作初稿方案。', NULL, '作品入围市级初赛。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t030', 's018', '作品优化+答辩专项训练', '完善作品数据、优化方案，练习现场答辩话术。', NULL, '获得省市级科创赛事奖项。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- Route 7: 公费师范生
INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t031', 's019', '中考全科均衡学习补强', '各科同步跟进，不偏科，定期复盘薄弱模块。', 4, '校内排名稳居中上，可冲刺本地重点高中。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t032', 's020', '高中全科均衡提升', '文理科目同步跟进，避免严重偏科，对标历年公费师范投档分数线。', NULL, '历次模考分数落在公费师范往年投档区间。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

INSERT INTO sys_task_template (task_temp_id, stage_id, task_name, content, suggest_weekly_hours, complete_standard, is_parallel, sort) VALUES
('t033', 's021', '公费招生政策+志愿填报梳理', '查阅本省公费、定向招生文件，整理历年录取分数线，搭配填报方案。', 5, '高考分数满足公费院校投档条件。', true, 1)
ON CONFLICT (task_temp_id) DO UPDATE SET task_name=EXCLUDED.task_name, content=EXCLUDED.content;

-- 为包含月度总时长（非周均）的任务补充 ext_json 注明原始建议时长
UPDATE sys_task_template SET ext_json = '{"monthly_hours":22,"month_count":3}' WHERE task_temp_id = 't007';
UPDATE sys_task_template SET ext_json = '{"monthly_hours":25,"month_count":4}' WHERE task_temp_id = 't008';
UPDATE sys_task_template SET ext_json = '{"weekly_papers":4}' WHERE task_temp_id = 't009';
UPDATE sys_task_template SET ext_json = '{"monthly_hours":24,"plan_months":"9-11"}' WHERE task_temp_id = 't015';
UPDATE sys_task_template SET ext_json = '{"monthly_hours":26,"plan_months":"1-2"}' WHERE task_temp_id = 't016';
UPDATE sys_task_template SET ext_json = '{"weekly_papers":3}' WHERE task_temp_id = 't017';
UPDATE sys_task_template SET ext_json = '{"prep_months":3,"monthly_hours":22}' WHERE task_temp_id = 't019';
UPDATE sys_task_template SET ext_json = '{"prep_months":4,"monthly_hours":12}' WHERE task_temp_id = 't023';
UPDATE sys_task_template SET ext_json = '{"prep_months":3,"weekly_hours":7}' WHERE task_temp_id = 't024';
UPDATE sys_task_template SET ext_json = '{"prep_monthly_hours":15}' WHERE task_temp_id = 't026';
UPDATE sys_task_template SET ext_json = '{"training_monthly_hours":60}' WHERE task_temp_id = 't027';
UPDATE sys_task_template SET ext_json = '{"prep_monthly_hours":12}' WHERE task_temp_id = 't029';
UPDATE sys_task_template SET ext_json = '{"prep_monthly_hours":18}' WHERE task_temp_id = 't030';
UPDATE sys_task_template SET ext_json = '{"monthly_hours":10}' WHERE task_temp_id = 't032';
UPDATE sys_task_template SET ext_json = '{"weekly_hours":5,"prep_months":1}' WHERE task_temp_id = 't033';
