// 查询 batch_decompose_items 表，定位批量拆题失败根因
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== 1. 检查 batch_decompose_items 表结构 ===');
  // 先看看最近的任务
  const { data: tasks, error: tasksErr } = await supabase
    .from('batch_decompose_tasks')
    .select('id, status, total_items, completed_items, total_questions, imported_questions, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (tasksErr) {
    console.error('查询 tasks 失败:', tasksErr);
  } else {
    console.log('最近3个任务:');
    tasks.forEach(t => {
      console.log(`  ID: ${t.id}`);
      console.log(`  状态: ${t.status}, 进度: ${t.completed_items}/${t.total_items}`);
      console.log(`  题目: total=${t.total_questions}, imported=${t.imported_questions}`);
      console.log(`  错误: ${t.error_message || '无'}`);
      console.log(`  时间: ${t.created_at}`);
      console.log('  ---');
    });
  }

  if (tasks && tasks.length > 0) {
    const latestTaskId = tasks[0].id;
    console.log(`\n=== 2. 查询最新任务 (${latestTaskId}) 的 items ===`);
    
    const { data: items, error: itemsErr } = await supabase
      .from('batch_decompose_items')
      .select('*')
      .eq('batch_id', latestTaskId)
      .order('item_index', { ascending: true })
      .limit(5);
    
    if (itemsErr) {
      console.error('查询 items 失败:', itemsErr);
    } else if (!items || items.length === 0) {
      console.log('没有找到 items 记录！');
    } else {
      console.log(`找到 ${items.length} 条 items:`);
      items.forEach(item => {
        console.log(`\n  Item #${item.item_index}:`);
        console.log(`    ID: ${item.id}`);
        console.log(`    状态: ${item.status}`);
        console.log(`    错误: ${item.error_message || '无'}`);
        
        // 检查 ai_raw_response 字段
        if (item.ai_raw_response) {
          const raw = typeof item.ai_raw_response === 'string' 
            ? item.ai_raw_response 
            : JSON.stringify(item.ai_raw_response);
          console.log(`    AI原始返回 (前500字符): ${raw.substring(0, 500)}`);
        } else {
          console.log('    AI原始返回: (空)');
        }
        
        // chunk_text 预览
        if (item.chunk_text) {
          console.log(`    文本块预览: ${item.chunk_text.substring(0, 200)}`);
        }
        
        // 列出所有非空字段
        const nonEmptyFields = Object.entries(item)
          .filter(([k, v]) => k !== 'id' && k !== 'batch_id' && k !== 'item_index' && v !== null && v !== undefined && v !== '')
          .map(([k, v]) => {
            const val = typeof v === 'string' && v.length > 100 ? v.substring(0, 100) + '...' : v;
            return `    ${k}: ${val}`;
          });
        console.log(nonEmptyFields.join('\n'));
      });
    }
  }

  // 3. 检查 batch_question_bank 表
  console.log('\n=== 3. 检查 batch_question_bank 表 ===');
  const { data: questions, error: qErr } = await supabase
    .from('batch_question_bank')
    .select('id, batch_id, item_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (qErr) {
    console.error('查询 question_bank 失败:', qErr);
  } else {
    console.log(`共 ${questions?.length || 0} 条记录:`);
    questions?.forEach(q => console.log(`  ID: ${q.id}, batch: ${q.batch_id}, item: ${q.item_id}, time: ${q.created_at}`));
  }
}

main().catch(console.error);
