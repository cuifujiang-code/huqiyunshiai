/**
 * PDF 转图片工具模块 — 基于 pdfjs-dist
 *
 * 依赖: npm install pdfjs-dist
 * Worker 已在 Vite 构建中自动处理（vite-plugin-static-copy 或 public/ 目录）
 *
 * 使用示例:
 *   import { pdfToImages } from '@/utils/pdfTools'
 *   const images = await pdfToImages(file, { scale: 2.0, format: 'png' })
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// --------------- Worker 路径配置 ---------------
// legacy 构建含 toHex 等 polyfill，兼容 Chrome 139 及以下
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// --------------- 类型定义 ---------------

/** 输出图片格式 */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

/** pdfToImages 选项 */
export interface PdfToImagesOptions {
  /** 缩放比例（1.0=72DPI, 2.0=144DPI），默认 2.0 */
  scale?: number
  /** 输出格式，默认 'png' */
  format?: ImageFormat
  /** JPEG/WebP 质量 0-1，默认 0.92 */
  quality?: number
  /** 最大处理页数（防止大 PDF 撑爆内存），默认 50 */
  maxPages?: number
  /** 起始页码（1-based），默认 1 */
  startPage?: number
  /** 结束页码（1-based，含），默认 maxPages */
  endPage?: number
  /** 进度回调: (current, total) => void */
  onProgress?: (current: number, total: number) => void
  /** AbortSignal 用于取消操作 */
  signal?: AbortSignal
}

/** 单页图片结果 */
export interface PdfPageImage {
  /** 页码（1-based） */
  pageNumber: number
  /** 图片 Blob */
  blob: Blob
  /** 图片宽度（像素） */
  width: number
  /** 图片高度（像素） */
  height: number
  /** 图片 ObjectURL（调用方负责 revoke） */
  objectUrl: string
}

/** pdfToImages 返回值 */
export interface PdfToImagesResult {
  /** 所有页面的图片 */
  pages: PdfPageImage[]
  /** 总页数 */
  totalPages: number
  /** 格式 */
  format: ImageFormat
}

// --------------- 内置默认值 ---------------

const DEFAULT_OPTIONS: Required<Omit<PdfToImagesOptions, 'onProgress' | 'signal'>> = {
  scale: 2.0,
  format: 'png',
  quality: 0.92,
  maxPages: 50,
  startPage: 1,
  endPage: 50,
}

// --------------- 工具函数 ---------------

/** MIME 映射 */
const FORMAT_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** pdfjs v6：PDFDocumentProxy 仅有 cleanup，完整释放需 loadingTask.destroy */
async function releasePdfDocument(
  pdf: { cleanup?: (keepLoadedFonts?: boolean) => unknown },
  loadingTask?: { destroy?: () => Promise<void> },
): Promise<void> {
  try {
    pdf.cleanup?.()
  } catch {
    /* ignore */
  }
  try {
    await loadingTask?.destroy?.()
  } catch {
    /* ignore */
  }
}

/**
 * PDF 文件转图片 Blob 数组
 *
 * @param file - PDF File 对象或 Blob
 * @param options - 转换选项
 * @returns 图片结果集
 */
export async function pdfToImages(
  file: File | Blob,
  options: PdfToImagesOptions = {},
): Promise<PdfToImagesResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { scale, format, quality, maxPages, onProgress } = opts

  // 转为 ArrayBuffer
  let arrayBuffer: ArrayBuffer
  if (file instanceof File) {
    arrayBuffer = await file.arrayBuffer()
  } else {
    arrayBuffer = await file.arrayBuffer()
  }

  // 检查 AbortSignal
  if (options.signal?.aborted) {
    throw new DOMException('操作已取消', 'AbortError')
  }

  // 加载 PDF 文档
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })

  // 绑定 abort
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      loadingTask.destroy()
    }, { once: true })
  }

  const pdf = await loadingTask.promise

  try {
    const totalPages = pdf.numPages
    const startPage = Math.max(1, opts.startPage)
    const endPage = Math.min(totalPages, opts.endPage, maxPages)
    const pageCount = endPage - startPage + 1

    const pages: PdfPageImage[] = []

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      // 检查取消
      if (options.signal?.aborted) {
        throw new DOMException('操作已取消', 'AbortError')
      }

      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // 创建离屏 Canvas
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 渲染页面到 Canvas（避免部分 PDF 色彩空间 toHex 报错）
      try {
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          intent: 'print',
        }).promise
      } catch (renderErr) {
        console.warn(`[pdfTools] 第 ${pageNum} 页 print 渲染失败，尝试 display`, renderErr)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
          intent: 'display',
        }).promise
      }

      // Canvas → Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b)
            else reject(new Error(`第 ${pageNum} 页转换失败`))
          },
          FORMAT_MIME[format],
          quality,
        )
      })

      const objectUrl = URL.createObjectURL(blob)

      pages.push({
        pageNumber: pageNum,
        blob,
        width: canvas.width,
        height: canvas.height,
        objectUrl,
      })

      // 清理 page 资源
      page.cleanup()

      // 进度回调
      onProgress?.(pageNum - startPage + 1, pageCount)
    }

    return { pages, totalPages, format }
  } finally {
    await releasePdfDocument(pdf, loadingTask)
  }
}

/**
 * 释放所有页面的 ObjectURL（防止内存泄漏）
 */
export function revokeImageUrls(result: PdfToImagesResult): void {
  for (const page of result.pages) {
    URL.revokeObjectURL(page.objectUrl)
  }
}

/**
 * 将 PDF 转为单张合并长图（横向拼接或用于预览缩略图）
 * 
 * @param file - PDF File
 * @param options - 转换选项
 * @returns 合并后的单张图片 Blob
 */
export async function pdfToSingleImage(
  file: File,
  options: PdfToImagesOptions = {},
): Promise<Blob> {
  const result = await pdfToImages(file, { ...options, format: 'png' })
  
  if (result.pages.length === 1) {
    return result.pages[0].blob
  }

  // 多页合并：纵向拼接
  const totalHeight = result.pages.reduce((sum, p) => sum + p.height, 0)
  const maxWidth = Math.max(...result.pages.map((p) => p.width))

  const canvas = document.createElement('canvas')
  canvas.width = maxWidth
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')!

  // 白色背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, maxWidth, totalHeight)

  let yOffset = 0
  for (const page of result.pages) {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = page.objectUrl
    })
    // 居中绘制
    ctx.drawImage(img, (maxWidth - page.width) / 2, yOffset)
    yOffset += page.height
  }

  // 清理
  revokeImageUrls(result)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('合并图片生成失败'))
      },
      'image/png',
    )
  })
}

/** 检测 PDF 是否含可提取文字层（用于区分扫描版） */
export async function pdfHasExtractableText(file: File | Blob, minChars = 80): Promise<boolean> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  try {
    const samplePages = Math.min(pdf.numPages, 3)
    let chars = 0

    for (let p = 1; p <= samplePages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if ('str' in item && typeof item.str === 'string') {
          chars += item.str.replace(/\s/g, '').length
        }
      }
      page.cleanup()
      if (chars >= minChars) break
    }

    return chars >= minChars
  } finally {
    await releasePdfDocument(pdf, loadingTask)
  }
}

/**
 * 获取 PDF 信息（页数、是否加密等）
 */
export async function getPdfInfo(file: File): Promise<{
  totalPages: number
  isEncrypted: boolean
  fingerprint: string
}> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  try {
    return {
      totalPages: pdf.numPages,
      isEncrypted: false, // pdfjs-dist 会自动处理加密
      fingerprint: pdf.fingerprints?.[0] ?? '',
    }
  } finally {
    await releasePdfDocument(pdf, loadingTask)
  }
}
