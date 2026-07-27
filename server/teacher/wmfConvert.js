/**
 * WMF/EMF base64 → PNG base64（Windows + Pillow，批量调用 Python）
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../_scripts')
const BATCH_SCRIPT = join(SCRIPTS_DIR, 'wmf_batch_to_png.py')

function isWmfOrEmf(fmt, mime) {
  const f = String(fmt || '').toLowerCase()
  const m = String(mime || '').toLowerCase()
  return f === 'wmf' || f === 'emf' || /wmf|emf/.test(m)
}

/** 单张 WMF/EMF base64 → PNG base64 */
export function convertWmfBase64ToPng(b64) {
  const map = batchConvertWmfBase64ToPng([b64])
  return map.get(0) || null
}

/**
 * 批量转换，去重相同 base64，返回 Map<index, pngBase64>
 * @param {string[]} base64List
 */
export function batchConvertWmfBase64ToPng(base64List) {
  const result = new Map()
  if (!base64List?.length) return result
  if (!existsSync(BATCH_SCRIPT)) {
    console.warn('[wmfConvert] wmf_batch_to_png.py 不存在，跳过 WMF 转换')
    return result
  }

  const unique = new Map()
  for (let i = 0; i < base64List.length; i++) {
    const b64 = base64List[i]
    if (!b64) continue
    if (!unique.has(b64)) unique.set(b64, [])
    unique.get(b64).push(i)
  }

  const deduped = [...unique.keys()].map((b64, i) => ({ i, b64 }))
  if (!deduped.length) return result

  const proc = spawnSync('python', [BATCH_SCRIPT], {
    input: JSON.stringify(deduped),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })

  if (proc.status !== 0 || !proc.stdout?.trim()) {
    console.warn('[wmfConvert] 批量转换失败', proc.stderr?.slice(0, 300))
    return result
  }

  let converted
  try {
    converted = JSON.parse(proc.stdout)
  } catch {
    console.warn('[wmfConvert] 解析 Python 输出失败')
    return result
  }

  const pngByDedupIdx = new Map()
  for (const row of converted) {
    if (row.png) pngByDedupIdx.set(row.i, row.png)
  }

  const uniqueKeys = [...unique.keys()]
  for (let di = 0; di < uniqueKeys.length; di++) {
    const png = pngByDedupIdx.get(di)
    if (!png) continue
    for (const origIdx of unique.get(uniqueKeys[di])) {
      result.set(origIdx, png)
    }
  }

  return result
}

/** 为 formulaImages 数组填充 png_base64（就地修改副本） */
export function enrichFormulaImagesWithPng(formulaImages = []) {
  const needConvert = []
  const indices = []
  for (let i = 0; i < formulaImages.length; i++) {
    const fi = formulaImages[i]
    if (fi.png_base64) continue
    const fmt = fi.format || ''
    if (!isWmfOrEmf(fmt, fi.mime) || !fi.base64) continue
    needConvert.push(fi.base64)
    indices.push(i)
  }

  if (!needConvert.length) return formulaImages

  const pngMap = batchConvertWmfBase64ToPng(needConvert)
  return formulaImages.map((fi, i) => {
    const pos = indices.indexOf(i)
    if (pos < 0) return fi
    const png = pngMap.get(pos)
    return png ? { ...fi, png_base64: png, format: 'png', mime: 'image/png' } : fi
  })
}

export { isWmfOrEmf }
