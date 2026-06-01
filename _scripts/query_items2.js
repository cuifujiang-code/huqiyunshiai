// 用 REST API 直接查询，绕过 supabase-js RLS
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function queryTable(table, select = '*', limit = 5) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`查询 ${table} 失败 (${res.status}): ${errText}`);
    return null;
  }
  return res.json();
}

async function main() {
  // 1. 查询 tasks
  console.log('=== 1. batch_decompose_tasks (最近3条) ===');
  const tasks = await queryTable('batch_decompose_tasks', 'id,status,total_items,completed_items,total_questions,imported_questions,error_message,created_at', 3);
  if (tasks) {
    console.log(JSON.stringify(tasks, null, 2));
  }

  // 2. 直接查 items（不过滤 batch_id，看最新5条）
  console.log('\n=== 2. batch_decompose_items (最新5条，全部字段) ===');
  const items = await queryTable('batch_decompose_items', '*', 5);
  if (items) {
    for (const item of items) {
      console.log(`\n--- Item #${item.item_index} (batch: ${item.batch_id?.substring(0,12)}...) ---`);
      console.log(`  status: ${item.status}`);
      console.log(`  error_message: ${item.error_message || '(空)'}`);
      
      // 列出所有字段名
      const keys = Object.keys(item);
      console.log(`  字段列表: ${keys.join(', ')}`);
      
      // ai_raw_response 预览
      if (item.ai_raw_response) {
        const raw = typeof item.ai_raw_response === 'string' ? item.ai_raw_response : JSON.stringify(item.ai_raw_response);
        console.log(`  ai_raw_response (前300字符): ${raw.substring(0, 300)}`);
      } else {
        console.log('  ai_raw_response: (空)');
      }
      
      // chunk_text 预览
      if (item.chunk_text) {
        console.log(`  chunk_text (前200字符): ${item.chunk_text.substring(0, 200)}`);
      }
      
      // questions_count
      if (item.questions_count !== undefined) {
        console.log(`  questions_count: ${item.questions_count}`);
      }
    }
  }

  // 3. question_bank
  console.log('\n=== 3. batch_question_bank (最新5条) ===');
  const questions = await queryTable('batch_question_bank', 'id,batch_id,item_id,created_at', 5);
  if (questions) {
    console.log(JSON.stringify(questions, null, 2));
  }
}

main().catch(console.error);
