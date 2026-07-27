import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import type { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { extractLatexFromClipboard, joinLatexParts } from '../lib/mathtypePaste'
import { inputClass } from '../types/teacher'

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
const HTML_IMG_RE = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*\/?>/gi

export interface QuestionRichTextEditorHandle {
  focus: () => void
  insertText: (text: string) => void
  insertImageMarkdown: (url: string, alt?: string) => void
}

export interface QuestionRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onPasteImage?: (file: File) => Promise<string | null>
  placeholder?: string
  minRows?: number
  disabled?: boolean
}

function plainToDoc(text: string) {
  const lines = (text ?? '').split('\n')
  if (lines.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] }
  }
  return {
    type: 'doc',
    content: lines.map((line) => {
      const content: { type: string; text?: string; attrs?: Record<string, string> }[] = []
      const tokens: { index: number; len: number; src: string; alt: string }[] = []
      MD_IMAGE_RE.lastIndex = 0
      HTML_IMG_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = MD_IMAGE_RE.exec(line)) !== null) {
        tokens.push({ index: m.index, len: m[0].length, src: m[2], alt: m[1] || '题目图片' })
      }
      while ((m = HTML_IMG_RE.exec(line)) !== null) {
        const altMatch = m[0].match(/alt=["']([^"']*)["']/i)
        tokens.push({ index: m.index, len: m[0].length, src: m[1], alt: altMatch?.[1] || '题目图片' })
      }
      tokens.sort((a, b) => a.index - b.index)
      let last = 0
      for (const tok of tokens) {
        if (tok.index > last) {
          content.push({ type: 'text', text: line.slice(last, tok.index) })
        }
        content.push({
          type: 'image',
          attrs: { src: tok.src, alt: tok.alt, title: tok.alt },
        })
        last = tok.index + tok.len
      }
      if (last < line.length) {
        content.push({ type: 'text', text: line.slice(last) })
      }
      return { type: 'paragraph', content: content.length ? content : undefined }
    }),
  }
}

function docToPlain(editor: Editor): string {
  const lines: string[] = []
  editor.state.doc.forEach((node) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
    let line = ''
    node.forEach((child) => {
      if (child.isText) {
        line += child.text ?? ''
      } else       if (child.type.name === 'image') {
        const alt = String(child.attrs.alt ?? '题目图片')
        const src = String(child.attrs.src ?? '')
        if (src) {
          line += src.startsWith('data:') || src.startsWith('http')
            ? `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;" />`
            : `![${alt}](${src})`
        }
      } else if (child.type.name === 'hardBreak') {
        line += '\n'
      }
    })
    lines.push(line)
  })
  return lines.join('\n')
}

function createMathPastePlugin(
  getUpload: () => ((file: File) => Promise<string | null>) | undefined,
): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const clipboard = event.clipboardData
        if (!clipboard) return false

        const upload = getUpload()
        const imageFiles = Array.from(clipboard.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (imageFiles.length > 0 && upload) {
          event.preventDefault()
          void (async () => {
            for (const file of imageFiles) {
              const url = await upload(file)
              if (url) {
                const md = `![题目图片](${url})`
                const { from, to } = view.state.selection
                view.dispatch(view.state.tr.insertText(md, from, to))
              }
            }
          })()
          return true
        }

        const html = clipboard.getData('text/html')
        const plain = clipboard.getData('text/plain')
        const latexParts = extractLatexFromClipboard(html, plain)
        if (latexParts.length > 0) {
          event.preventDefault()
          const insert = joinLatexParts(latexParts)
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(insert, from, to))
          return true
        }

        return false
      },
    },
  })
}

function createPasteExtension(getUpload: () => ((file: File) => Promise<string | null>) | undefined) {
  return Extension.create({
    name: 'questionMathPaste',
    addProseMirrorPlugins() {
      return [createMathPastePlugin(getUpload)]
    },
  })
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition ${
        active
          ? 'bg-cyan-600/30 text-cyan-200'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

const QuestionRichTextEditor = forwardRef<QuestionRichTextEditorHandle, QuestionRichTextEditorProps>(
  function QuestionRichTextEditor(
    { value, onChange, onFocus, onPasteImage, placeholder, minRows = 4, disabled },
    ref,
  ) {
    const onPasteImageRef = useRef(onPasteImage)
    onPasteImageRef.current = onPasteImage
    const syncingRef = useRef(false)
    const lastEmittedRef = useRef(value)

    const pasteExtension = useRef(createPasteExtension(() => onPasteImageRef.current)).current

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          code: false,
          horizontalRule: false,
        }),
        Underline,
        Image.configure({ inline: false, allowBase64: false }),
        pasteExtension,
      ],
      content: plainToDoc(value),
      editable: !disabled,
      editorProps: {
        attributes: {
          class: 'prose prose-invert max-w-none focus:outline-none text-sm text-slate-100',
          'data-placeholder': placeholder ?? '',
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (syncingRef.current) return
        const plain = docToPlain(ed)
        lastEmittedRef.current = plain
        onChange(plain)
      },
      onFocus: () => onFocus?.(),
    })

    useEffect(() => {
      if (!editor || value === lastEmittedRef.current) return
      syncingRef.current = true
      editor.commands.setContent(plainToDoc(value), { emitUpdate: false })
      lastEmittedRef.current = value
      syncingRef.current = false
    }, [editor, value])

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      insertText: (text: string) => {
        if (!editor) return
        editor.chain().focus().insertContent(text).run()
      },
      insertImageMarkdown: (url: string, alt = '题目图片') => {
        if (!editor) return
        editor.chain().focus().insertContent(`![${alt}](${url})`).run()
      },
    }))

    if (!editor) return null

    const minH = `${minRows * 1.5}rem`

    return (
      <div className={`question-rich-editor rounded-lg border border-slate-600 bg-slate-800/80 ${disabled ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap gap-0.5 border-b border-slate-600/80 px-2 py-1.5">
          <ToolbarButton
            title="加粗"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            title="斜体"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            title="下划线"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <span className="mx-1 w-px self-stretch bg-slate-600" />
          <ToolbarButton
            title="无序列表"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            • 列表
          </ToolbarButton>
          <ToolbarButton
            title="有序列表"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1. 列表
          </ToolbarButton>
          <ToolbarButton
            title="引用"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            “ 引用
          </ToolbarButton>
        </div>
        <div
          className={`${inputClass} border-0 bg-transparent px-3 py-2`}
          style={{ minHeight: minH }}
        >
          <EditorContent editor={editor} />
        </div>
        <style>{`
          .question-rich-editor .ProseMirror { min-height: ${minH}; outline: none; }
          .question-rich-editor .ProseMirror p { margin: 0.35em 0; }
          .question-rich-editor .ProseMirror img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.25rem 0; }
          .question-rich-editor .ProseMirror blockquote {
            border-left: 3px solid rgb(34 211 238 / 0.4);
            padding-left: 0.75rem;
            color: rgb(148 163 184);
          }
          .question-rich-editor .ProseMirror ul, .question-rich-editor .ProseMirror ol {
            padding-left: 1.25rem;
            margin: 0.35em 0;
          }
          .question-rich-editor .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: rgb(100 116 139);
            pointer-events: none;
            height: 0;
          }
        `}</style>
      </div>
    )
  },
)

export default QuestionRichTextEditor
