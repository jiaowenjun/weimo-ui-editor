import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'

import { DialogPanel } from 'weimo-ui-core/components/coss/dialog'
import { ActionDialog } from 'weimo-ui-core/components/action-dialog'
import { FrostedIconButton } from 'weimo-ui-core/components/frosted-icon-button'

export type MathEditorValue = {
  kind: 'inline' | 'block'
  latex: string
}

export type MathEditorProps = {
  dialog: MathEditorValue | null
  error?: string | null
  onOpenChange: (open: boolean) => void
  onSave: (latex: string) => void
}

export function MathEditor({
  dialog,
  error,
  onOpenChange,
  onSave,
}: MathEditorProps) {
  const formId = useId()
  const latexFieldId = useId()
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const open = Boolean(dialog)

  useEffect(() => {
    setDraft(dialog?.latex ?? '')
  }, [dialog])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open, dialog])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(draft)
  }

  return (
    <ActionDialog
      bottomBarLabel="公式编辑操作栏"
      bottomBarClassName="md-editor__math-dialog-float-bar"
      bottomBarFrameClassName="md-editor__math-dialog-frame"
      bottomBarRightSlotClassName="md-editor__math-dialog-slot-right"
      bottomBarRightSlot={
        <div className="md-editor__math-dialog-action-row">
          <FrostedIconButton
            aria-label="保存"
            disabled={draft.trim().length === 0}
            form={formId}
            type="submit"
          >
            <Check />
          </FrostedIconButton>
        </div>
      }
      closeLabel="关闭公式编辑"
      onOpenChange={onOpenChange}
      open={open}
      title={dialog?.kind === 'block' ? '编辑块级公式' : '编辑行内公式'}
      toolbarLabel="公式编辑对话框标题栏"
    >
      <form className="md-editor__math-dialog" id={formId} onSubmit={handleSubmit}>
        <DialogPanel className="md-editor__math-dialog-panel">
          <div className="md-editor__math-dialog-field">
            <textarea
              aria-invalid={Boolean(error) || undefined}
              aria-label="LaTeX 源码"
              className="md-editor__math-dialog-textarea"
              id={latexFieldId}
              onChange={(event) => setDraft(event.target.value)}
              ref={textareaRef}
              rows={dialog?.kind === 'block' ? 6 : 3}
              spellCheck={false}
              value={draft}
            />
          </div>
          {error ? (
            <p className="md-editor__math-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
        </DialogPanel>
      </form>
    </ActionDialog>
  )
}
