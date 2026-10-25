import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fromTiptap,
  WdfDocument,
  type Diagnostic,
} from 'weimo-wdf'

import type { RichEditorHandle } from '../rich-editor/rich-editor'
import { toWdfEditorContent } from './wdf-editor-content'

/** 提交触发方:change=收起提交,save=Cmd+S 保存。 */
type ConversionSource = 'change' | 'save'

const CONVERSION_ERROR_RESET = 3000

/**
 * Editor Session(内部简化阶段二):WDF ↔ Tiptap 会话的数据面。
 *
 * 职责:文档所有权(受控/非受控)、会话草稿建立与结束、保存提交
 * (fromTiptap 转换 + onChange)、Cmd+S 保存、转换失败提示。不触碰
 * 卡片几何、Popover、页面滚动与相位——就绪/收起由组件协调器经
 * beginSession/endSession/commitDraft 驱动,时序契约见基线 §2。
 *
 * 行为与拆分前逐行等价:commitDraft 语义、一次会话一次 onChange、
 * 转换失败保留会话(提示 3s 自动复位)、卸载清定时器。
 */
export type EditorSession = {
  /** 当前文档(受控取 value,否则内部态)。 */
  currentDocument: WdfDocument
  /** RichEditor 挂载 ref(组件透传给 <RichEditor ref>)。 */
  editorRef: React.RefObject<RichEditorHandle | null>
  /** 会话 Tiptap 内容;null = 无会话(编辑层卸载)。 */
  sessionContent: ReturnType<typeof toWdfEditorContent> | null
  /** 转换失败提示(错误条显隐;3s 自动复位)。 */
  conversionError: boolean
  /** 开卡时建立会话:文档 → Tiptap 草稿(编辑层挂载内容)。 */
  beginSession: (document: WdfDocument) => void
  /** settle 时结束会话(须在 flushSync 内调用,保持复位次序)。 */
  endSession: () => void
  /** 提交草稿:fromTiptap 成功才提交;失败上报并返回 false。 */
  commitDraft: (source: ConversionSource) => boolean
  /** Cmd/Ctrl+S:转换成功 onSave,失败上报(不退出编辑)。 */
  handleEditorSave: (content: Parameters<typeof fromTiptap>[0]) => void
  /** 收起路径转换失败(用户请求):显示保留会话提示并定时复位。 */
  flagConversionError: () => void
}

export function useEditorSession({
  controlledValue,
  defaultValue,
  onChange,
  onConversionError,
  onSave,
}: {
  controlledValue: WdfDocument | undefined
  defaultValue: WdfDocument | undefined
  onChange?: (document: WdfDocument) => void
  onConversionError?: (
    diagnostics: Diagnostic[],
    source: ConversionSource,
  ) => void
  onSave?: (document: WdfDocument) => void
}): EditorSession {
  const [internalDoc, setInternalDoc] = useState<WdfDocument>(
    () => controlledValue ?? defaultValue ?? WdfDocument.empty(),
  )
  const [sessionContent, setSessionContent] = useState<ReturnType<
    typeof toWdfEditorContent
  > | null>(null)
  const [conversionError, setConversionError] = useState(false)

  const editorRef = useRef<RichEditorHandle | null>(null)
  const errorTimerRef = useRef<number | null>(null)

  const isDocControlled = controlledValue !== undefined
  const currentDocument = isDocControlled ? controlledValue : internalDoc

  // 供回调读取最新 props 的 ref 集(与拆分前同模式)。
  const onChangeRef = useRef(onChange)
  const onConversionErrorRef = useRef(onConversionError)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onConversionErrorRef.current = onConversionError
  onSaveRef.current = onSave

  // 卸载兜底:清错误提示定时器。
  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current)
      }
    }
  }, [])

  const beginSession = useCallback((document: WdfDocument) => {
    setSessionContent(toWdfEditorContent(document))
  }, [])

  const endSession = useCallback(() => {
    setSessionContent(null)
  }, [])

  const commitDraft = useCallback(
    (source: ConversionSource) => {
      const draft = editorRef.current?.getContent()
      if (!draft) return true

      const result = fromTiptap(draft)
      if (!result.ok) {
        onConversionErrorRef.current?.(result.diagnostics, source)
        return false
      }

      if (!isDocControlled) {
        setInternalDoc(result.value)
      }
      onChangeRef.current?.(result.value)
      return true
    },
    [isDocControlled],
  )

  const handleEditorSave = useCallback(
    (content: Parameters<typeof fromTiptap>[0]) => {
      const result = fromTiptap(content)
      if (result.ok) {
        onSaveRef.current?.(result.value)
        return
      }
      onConversionErrorRef.current?.(result.diagnostics, 'save')
    },
    [],
  )

  const flagConversionError = useCallback(() => {
    setConversionError(true)
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current)
    }
    errorTimerRef.current = window.setTimeout(
      () => setConversionError(false),
      CONVERSION_ERROR_RESET,
    )
  }, [])

  return {
    currentDocument,
    editorRef,
    sessionContent,
    conversionError,
    beginSession,
    endSession,
    commitDraft,
    handleEditorSave,
    flagConversionError,
  }
}
