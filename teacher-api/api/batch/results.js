// api/batch/results.js
// 获取任务分解结果，返回标准题库格式供导出

const { getSupabase } = require('../../server/supabaseClient');

module.exports = async function(req, res) {
  // 支持 GET（查询）和 DELETE（清理）
  if (req.method === 'GET') {
    return await getResults(req, res);
  }
  if (req.method === 'DELETE') {
    return await deleteTask(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

async function getResults(req, res) {
  const { taskId, format } = req.query;
  if (!taskId) {
    return res.status(400).json({ error: 'taskId required' });
  }

  const supabase = getSupabase();
  
  // 1. 获取任务信息
  const { data: task, error: taskError } = await supabase
    .from('batch_decompose_tasks')
    .select('id, status, meta, file_name, created_at, updated_at')
    .eq('id', taskId)
    .single();
    
  if (taskError || !task) {
    return res.status(404).json({ error: 'Task not found', details: taskError?.message });
  }
  
  // 2. 从 meta 中提取题目
  const questions = extractQuestionsFromMeta(task.meta);
  
  // 3. 如果要求Excel格式，生成并下载
  if (format === 'excel') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('题目导入');
    
    // 表头
    ws.addRow([
      'content', 'answer', 'analysis', 'question_type', 'difficulty',
      'subject', 'grade', 'knowledge_point', 'source',
      'ability_dimension', 'suitable_stage', 'estimated_time',
      '选项A', '选项B', '选项C', '选项D'
    ]);
    
    // 数据行
    for (const q of questions) {
      const opts = q.options || {};
      ws.addRow([
        q.content || '',
        q.answer || '',
        q.analysis || '',
        q.question_type || '',
        q.difficulty || '基础',
        q.subject || '',
        q.grade || '',
        q.knowledge_point || '',
        q.source || task.file_name || '',
        q.ability_dimension || '',
        q.suitable_stage || '',
        q.estimated_time || '',
        opts.A || '',
        opts.B || '',
        opts.C || '',
        opts.D || '',
      ]);
    }
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="task_${taskId}_questions.xlsx"`);
    await wb.xlsx.write(res);
    return;
  }
  
  // 4. 默认返回JSON
  res.json({
    taskId: task.id,
    status: task.status,
    fileName: task.file_name,
    questionCount: questions.length,
    questions: questions,
  });
}

function extractQuestionsFromMeta(meta) {
  if (!meta) return [];
  
  // meta 可能是数组，也可能是对象
  let raw = meta;
  
  // 如果 meta 是字符串，尝试解析
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch(e) { return []; }
  }
  
  // 如果是数组，直接返回
  if (Array.isArray(raw)) return raw;
  
  // 如果是对象，尝试提取 questions 字段
  if (raw.questions) return extractQuestionsFromMeta(raw.questions);
  if (raw.result) return extractQuestionsFromMeta(raw.result);
  if (raw.data) return extractQuestionsFromMeta(raw.data);
  
  // 如果是对象数组包裹
  if (raw.results && Array.isArray(raw.results)) return raw.results;
  
  return [];
}

async function deleteTask(req, res) {
  const { taskId } = req.query;
  if (!taskId) return res.status(400).json({ error: 'taskId required' });
  
  const supabase = getSupabase();
  const { error } = await supabase
    .from('batch_decompose_tasks')
    .delete()
    .eq('id', taskId);
    
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true, message: 'Task deleted' });
}
