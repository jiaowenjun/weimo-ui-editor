import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import katex from 'katex'
import { ChevronsRightLeft, Pencil } from 'lucide-react'

import { Menu, MenuItem, MenuPopup, MenuTrigger } from 'weimo-ui-core/components/menu'
import {
  convertBlockMathToInline,
  convertInlineMathToBlock,
} from './md-editor-math-conversion'

type MdEditorMathKind = 'inline' | 'block'

type MdEditorMathViewProps = ReactNodeViewProps & {
  kind: MdEditorMathKind
}

function MdEditorMathView({
  editor,
  extension,
  getPos,
  kind,
  node,
}: MdEditorMathViewProps) {
  const mathRef = useRef<HTMLElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const latex = String(node.attrs.latex ?? '')
  const katexOptions = extension.options.katexOptions
  const inline = kind === 'inline'
  const convertLabel = inline ? '转为块级公式' : '转为行内公式'

  useEffect(() => {
    const element = mathRef.current

    if (!element) return

    try {
      katex.render(latex, element, katexOptions)
    } catch {
      element.textContent = latex
    }
  }, [katexOptions, latex])

  function resolvePosition() {
    const pos = getPos()

    return typeof pos === 'number' ? pos : null
  }

  function handleEdit() {
    const pos = resolvePosition()

    if (pos === null || !editor.isEditable) return

    setMenuOpen(false)
    extension.options.onClick?.(node, pos)
  }

  function handleDoubleClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    handleEdit()
  }

  function handleConvert() {
    const pos = resolvePosition()

    if (pos === null || !editor.isEditable) return

    setMenuOpen(false)

    if (inline) {
      convertInlineMathToBlock(editor, pos)
      return
    }

    convertBlockMathToInline(editor, pos)
  }

  const mathContent = inline ? (
    <span ref={(element) => { mathRef.current = element }} className="inline-math-inner" />
  ) : (
    <div ref={(element) => { mathRef.current = element }} className="block-math-inner" />
  )

  return (
    <Menu
      disabled={!editor.isEditable}
      modal={false}
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <MenuTrigger
        aria-label={inline ? '行内公式操作菜单' : '块级公式操作菜单'}
        disabled={!editor.isEditable}
        nativeButton={false}
        render={
          <NodeViewWrapper
            as={inline ? 'span' : 'div'}
            className="md-editor__math-trigger"
            contentEditable={false}
            onDoubleClick={handleDoubleClick}
          />
        }
      >
        {mathContent}
      </MenuTrigger>
      <MenuPopup align="end" className="md-editor__math-menu" side="top">
        <MenuItem onClick={handleConvert}>
          <ChevronsRightLeft aria-hidden="true" />
          {convertLabel}
        </MenuItem>
        <MenuItem onClick={handleEdit}>
          <Pencil aria-hidden="true" />
          编辑
        </MenuItem>
      </MenuPopup>
    </Menu>
  )
}

export function MdEditorInlineMathView(props: ReactNodeViewProps) {
  return <MdEditorMathView {...props} kind="inline" />
}

export function MdEditorBlockMathView(props: ReactNodeViewProps) {
  return <MdEditorMathView {...props} kind="block" />
}
