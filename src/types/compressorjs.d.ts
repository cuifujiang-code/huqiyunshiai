declare module 'compressorjs' {
  interface CompressorOptions {
    quality?: number
    maxWidth?: number
    maxHeight?: number
    convertSize?: number
    success?: (file: File | Blob) => void
    error?: (err: Error) => void
  }
  export default class Compressor {
    constructor(file: File | Blob, options?: CompressorOptions)
  }
}
