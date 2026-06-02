/**
 * 图片压缩工具模块 — 基于 compressorjs
 *
 * 依赖: npm install compressorjs
 *
 * 使用示例:
 *   import { compressImage, compressForScene } from '@/utils/imageCompress'
 *   const { blob, file, url } = await compressForScene(file, 'screenshot')
 */

import Compressor from 'compressorjs'

// --------------- 类型定义 ---------------

/** 压缩场景预设 */
export type CompressScene = 'mobile' | 'screenshot' | 'avatar' | 'upload'

/** 输出格式 */
export type CompressFormat = 'jpeg' | 'png' | 'webp'

/** 压缩选项 */
export interface ImageCompressOptions {
  /** 输出质量 0-1 */
  quality?: number
  /** 最大宽度（px） */
  maxWidth?: number
  /** 最大高度（px） */
  maxHeight?: number
  /** 输出格式 */
  format?: CompressFormat
  /** 是否保留 EXIF 信息 */
  retainExif?: boolean
  /** 最小宽度/高度（低于此值不缩放），默认 0 */
  minWidth?: number
  minHeight?: number
  /** 转换前检查图片尺寸 */
  checkOrientation?: boolean
  /** 成功回调 */
  onSuccess?: (result: CompressResult) => void
  /** 错误回调 */
  onError?: (error: Error) => void
  /** AbortSignal */
  signal?: AbortSignal
}

/** 压缩结果 */
export interface CompressResult {
  /** 压缩后 Blob */
  blob: Blob
  /** 压缩后 File */
  file: File
  /** 压缩后 ObjectURL（需手动 revoke） */
  url: string
  /** 原始文件大小（bytes） */
  originalSize: number
  /** 压缩后大小（bytes） */
  compressedSize: number
  /** 压缩率（节省的百分比） */
  reductionPercent: number
  /** 输出格式 */
  format: CompressFormat
}

// --------------- 场景预设配置 ---------------

interface ScenePreset {
  quality: number
  maxWidth: number
  maxHeight: number
  format: CompressFormat
  description: string
}

/** 场景预设表 */
const SCENE_PRESETS: Record<CompressScene, ScenePreset> = {
  mobile: {
    quality: 0.7,
    maxWidth: 1600,
    maxHeight: 2400,
    format: 'jpeg',
    description: '移动端拍照 — 平衡质量与大小',
  },
  screenshot: {
    quality: 0.85,
    maxWidth: 1920,
    maxHeight: 2560,
    format: 'png',
    description: '题目截图 — 保留文字清晰度',
  },
  avatar: {
    quality: 0.8,
    maxWidth: 400,
    maxHeight: 400,
    format: 'png',
    description: '头像上传 — 小尺寸方形裁剪',
  },
  upload: {
    quality: 0.9,
    maxWidth: 2048,
    maxHeight: 3072,
    format: 'jpeg',
    description: '通用上传 — 较高质量满足多数场景',
  },
}

// --------------- 工具函数 ---------------

/** 原始文件名 → 保留原名 */
function preserveFileName(original: File, newExt: CompressFormat): string {
  const name = original.name.replace(/\.[^.]+$/, '')
  return `${name}.${newExt}`
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 获取场景预设参数
 */
export function getScenePreset(scene: CompressScene): ScenePreset {
  return { ...SCENE_PRESETS[scene] }
}

/**
 * 判断图片是否需要压缩（小于阈值的图跳过）
 * @param file 图片文件
 * @param minSizeKB 最小阈值（KB），默认 100KB
 */
export function shouldCompress(file: File, minSizeKB: number = 100): boolean {
  return file.size > minSizeKB * 1024
}

// --------------- 核心压缩函数 ---------------

/**
 * 压缩单张图片
 *
 * @param file - 图片 File 对象
 * @param options - 压缩选项
 * @returns 压缩结果
 */
export function compressImage(
  file: File,
  options: ImageCompressOptions = {},
): Promise<CompressResult> {
  const originalSize = file.size

  return new Promise((resolve, reject) => {
    const compressor = new Compressor(file, {
      quality: options.quality ?? 0.85,
      maxWidth: options.maxWidth ?? 1920,
      maxHeight: options.maxHeight ?? 2560,
      minWidth: options.minWidth ?? 0,
      minHeight: options.minHeight ?? 0,
      mimeType: options.format ? `image/${options.format}` : undefined,
      convertSize: 5_000_000, // 5MB 以上自动转 jpeg
      checkOrientation: options.checkOrientation ?? true,
        retainExif: options.retainExif ?? false,

      success(result: Blob) {
        const compressedSize = result.size
        const reductionPercent = originalSize > 0
          ? Math.round(((originalSize - compressedSize) / originalSize) * 100)
          : 0

        // 推测输出格式
        let format: CompressFormat = options.format ?? 'jpeg'
        if (result.type === 'image/png') format = 'png'
        else if (result.type === 'image/webp') format = 'webp'

        const compressedFile = new File([result], preserveFileName(file, format), {
          type: result.type,
        })
        const url = URL.createObjectURL(result)

        const compressResult: CompressResult = {
          blob: result,
          file: compressedFile,
          url,
          originalSize,
          compressedSize,
          reductionPercent,
          format,
        }

        options.onSuccess?.(compressResult)
        resolve(compressResult)
      },

      error(err: Error) {
        options.onError?.(err)
        reject(new Error(`图片压缩失败: ${err.message}`))
      },
    })
  })
}

/**
 * 按场景压缩图片（自动选择预设参数）
 *
 * @param file - 图片 File
 * @param scene - 场景名称
 * @param overrides - 可覆盖预设参数
 * @returns 压缩结果
 */
export async function compressForScene(
  file: File,
  scene: CompressScene,
  overrides?: Partial<ImageCompressOptions>,
): Promise<CompressResult> {
  const preset = SCENE_PRESETS[scene]

  return compressImage(file, {
    quality: overrides?.quality ?? preset.quality,
    maxWidth: overrides?.maxWidth ?? preset.maxWidth,
    maxHeight: overrides?.maxHeight ?? preset.maxHeight,
    format: overrides?.format ?? preset.format,
    retainExif: overrides?.retainExif,
    signal: overrides?.signal,
  })
}

/**
 * 批量压缩图片（控制并发数）
 *
 * @param files - 图片文件数组
 * @param scene - 场景（对所有文件应用相同参数）
 * @param concurrency - 并发数，默认 3
 * @returns 压缩结果数组
 */
export async function compressBatch(
  files: File[],
  scene: CompressScene,
  concurrency: number = 3,
): Promise<(CompressResult | Error)[]> {
  const results: (CompressResult | Error)[] = new Array(files.length)
  let index = 0

  async function worker() {
    while (index < files.length) {
      const i = index++
      try {
        results[i] = await compressForScene(files[i], scene)
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker())
  await Promise.all(workers)

  return results
}

// --------------- React Hook ---------------

/**
 * 图片压缩 Hook（用于 React 组件中）
 *
 * @example
 *   const { compress, compressing, result, error } = useImageCompress()
 *   const handleFile = async (file: File) => {
 *     const r = await compress(file, 'screenshot')
 *     // 使用 r.url 预览, r.blob 上传
 *   }
 */
export function createImageCompressHandler() {
  let currentController: AbortController | null = null

  return {
    /**
     * 执行压缩（自动取消上次操作）
     */
    async compress(
      file: File,
      scene: CompressScene = 'upload',
      overrides?: Partial<ImageCompressOptions>,
    ): Promise<CompressResult> {
      // 取消上一次操作
      currentController?.abort()
      currentController = new AbortController()

      return compressForScene(file, scene, {
        ...overrides,
        signal: currentController.signal,
      })
    },

    /** 取消当前压缩 */
    cancel(): void {
      currentController?.abort()
      currentController = null
    },
  }
}

// --------------- 场景说明导出 ---------------

export const SCENE_DESCRIPTIONS: Record<CompressScene, string> = Object.fromEntries(
  Object.entries(SCENE_PRESETS).map(([key, val]) => [key, val.description]),
) as Record<CompressScene, string>

export { SCENE_PRESETS }
