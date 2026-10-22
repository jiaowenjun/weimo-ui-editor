import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { Bold, Check, Heading1, List, Pencil, Quote, X } from 'lucide-react'

import { cn } from 'weimo-ui-core/lib/utils'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { fromTiptap, WdfDocument, type Diagnostic } from 'weimo-wdf'

import {
  RichEditor,
  type RichEditorBlockFormat,
  type RichEditorFocusPosition,
  type RichEditorHandle,
  type RichEditorProps,
  type RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
import { WdfRender, type WdfRenderProps } from '../wdf-render/wdf-render'
import { toWdfEditorContent } from '../wdf-view/wdf-editor-content'
import {
  applyRect,
  clearShellGeometry,
  getDialogRect,
  getFocusableElements,
  getMorphDuration,
  hideFromTopLayer,
  inertSiblingsOf,
  KEYBOARD_CLOSE_WAIT,
  MORPH_PAD,
  showInTopLayer,
  stageVisibilityHandoff,
} from './card-shell'

import 'weimo-ui-editor/styles/mobile-wdf-view.css'

export type {
  RichEditorBlockFormat,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
export type { Diagnostic, WdfDocument } from 'weimo-wdf'

export type MobileWdfViewMode = 'view' | 'edit'
export type MobileWdfViewConversionSource = 'change' | 'save'

/**
 * MobileWdfView:卡片式 WDF 读写视图。
 *
 * 稳定 CardShell 承载 popover top layer 与 FLIP 动画;WdfRender 常驻衬底
 * (查看态内容 + 展开准备期的视觉底);RichEditor 按编辑会话挂载,onReady
 * 后才启动展开动画(无空白首帧)。收起走 fix-v3 清理序列(iOS Safari
 * 状态栏修复,详见 docs/ios-safari-statusbar-toplayer.md)。
 *
 * 键盘策略:点正文唤起(autoFocus 可选展开后程序聚焦;iOS 手势外 focus
 * 只落选区不弹键盘)。
 */
export type MobileWdfViewProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title' | 'onChange' | 'value' | 'defaultValue'
> & {
  /**
   * 受控模式;省略时组件自管理(点卡片进编辑,X/Esc/遮罩收起)。
   */
  mode?: MobileWdfViewMode
  /** 非受控初始模式,默认 view。 */
  defaultMode?: MobileWdfViewMode
  /**
   * 用户交互请求切换模式时触发(点卡片/X/Esc/遮罩)。转换失败的收起
   * 不会触发 view——会话被保留,父级不应切换。
   */
  onModeChange?: (mode: MobileWdfViewMode) => void
  /**
   * WDF 文档。会话期间收到的外部更新不会覆盖会话草稿(对齐 WdfView)。
   */
  value?: WdfDocument
  defaultValue?: WdfDocument
  /** 收起时草稿经 fromTiptap 转换成功后提交,一次会话一次。 */
  onChange?: (document: WdfDocument) => void
  /** Cmd/Ctrl+S 保存,不退出编辑。 */
  onSave?: (document: WdfDocument) => void
  /** 转换失败上报;组件内同时显示保留会话提示。 */
  onConversionError?: (
    diagnostics: Diagnostic[],
    source: MobileWdfViewConversionSource,
  ) => void
  /**
   * 展开完成后自动聚焦(卡片自有时机:edit 达成时;不透传
   * RichEditor.autoFocus,因其触发点在准备期、编辑层尚不可见)。
   * 默认 false(点正文唤起键盘)。
   */
  autoFocus?: boolean
  /** 自动聚焦光标位置,默认 end(对齐 WdfView)。 */
  autoFocusPosition?: RichEditorFocusPosition
  /** 卡片标题(展开态作为 dialog 的可访问名称)。 */
  title?: ReactNode
  /**
   * 查看态内容区最大高度(默认 300):卡片高度由内容撑起,超出此值
   * 在卡片内部滚动;传 'none' 则不设上限(内容整体撑高,卡片可超出
   * 视口);编辑态为对话框几何,不受此参数影响。
   */
  viewMaxHeight?: number | string
  /** 透传 WdfRender(查看态与常驻衬底)。 */
  renderProps?: Omit<WdfRenderProps, 'content'>
  /**
   * 透传 RichEditor。内容通道(value/defaultValue/onChange/onSave)与
   * 聚焦时序(autoFocus/autoFocusPosition/onReady)由组件接管,传入即被忽略。
   */
  editorProps?: Omit<
    RichEditorProps,
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'onSave'
    | 'autoFocus'
    | 'autoFocusPosition'
    | 'onReady'
  >
}

export type MobileWdfViewHandle = {
  /** 请求进入编辑(受控模式下经 onModeChange,由父级决定)。 */
  open: () => void
  /** 请求收起;经转换,失败则保留会话并上报 onConversionError。 */
  close: () => void
  focus: (position?: RichEditorFocusPosition) => void
  clear: () => void
  /** 会话草稿的 WDF 形态;非会话期返回当前文档(对齐 WdfView 语义)。 */
  getContent: () => WdfDocument
  getContentHeight: () => number
  getSelectionFormat: () => RichEditorSelectionFormat | null
  setBold: (active: boolean) => boolean
  toggleBold: () => boolean
  setBlockFormat: (format: RichEditorBlockFormat) => boolean
  toggleBlockFormat: (
    format: Exclude<RichEditorBlockFormat, 'paragraph'>,
  ) => boolean
}

const ANIMATING_CLASS = 'mobile-wdf-view__card--animating'
const EDITOR_READY_TIMEOUT = 800
const AUTO_FOCUS_RETRIES = 3
const AUTO_FOCUS_RETRY_DELAY = 50
const CONVERSION_ERROR_RESET = 3000

type CardPhase = 'view' | 'prepare' | 'opening' | 'edit' | 'closing'
type CloseSource = 'user' | 'external'

export const MobileWdfView = forwardRef<MobileWdfViewHandle, MobileWdfViewProps>(
  function MobileWdfView(
    {
      autoFocus = false,
      autoFocusPosition = 'end',
      className,
      defaultMode = 'view',
      defaultValue,
      editorProps,
      mode,
      onChange,
      onConversionError,
      onModeChange,
      onSave,
      renderProps,
      style,
      title,
      value,
      viewMaxHeight = 300,
      ...props
    },
    ref,
  ) {
    const titleId = useId()
    const [phase, setPhase] = useState<CardPhase>('view')
    const [internalMode, setInternalMode] = useState<MobileWdfViewMode>(defaultMode)
    const [internalDoc, setInternalDoc] = useState<WdfDocument>(
      () => value ?? defaultValue ?? WdfDocument.empty(),
    )
    const [editorReady, setEditorReady] = useState(false)
    const [conversionError, setConversionError] = useState(false)
    const [selectionFormat, setSelectionFormat] =
      useState<RichEditorSelectionFormat | null>(null)
    const [sessionContent, setSessionContent] = useState<ReturnType<
      typeof toWdfEditorContent
    > | null>(null)

    const slotRef = useRef<HTMLDivElement | null>(null)
    const shellRef = useRef<HTMLDivElement | null>(null)
    const backdropRef = useRef<HTMLDivElement | null>(null)
    const editorRef = useRef<RichEditorHandle | null>(null)
    const phaseRef = useRef<CardPhase>('view')
    const timerRef = useRef<number | null>(null)
    const readyTimerRef = useRef<number | null>(null)
    const errorTimerRef = useRef<number | null>(null)
    const savedScrollYRef = useRef(0)
    const bodyOverflowRef = useRef('')
    const bodyPaddingRightRef = useRef('')
    const inertedRef = useRef<HTMLElement[]>([])
    const lockedRef = useRef(false)
    const closeSourceRef = useRef<CloseSource>('user')

    const isModeControlled = mode !== undefined
    const isDocControlled = value !== undefined
    const activeMode = isModeControlled ? mode : internalMode
    const currentDocument = isDocControlled ? value : internalDoc

    // 供定时器/命令式句柄读取最新 props 的 ref 集。
    const onChangeRef = useRef(onChange)
    const onConversionErrorRef = useRef(onConversionError)
    const onModeChangeRef = useRef(onModeChange)
    const onSaveRef = useRef(onSave)
    const autoFocusRef = useRef(autoFocus)
    const autoFocusPositionRef = useRef(autoFocusPosition)
    const isModeControlledRef = useRef(isModeControlled)
    const currentDocumentRef = useRef(currentDocument)
    const viewMaxHeightRef = useRef(viewMaxHeight)

    phaseRef.current = phase
    onChangeRef.current = onChange
    onConversionErrorRef.current = onConversionError
    onModeChangeRef.current = onModeChange
    onSaveRef.current = onSave
    autoFocusRef.current = autoFocus
    autoFocusPositionRef.current = autoFocusPosition
    isModeControlledRef.current = isModeControlled
    currentDocumentRef.current = currentDocument
    viewMaxHeightRef.current = viewMaxHeight

    const lockBody = useCallback(() => {
      if (lockedRef.current) return

      lockedRef.current = true
      bodyOverflowRef.current = document.body.style.overflow
      bodyPaddingRightRef.current = document.body.style.paddingRight
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) {
        const currentPadding = bodyPaddingRightRef.current || '0px'
        document.body.style.paddingRight = `calc(${currentPadding} + ${scrollbarWidth}px)`
      }
    }, [])

    const unlockBody = useCallback(() => {
      if (!lockedRef.current) return

      lockedRef.current = false
      document.body.style.overflow = bodyOverflowRef.current
      document.body.style.paddingRight = bodyPaddingRightRef.current
    }, [])

    const settleToView = useCallback(() => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      /*
       * 先同步切回 view 布局,再退 top layer(fix-v3 时序修复):内容撑高
       * 模型下,closing 态的 render 仍是 absolute(不贡献高度),若清几何/
       * 释放钉高先于 view 重渲染被绘制,卡片会塌到 header 高度再弹回
       * (落位闪烁)。flushSync 保证本 tick 内完成:render 转 static、编辑
       * 层卸载、slot 回到内容高度——塌陷窗口不存在,且替身克隆的就是
       * view 态 DOM,与真实壳渲染一致。
       */
      if (phaseRef.current !== 'view') {
        phaseRef.current = 'view'
        flushSync(() => {
          setPhase('view')
          setEditorReady(false)
          setSessionContent(null)
        })
      }

      // ---- fix-v3 收起清理(hidePopover 之后需经历一次不可见绘制) ----
      hideFromTopLayer(shell)
      hideFromTopLayer(backdropRef.current)
      clearShellGeometry(shell, ANIMATING_CLASS)
      slot.style.height = ''
      unlockBody()
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
      if (window.scrollY !== savedScrollYRef.current) {
        window.scrollTo(0, savedScrollYRef.current)
      }

      // Ghost 替身 + 1 帧隐藏:唤回状态栏重采样,像素连续消除闪烁。
      const restoreHandoff = stageVisibilityHandoff(shell, slot)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restoreHandoff)
      })
      window.setTimeout(restoreHandoff, 64)

      if (closeSourceRef.current === 'user') {
        onModeChangeRef.current?.('view')
        if (!isModeControlledRef.current) {
          setInternalMode('view')
        }
      }
    }, [unlockBody])

    // 卸载兜底:清定时器、退 top layer、解锁、去 inert。
    useEffect(() => {
      return () => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        if (readyTimerRef.current !== null) {
          window.clearTimeout(readyTimerRef.current)
        }
        if (errorTimerRef.current !== null) {
          window.clearTimeout(errorTimerRef.current)
        }
        hideFromTopLayer(shellRef.current)
        hideFromTopLayer(backdropRef.current)
        document.body.style.overflow = bodyOverflowRef.current
        document.body.style.paddingRight = bodyPaddingRightRef.current
        for (const element of inertedRef.current) {
          element.removeAttribute('inert')
        }
        inertedRef.current = []
      }
    }, [])

    const commitDraft = useCallback(
      (source: MobileWdfViewConversionSource) => {
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

    const startOpening = useCallback(() => {
      const shell = shellRef.current
      if (!shell || phaseRef.current !== 'prepare') return

      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
        readyTimerRef.current = null
      }

      setEditorReady(true)
      phaseRef.current = 'opening'
      setPhase('opening')

      void shell.getBoundingClientRect()
      const duration = getMorphDuration()
      window.requestAnimationFrame(() => {
        if (phaseRef.current !== 'opening') return
        if (duration > 0) {
          shell.classList.add(ANIMATING_CLASS)
        }
        applyRect(shell, getDialogRect())
      })
      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'opening' || !shell.isConnected) return

        shell.classList.remove(ANIMATING_CLASS)
        phaseRef.current = 'edit'
        setPhase('edit')

        // 自动聚焦(卡片自有时机):编辑器 handle 就绪时序偶发偏晚,
        // 带「已聚焦即停」守卫的重试兜底。
        if (autoFocusRef.current) {
          const tryFocusEditor = (attempts: number) => {
            const content = shell.querySelector<HTMLElement>(
              '.rich-editor__content',
            )
            if (content?.contains(document.activeElement)) return
            if (attempts <= 0) return

            editorRef.current?.focus(autoFocusPositionRef.current)
            window.setTimeout(() => tryFocusEditor(attempts - 1), AUTO_FOCUS_RETRY_DELAY)
          }
          tryFocusEditor(AUTO_FOCUS_RETRIES)
        }
      }, duration + MORPH_PAD)
    }, [])

    const handleEditorReady = useCallback(() => {
      if (phaseRef.current !== 'prepare') return

      // 等一拍让首帧内容真正上屏,避免动画起点拍到骨架屏。
      readyTimerRef.current = window.setTimeout(startOpening, 50)
    }, [startOpening])

    const openCard = useCallback(() => {
      if (phaseRef.current !== 'view') return

      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      closeSourceRef.current = 'user'
      phaseRef.current = 'prepare'
      savedScrollYRef.current = window.scrollY
      lockBody()

      const first = shell.getBoundingClientRect()
      slot.style.height = `${slot.getBoundingClientRect().height}px`
      if (inertedRef.current.length === 0) {
        inertedRef.current = inertSiblingsOf(shell, backdropRef.current)
      }

      const topLayerSupported = showInTopLayer(backdropRef.current)
      showInTopLayer(shell)
      if (!topLayerSupported) {
        // 降级:无 popover API 的浏览器继续走 fixed 覆盖层,可能被祖先
        // overflow/transform 裁剪;现代浏览器均支持,仅为兜底。
        console.warn('[mobile-wdf-view] Popover API 不可用,降级为 fixed 覆盖层')
      }

      shell.classList.remove(ANIMATING_CLASS)
      shell.style.position = 'fixed'
      shell.style.zIndex = '101'
      shell.style.margin = '0'
      shell.style.right = 'auto'
      shell.style.bottom = 'auto'
      applyRect(shell, {
        top: first.top,
        left: first.left,
        width: first.width,
        height: first.height,
      })

      setEditorReady(false)
      setSessionContent(toWdfEditorContent(currentDocumentRef.current))
      setPhase('prepare')

      readyTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current === 'prepare') {
          console.warn('[mobile-wdf-view] editor ready 超时,直接展开')
          startOpening()
        }
      }, EDITOR_READY_TIMEOUT)
    }, [lockBody, startOpening])

    /**
     * 测量「收起后的 view 态卡片高度」:复制衬底 DOM 到脱离会话布局的
     * 隐藏探针(定宽、高自动)读内容高度。不能直接读 render.scrollHeight
     * ——会话态衬底是 absolute inset:0,scrollHeight 的下限是盒高
     * (对话框 body 高),短内容会被抬高,经 viewMaxHeight 钳制后恒等于
     * 上限,导致删短保存/取消路径的动画目标错到 header+viewMax。
     * 内容高度经 viewMaxHeight(任意 CSS 长度,同样经探针解析为像素)
     * 钳制后加 header 与边框。测量失败返回 null,回退钉住矩形。
     */
    const measureNextViewHeight = useCallback((): number | null => {
      const shell = shellRef.current
      const slot = slotRef.current
      const render = shell?.querySelector<HTMLElement>('.mobile-wdf-view__render')
      const header = shell?.querySelector<HTMLElement>('.mobile-wdf-view__header')
      if (!shell || !slot || !render || !header) return null

      const shellStyle = getComputedStyle(shell)
      const borderWidth =
        parseFloat(shellStyle.borderTopWidth || '0') +
        parseFloat(shellStyle.borderBottomWidth || '0')

      // 'none' = 不设上限:内容整体撑高,跳过钳制与上限探针。
      const unbounded = viewMaxHeightRef.current === 'none'

      // viewMaxHeight → px(任意 CSS 长度经隐藏探针解析)
      let maxPx = Number.POSITIVE_INFINITY
      if (!unbounded) {
        const maxProbe = document.createElement('div')
        maxProbe.style.cssText =
          'position:absolute;visibility:hidden;pointer-events:none;height:var(--mobile-wdf-view-max-height, 300px)'
        slot.appendChild(maxProbe)
        maxPx = maxProbe.offsetHeight
        maxProbe.remove()
        if (!(maxPx > 0)) return null
      }

      // 真实内容高度:克隆衬底 DOM,脱离 inset 布局,与 view 态同宽。
      const contentProbe = render.cloneNode(true) as HTMLElement
      contentProbe.style.position = 'absolute'
      contentProbe.style.visibility = 'hidden'
      contentProbe.style.pointerEvents = 'none'
      contentProbe.style.inset = 'auto'
      contentProbe.style.width = `${slot.clientWidth - borderWidth}px`
      contentProbe.style.maxHeight = 'none'
      contentProbe.style.overflow = 'visible'
      slot.appendChild(contentProbe)
      const contentHeight = contentProbe.scrollHeight
      contentProbe.remove()
      if (!(contentHeight > 0)) return null

      const nextHeight =
        header.offsetHeight + Math.min(contentHeight, maxPx) + borderWidth

      return nextHeight > 0 ? nextHeight : null
    }, [])

    const runCloseAnimation = useCallback(() => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      const duration = getMorphDuration()
      const target = slot.getBoundingClientRect()

      /*
       * 高度跳闪修复:收起动画原先飞向「钉住的旧高度槽位」,而文档更新
       * 在 settle 释放钉高后才生效,动画终点≠最终布局,落位后跳一下。
       * 现在把动画目标高度与槽位钉高都对齐到「新内容下的 view 态高度」
       * ——页面下方的唯一一次位移发生在动画期间(被飞行的卡片掩盖),
       * settle 释放钉高时 Δ=0,落位即终态。取消路径文档未变,测量值与
       * 旧钉高相等,两个赋值皆为 no-op,行为不变。
       */
      const nextHeight = measureNextViewHeight()
      if (nextHeight != null) {
        slot.style.height = `${nextHeight}px`
      }

      if (duration > 0) {
        shell.classList.add(ANIMATING_CLASS)
      }
      applyRect(shell, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: nextHeight ?? target.height,
      })

      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'closing' || !shell.isConnected) return
        settleToView()
      }, duration + MORPH_PAD)
    }, [measureNextViewHeight, settleToView])

    /**
     * 收起编辑器。intent 语义对齐 WdfView 演示:
     * - save(Check/Esc 外的提交路径):草稿经 fromTiptap 转换成功才提交;
     *   用户请求下转换失败保留会话,外部强制收起失败不提交但完成退出。
     * - cancel(X/Esc/遮罩):丢弃草稿直接收起,WdfRender 衬底本就显示
     *   已提交文档,无需任何转换。
     */
    const closeEditor = useCallback(
      (intent: 'save' | 'cancel', source: CloseSource) => {
        if (phaseRef.current !== 'edit') return

        if (intent === 'save') {
          const committed = commitDraft('change')
          if (!committed && source === 'user') {
            setConversionError(true)
            if (errorTimerRef.current !== null) {
              window.clearTimeout(errorTimerRef.current)
            }
            errorTimerRef.current = window.setTimeout(
              () => setConversionError(false),
              CONVERSION_ERROR_RESET,
            )
            return
          }
        }

        closeSourceRef.current = source
        phaseRef.current = 'closing'
        setPhase('closing')

        // 先失焦收键盘;键盘收起会改变 visualViewport,等一拍再测几何。
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        const viewport = window.visualViewport
        const keyboardOpen =
          !!viewport && window.innerHeight - viewport.height > 120

        if (keyboardOpen) {
          timerRef.current = window.setTimeout(
            runCloseAnimation,
            KEYBOARD_CLOSE_WAIT,
          )
          return
        }

        // 延后一拍让 commitDraft 触发的衬底重渲染(新内容)先行提交,
        // runCloseAnimation 的 scrollHeight 测量才能读到新高度;React
        // 调度(MessageChannel)先于定时器执行,setTimeout(0) 足够。
        timerRef.current = window.setTimeout(runCloseAnimation, 0)
      },
      [commitDraft, runCloseAnimation],
    )
    const closeEditorRef = useRef(closeEditor)
    closeEditorRef.current = closeEditor

    // mode 协调:edit 请求展开;view 请求收起(prepare/opening 直接取消,
    // edit 走收起流程,external 语义)。
    useEffect(() => {
      if (activeMode === 'edit') {
        if (phaseRef.current === 'view') {
          openCard()
        }
        return
      }

      const currentPhase = phaseRef.current
      if (currentPhase === 'view' || currentPhase === 'closing') return

      if (currentPhase === 'edit') {
        closeEditorRef.current('save', 'external')
        return
      }

      // prepare/opening:取消展开,无草稿可提交,直接落回 view。
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
        readyTimerRef.current = null
      }
      closeSourceRef.current = 'external'
      settleToView()
    }, [activeMode, openCard, settleToView])

    const requestMode = useCallback((next: MobileWdfViewMode) => {
      onModeChangeRef.current?.(next)
      if (!isModeControlledRef.current) {
        setInternalMode(next)
      }
    }, [])

    // 键盘避让:opening/edit 期间跟随 visualViewport 调整几何。
    useEffect(() => {
      if (phase !== 'opening' && phase !== 'edit') return

      const updateGeometry = () => {
        const shell = shellRef.current
        const currentPhase = phaseRef.current
        if (!shell || (currentPhase !== 'opening' && currentPhase !== 'edit')) {
          return
        }

        if (currentPhase === 'opening') {
          applyRect(shell, getDialogRect())
          return
        }

        shell.classList.add(ANIMATING_CLASS)
        applyRect(shell, getDialogRect())
        window.setTimeout(() => {
          if (phaseRef.current === 'edit') {
            shell.classList.remove(ANIMATING_CLASS)
          }
        }, getMorphDuration() + MORPH_PAD)
      }

      const viewport = window.visualViewport
      viewport?.addEventListener('resize', updateGeometry)
      window.addEventListener('resize', updateGeometry)

      return () => {
        viewport?.removeEventListener('resize', updateGeometry)
        window.removeEventListener('resize', updateGeometry)
      }
    }, [phase])

    // Esc 收起 + Tab 焦点陷阱 + focusin 拉回。
    useEffect(() => {
      if (phase !== 'edit') return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeEditorRef.current('cancel', 'user')
          return
        }

        if (event.key !== 'Tab') return

        const shell = shellRef.current
        if (!shell) return

        const focusables = getFocusableElements(shell)
        if (focusables.length === 0) {
          event.preventDefault()
          shell.focus()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement

        if (event.shiftKey) {
          if (active === first || !shell.contains(active)) {
            event.preventDefault()
            last.focus()
          }
          return
        }

        if (active === last || !shell.contains(active)) {
          event.preventDefault()
          first.focus()
        }
      }

      const handleFocusIn = (event: FocusEvent) => {
        if (phaseRef.current !== 'edit') return

        const shell = shellRef.current
        if (!shell) return

        if (event.target instanceof Node && !shell.contains(event.target)) {
          shell.focus({ preventScroll: true })
        }
      }

      document.addEventListener('keydown', handleKeyDown, true)
      document.addEventListener('focusin', handleFocusIn, true)

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true)
        document.removeEventListener('focusin', handleFocusIn, true)
      }
    }, [phase])

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

    const handleSelectionFormatChange = useCallback(
      (format: RichEditorSelectionFormat | null) => {
        setSelectionFormat(format)
        editorProps?.onSelectionFormatChange?.(format)
      },
      [editorProps],
    )

    // 内置底栏(对齐 WdfView 演示:粗体/标题/无序列表/引用)。
    const toolbarButtons = [
      {
        key: 'bold',
        label: '切换粗体',
        icon: <Bold />,
        active: selectionFormat?.bold === true,
        action: () => editorRef.current?.toggleBold(),
      },
      {
        key: 'heading',
        label: '切换标题',
        icon: <Heading1 />,
        active: selectionFormat?.block === 'heading',
        action: () => editorRef.current?.toggleBlockFormat('heading'),
      },
      {
        key: 'list',
        label: '切换无序列表',
        icon: <List />,
        active: selectionFormat?.block === 'list',
        action: () => editorRef.current?.toggleBlockFormat('list'),
      },
      {
        key: 'quote',
        label: '切换引用',
        icon: <Quote />,
        active: selectionFormat?.block === 'quote',
        action: () => editorRef.current?.toggleBlockFormat('quote'),
      },
    ] as const

    useImperativeHandle(
      ref,
      () => ({
        open: () => requestMode('edit'),
        close: () => closeEditorRef.current('save', 'user'),
        focus: (position) => {
          if (phaseRef.current !== 'view') {
            editorRef.current?.focus(position)
          }
        },
        clear: () => editorRef.current?.clear(),
        getContent: () => {
          const draft = editorRef.current?.getContent()
          if (!draft) return currentDocumentRef.current

          const result = fromTiptap(draft)
          return result.ok ? result.value : currentDocumentRef.current
        },
        getContentHeight: () => {
          if (phaseRef.current !== 'view') {
            return editorRef.current?.getContentHeight() ?? 0
          }
          return slotRef.current?.getBoundingClientRect().height ?? 0
        },
        getSelectionFormat: () => editorRef.current?.getSelectionFormat() ?? null,
        setBold: (active) => editorRef.current?.setBold(active) ?? false,
        toggleBold: () => editorRef.current?.toggleBold() ?? false,
        setBlockFormat: (format) =>
          editorRef.current?.setBlockFormat(format) ?? false,
        toggleBlockFormat: (format) =>
          editorRef.current?.toggleBlockFormat(format) ?? false,
      }),
      [requestMode],
    )

    const editing = phase !== 'view'
    const rootStyle = {
      ...style,
      '--mobile-wdf-view-max-height':
        typeof viewMaxHeight === 'number' ? `${viewMaxHeight}px` : viewMaxHeight,
    } as CSSProperties

    return (
      <div
        className={cn('mobile-wdf-view', className)}
        ref={slotRef}
        style={rootStyle}
        {...props}
      >
        <div
          aria-hidden="true"
          className="mobile-wdf-view__backdrop"
          data-visible={
            phase === 'opening' || phase === 'edit' ? 'true' : undefined
          }
          onClick={() => closeEditorRef.current('cancel', 'user')}
          ref={backdropRef}
        />

        {/* 卡片本体不可点击:进入编辑的唯一入口是右上角铅笔按钮(对齐
            WdfView 演示的交互模型)。 */}
        <div
          aria-labelledby={editing ? titleId : undefined}
          aria-modal={editing ? true : undefined}
          className="mobile-wdf-view__card"
          data-phase={phase}
          ref={shellRef}
          role={editing ? 'dialog' : undefined}
          tabIndex={-1}
        >
          <header className="mobile-wdf-view__header">
            <span className="mobile-wdf-view__title" id={titleId}>
              {title}
            </span>
            {phase === 'view' ? (
              <GhostIconButton
                aria-label="切换到编辑模式"
                onClick={() => requestMode('edit')}
                size="sm"
              >
                <Pencil />
              </GhostIconButton>
            ) : (
              <div
                aria-label="编辑操作"
                className="mobile-wdf-view__actions"
                role="group"
              >
                <GhostIconButton
                  aria-label="取消编辑"
                  disabled={phase !== 'edit'}
                  onClick={() => closeEditorRef.current('cancel', 'user')}
                  size="sm"
                >
                  <X />
                </GhostIconButton>
                <GhostIconButton
                  aria-label="保存编辑"
                  disabled={phase !== 'edit'}
                  onClick={() => closeEditorRef.current('save', 'user')}
                  size="sm"
                >
                  <Check />
                </GhostIconButton>
              </div>
            )}
          </header>

          {conversionError && (
            <p className="mobile-wdf-view__error" role="alert">
              草稿转换失败,已保留编辑内容;请调整格式后重试收起。
            </p>
          )}

          <div className="mobile-wdf-view__body">
            {/* WdfRender 常驻衬底:查看态内容 + 展开准备期的视觉底。 */}
            <div className="mobile-wdf-view__render">
              <WdfRender {...renderProps} content={currentDocument} />
            </div>
            {sessionContent && (
              <div
                className="mobile-wdf-view__editor-layer"
                data-ready={editorReady ? 'true' : undefined}
              >
                <RichEditor
                  {...editorProps}
                  autoFocus={false}
                  defaultValue={sessionContent}
                  onReady={handleEditorReady}
                  onSave={handleEditorSave}
                  onSelectionFormatChange={handleSelectionFormatChange}
                  ref={editorRef}
                />
              </div>
            )}
          </div>

          {/* 内置底栏:常驻 DOM,展开时经高度/透明度过渡显出;非编辑态
              inert 禁焦点。收起态高度为 0,不占卡片空间。 */}
          <footer
            aria-label="编辑工具栏"
            className="mobile-wdf-view__toolbar"
            inert={phase !== 'edit'}
          >
            <div
              aria-label="编辑操作"
              className="mobile-wdf-view__toolbar-group"
              role="group"
            >
              {toolbarButtons.map((button) => (
                <GhostIconButton
                  active={button.active}
                  aria-label={button.label}
                  disabled={phase !== 'edit' || !selectionFormat}
                  key={button.key}
                  onClick={button.action}
                  onPointerDown={(event) => event.preventDefault()}
                  size="sm"
                >
                  {button.icon}
                </GhostIconButton>
              ))}
            </div>
          </footer>
        </div>
      </div>
    )
  },
)

MobileWdfView.displayName = 'MobileWdfView'
