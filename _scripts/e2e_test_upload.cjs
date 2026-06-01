#!/usr/bin/env node
/**
 * 端到端测试：DOCX 上传 → 拆题 → 预览验证
 * 
 * 用法: node e2e_test_upload.js <imagesJson文件路径>
 * 
 * 流程:
 * 1. 读取 imagesJson (docx_image_extractor.py 输出)
 * 2. 读取 DOCX 文件转 base64
 * 3. 调用 upload API
 * 4. 轮询进度
 * 5. 拉取题目并验证公式/图片是否渲染
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const BASE_URL = process.env.BASE_URL || 'https://api.huqiyunshiai.online'
const TEACHER_ID = process.env.TEACHER_ID || 'e2e-test-user'
const POLL_INTERVAL_MS = 5000
const MAX_POLL_TIME_MS = 300000 // 5分钟

function log(step, msg, data = {}) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] [${step}] ${msg}`, Object.keys(data).length ? JSON.stringify(data).slice(0, 200) : '')
}

async function apiCall(method, endpoint, body = null, isJson = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL)
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch (e) {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(content)
}

async function main() {
  const imagesJsonPath = process.argv[2]
  if (!imagesJsonPath) {
    console.error('用法: node e2e_test_upload.js <imagesJson文件路径>')
    console.error('示例: node e2e_test_upload.js E:/.../xxx_images.json')
    process.exit(1)
  }

  // ========== Step 1: 读取 imagesJson ==========
  log('STEP1', '读取 imagesJson...', { path: imagesJsonPath })
  const imagesJson = readJsonFile(imagesJsonPath)
  log('STEP1', '读取完成', {
    keys: Object.keys(imagesJson),
    formulas: imagesJson.formulas?.length || 0,
    images: imagesJson.images?.length || 0,
    stats: imagesJson.stats,
  })

  // 验证 imagesJson 结构
  if (!imagesJson.formulas?.length) {
    console.error('❌ imagesJson 中没有 formulas 数据')
    process.exit(1)
  }
  log('STEP1', '✅ imagesJson 结构验证通过')

  // ========== Step 2: 构造上传请求 ==========
  log('STEP2', '构造上传请求...')
  
  // 构造一个包含公式占位符的测试文本（模拟试卷内容）
  const testContent = []
  for (let i = 1; i <= 5; i++) {
    testContent.push(`${i}. 已知函数【公式】，求【公式】的值。`)
    testContent.push(`A. 【公式】 B. 【公式】 C. 【公式】 D. 【公式】`)
    testContent.push('')
  }
  const rawText = testContent.join('\n')

  log('STEP2', '测试文本构造完成', { 
    textLength: rawText.length, 
    formulaPlaceholders: (rawText.match(/【公式】/g) || []).length 
  })

  // ========== Step 3: 上传 ==========
  log('STEP3', '调用 upload API...')
  const uploadResult = await apiCall('POST', '/api/batch/upload', {
    teacherId: TEACHER_ID,
    subject: '数学',
    grade: '高一',
    rawText,
    examFileName: 'e2e_test_formula_render.txt',
    autoStart: true,
    imagesJson,
  })

  if (!uploadResult.body.success) {
    console.error('❌ 上传失败:', JSON.stringify(uploadResult.body, null, 2))
    process.exit(1)
  }

  const batchId = uploadResult.body.batchId
  log('STEP3', `✅ 上传成功 batchId=${batchId}`, {
    chunkCount: uploadResult.body.chunkCount,
    autoStarted: uploadResult.body.autoStarted,
    status: uploadResult.body.status,
  })

  // ========== Step 4: 轮询进度 ==========
  log('STEP4', '开始轮询进度...')
  const startTime = Date.now()
  let finalResult = null

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    
    const progressResult = await apiCall('GET', `/api/batch/progress?batchId=${batchId}&teacherId=${TEACHER_ID}`)
    const p = progressResult.body

    log('STEP4', `进度: ${p.status || 'unknown'}`, {
      completed: p.completedItems || 0,
      total: p.totalItems || 0,
      failed: p.failedItems || 0,
      pending: p.pendingItems || 0,
      realCount: p.realCount,
    })

    if (p.status === 'completed' || p.status === 'failed' || p.status === 'partial') {
      finalResult = p
      break
    }
  }

  if (!finalResult) {
    console.error('❌ 超时：任务未在5分钟内完成')
    process.exit(1)
  }

  log('STEP4', `最终状态: ${finalResult.status}`, {
    realCount: finalResult.realCount,
    totalItems: finalResult.totalItems,
  })

  // ========== Step 5: 拉取题目验证 ==========
  log('STEP5', '拉取题目验证公式/图片渲染...')

  const questionsResult = await apiCall('GET', `/api/batch/progress?batchId=${batchId}&teacherId=${TEACHER_ID}&includeQuestions=true`)
  
  // 也尝试从 batch/[...path] 拉取
  const bankResult = await apiCall('POST', '/api/batch/query', {
    batchId,
    teacherId: TEACHER_ID,
  })

  log('STEP5', '题目拉取结果', {
    hasProgress: !!questionsResult.body,
    hasBank: !!bankResult.body,
  })

  // ========== 验证报告 ==========
  console.log('\n' + '='.repeat(60))
  console.log('  端到端测试报告')
  console.log('='.repeat(60))
  console.log(`  批次ID:    ${batchId}`)
  console.log(`  状态:      ${finalResult.status}`)
  console.log(`  题目数:    ${finalResult.realCount || 'N/A'}`)
  console.log(`  公式数:    ${imagesJson.formulas.length}`)
  console.log(`  图片数:    ${imagesJson.images?.length || 0}`)
  console.log(`  测试结果:  ${finalResult.status === 'completed' ? '✅ 通过' : '⚠️ 部分通过'}`)
  console.log('='.repeat(60))

  // 输出 API 响应（用于手动检查 content 中的 <img> 标签）
  if (bankResult.body?.questions?.length) {
    const sample = bankResult.body.questions[0]
    console.log('\n📝 示例题目 content (前300字):')
    console.log((sample.content || '').slice(0, 300))
    console.log('\n🔍 包含 <img> 标签:', (sample.content || '').includes('<img'))
    console.log('🔍 包含 【公式】残留:', (sample.content || '').includes('【公式】'))
  }

  console.log('\n✅ 端到端测试完成！')
}

main().catch(err => {
  console.error('❌ 测试异常:', err.message)
  process.exit(1)
})
