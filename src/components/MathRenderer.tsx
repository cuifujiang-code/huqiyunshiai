/** 统一 MathRenderer — 复用 common 实现（含 OCR 预处理与 latexBlocks） */
export {
  default,
  renderLatexText,
  KatexFormula,
  analyzeMathContent,
  type MathRenderStats,
} from './common/MathRenderer'
