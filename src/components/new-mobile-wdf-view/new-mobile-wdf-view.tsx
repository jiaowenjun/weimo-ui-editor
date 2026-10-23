import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
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
  type RichEditorProps,
  type RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
import { WdfRender, type WdfRenderProps } from '../wdf-render/wdf-render'
// 复用已验证的 shell 原语层(基线 §6:不改其语义,旧组件同源)。
import { useEditorSession } from './editor-session'
import { ANIMATING_CLASS, useCardMorph } from './card-morph'
import { useViewportAndFocus } from './viewport-focus'
import {
  clearShellGeometry,
  hideFromTopLayer,
  inertSiblingsOf,
  KEYBOARD_CLOSE_WAIT,
  showInTopLayer,
  stageVisibilityHandoff,
} from '../mobile-wdf-view/card-shell'

import 'weimo-ui-editor/styles/new-mobile-wdf-view.css'

export type {
  RichEditorBlockFormat,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
export type { Diagnostic, WdfDocument } from 'weimo-wdf'

export type NewMobileWdfViewMode = 'view' | 'edit'
export type NewMobileWdfViewConversionSource = 'change' | 'save'

/**
 * NewMobileWdfView:MobileWdfView 的并行重构实验件(基线契约见
 * docs/new-mobile-wdf-view-baseline.md)。
 *
 * 首阶段为行为忠实移植:DOM 结构/class 语义/动画参数/fix-v3 时序与旧
 * 组件一致,差异仅在——
 * - 专属 class 前缀 new-mobile-wdf-view 与 CSS 变量;
 * - 打开/关闭编排以具名操作组织(顺序注释对齐基线 §2/§4 编号);
 * - 「草稿已提交且衬底可测量」显式协作点
 *   scheduleCloseFlightAfterBackingCommit(基线 §2.1);
 * - data-ready 保留:prepare 仅表示已发起挂载,RichEditor onReady 是
 *   独立异步事实(基线 §3 判定)。
 *
 * 旧 MobileWdfView 保持不变,作为行为对照与回归基线。
 */
export type NewMobileWdfViewProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title' | 'onChange' | 'value' | 'defaultValue'
> & {
  /** 受控模式;省略时组件自管理(X/Esc 收起)。 */
  mode?: NewMobileWdfViewMode
  /** 非受控初始模式,默认 view。 */
  defaultMode?: NewMobileWdfViewMode
  /** 用户交互请求切换模式时触发(X/Esc);转换失败不触发 view。 */
  onModeChange?: (mode: NewMobileWdfViewMode) => void
  /** WDF 文档;会话期间外部更新不覆盖会话草稿(对齐 WdfView)。 */
  value?: WdfDocument
  defaultValue?: WdfDocument
  /** 收起时草稿经 fromTiptap 转换成功后提交,一次会话一次。 */
  onChange?: (document: WdfDocument) => void
  /** Cmd/Ctrl+S 保存,不退出编辑。 */
  onSave?: (document: WdfDocument) => void
  /** 转换失败上报;组件内同时显示保留会话提示。 */
  onConversionError?: (
    diagnostics: Diagnostic[],
    source: NewMobileWdfViewConversionSource,
  ) => void
  /** 展开完成后自动聚焦(卡片自有时机),默认 false。 */
  autoFocus?: boolean
  /** 自动聚焦光标位置,默认 end。 */
  autoFocusPosition?: RichEditorFocusPosition
  /** 卡片标题(展开态作为 dialog 的可访问名称)。 */
  title?: ReactNode
  /** 透传 WdfRender(查看态与常驻衬底)。 */
  renderProps?: Omit<WdfRenderProps, 'content'>
  /** 透传 RichEditor(内容通道与聚焦时序由组件接管)。 */
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

export type NewMobileWdfViewHandle = {
  /** 请求进入编辑(受控模式下经 onModeChange,由父级决定)。 */
  open: () => void
  /** 请求收起;经转换,失败则保留会话并上报 onConversionError。 */
  close: () => void
  focus: (position?: RichEditorFocusPosition) => void
  clear: () => void
  /** 会话草稿的 WDF 形态;非会话期返回当前文档。 */
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

const EDITOR_READY_TIMEOUT = 800

export type CardPhase = 'view' | 'prepare' | 'opening' | 'edit' | 'closing'
type CloseSource = 'user' | 'external'

/**
 * 合法相位转换表(生命周期契约,基线附录 A):view→prepare(打开)、
 * prepare→opening(就绪/看门狗)、opening→edit(展开完成)、
 * edit→closing(收起)、closing→view(settle)、prepare/opening→view
 * (外部取消经 settle)。由集中式 transitionPhase 执行。
 */
const PHASE_TRANSITIONS: Record<CardPhase, readonly CardPhase[]> = {
  view: ['prepare'],
  prepare: ['opening', 'view'],
  opening: ['edit', 'view'],
  edit: ['closing'],
  closing: ['view'],
}

export const NewMobileWdfView = forwardRef<
  NewMobileWdfViewHandle,
  NewMobileWdfViewProps
>(function NewMobileWdfView(
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
    ...props
  },
  ref,
) {
  const titleId = useId()
  const [phase, setPhase] = useState<CardPhase>('view')
  const [internalMode, setInternalMode] =
    useState<NewMobileWdfViewMode>(defaultMode)
  const [editorReady, setEditorReady] = useState(false)
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)

  // Editor Session(阶段二):文档/草稿/提交/错误的数据面;几何与相位
  // 留在组件协调器,经 beginSession/endSession/commitDraft 驱动。
  const editorSession = useEditorSession({
    controlledValue: value,
    defaultValue,
    onChange,
    onConversionError,
    onSave,
  })
  const {
    currentDocument,
    editorRef,
    sessionContent,
    conversionError,
    beginSession,
    endSession,
    commitDraft,
    handleEditorSave,
    flagConversionError,
  } = editorSession

  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const phaseRef = useRef<CardPhase>('view')
  const timerRef = useRef<number | null>(null)
  const readyTimerRef = useRef<number | null>(null)
  const inertedRef = useRef<HTMLElement[]>([])
  const closeSourceRef = useRef<CloseSource>('user')
  const sessionRef = useRef(0)

  const isModeControlled = mode !== undefined
  const activeMode = isModeControlled ? mode : internalMode

  // 供定时器/命令式句柄读取最新 props 的 ref 集。
  const onModeChangeRef = useRef(onModeChange)
  const autoFocusRef = useRef(autoFocus)
  const autoFocusPositionRef = useRef(autoFocusPosition)
  const isModeControlledRef = useRef(isModeControlled)
  const currentDocumentRef = useRef(currentDocument)

  phaseRef.current = phase
  onModeChangeRef.current = onModeChange
  autoFocusRef.current = autoFocus
  autoFocusPositionRef.current = autoFocusPosition
  isModeControlledRef.current = isModeControlled
  currentDocumentRef.current = currentDocument

  /*
   * 集中式相位转换(阶段一):合法转换表校验 + 告警拒绝,ref 与 state
   * 同步推进。命令函数而非纯 reducer——依赖 ref 先行、React 批量提交
   * 与 settle 处 flushSync 的既有次序(冻结基线 §2/§4),不为形式统一
   * 而推迟到 effect。settle 的 view 转换在 flushSync 内调用本函数。
   */
  const transitionPhase = useCallback((next: CardPhase): boolean => {
    const current = phaseRef.current
    if (current === next) return false
    if (!PHASE_TRANSITIONS[current].includes(next)) {
      console.warn(
        `[new-mobile-wdf-view] 忽略非法相位转换 ${current} → ${next}`,
      )
      return false
    }
    phaseRef.current = next
    setPhase(next)
    return true
  }, [])

  /**
   * 会话隔离(阶段一):openCard 递增会话号,异步回调捕获创建时的
   * 号码、执行前校验;与 phase 守卫配合(前者判会话归属,后者判阶段
   * 许可),不互相替代。例外:Ghost 可见性恢复不加会话守卫——幂等且
   * 恒向正确终态(visibility 复位),跳过反而可能把壳搁置在 hidden。
   */
  const isCurrentSession = useCallback(
    (session: number) => session === sessionRef.current,
    [],
  )

  // Card Morph(阶段三):几何动画面;相位转换与资源清理留在协调器,
  // 经 onArrive 回调交还。
  const morph = useCardMorph({
    shellRef,
    slotRef,
    phaseRef,
    isCurrentSession,
  })

  // Viewport & Focus(阶段四):滚动锁/滚动位置/键盘判定/几何跟随/
  // 焦点陷阱;Esc 经回调交还协调器。
  const viewportFocus = useViewportAndFocus({
    shellRef,
    phase,
    phaseRef,
    sessionRef,
    editorRef,
    autoFocusPositionRef,
    isCurrentSession,
    requestCancelClose: () => closeEditorRef.current('cancel', 'user'),
  })

  /**
   * settle-to-view(fix-v3 收起清理)。步骤编号对应基线 §2.2,顺序不可变:
   * 1 先 flushSync 切 view 布局 → 2 退 top layer → 3 清几何 → 4 释放
   * 钉高/解锁/去 inert → 5 恢复 scrollY → 6 Ghost → 7 一帧不可见 →
   * 8 双 rAF 恢复 + 64ms 兜底(幂等)。
   */
  const settleToView = useCallback(() => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      // 步骤 1:先同步切回 view 布局再退 top layer——内容撑高模型下,
      // closing 态 render 仍是 absolute(不贡献高度),若清几何/释放钉高
      // 先于 view 重渲染被绘制,卡片塌到 header 高度再弹回(落位闪烁)。
      // flushSync 保证本 tick 完成:render 转 static、编辑层卸载、slot
      // 回内容高度——塌陷窗口不存在,Ghost 克隆的即 view 态 DOM。
      if (phaseRef.current !== 'view') {
        flushSync(() => {
          transitionPhase('view')
          setEditorReady(false)
          endSession()
        })
      }

      // 步骤 2-5:退 top layer → 清几何 → 释放钉高/解锁/去 inert →
      // 恢复滚动(hidePopover 之后需经历一次不可见绘制,见步骤 7)。
      hideFromTopLayer(shell)
      clearShellGeometry(shell, ANIMATING_CLASS)
      slot.style.height = ''
      viewportFocus.unlockBody()
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
      viewportFocus.restoreScrollPosition()

      // 步骤 6-8:Ghost 替身 + 一帧隐藏,唤回状态栏重采样,像素连续
      // 消除落位闪烁。恢复回调不加会话守卫(见 isCurrentSession 注释):
      // 幂等且恒向 visibility 复位的正确终态;rAF 挂起由 setTimeout 兜底。
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
    },
    [endSession, transitionPhase, viewportFocus],
  )

  // 卸载兜底:清定时器、退 top layer、解锁、去 inert。
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
      }
      hideFromTopLayer(shellRef.current)
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
    }
  }, [])

  /**
   * 显式协作点(基线 §2.1 步骤 3-4):commitDraft 触发的衬底重渲染
   * (新内容)必须先完成 React/DOM 提交,收起飞行的克隆探针测量才能
   * 读到新高度。React 调度(MessageChannel)先于定时器执行,
   * setTimeout(0) 即满足「已提交且可测量」。这是防落位跳闪的时序契约
   * (7429551/14ba6c0),不是可随意替换的实现细节。会话隔离:起飞前
   * 校验会话号。
   */
  const scheduleCloseFlightAfterBackingCommit = useCallback(
    (session: number, fly: () => void) => {
      timerRef.current = window.setTimeout(() => {
        if (isCurrentSession(session)) {
          fly()
        }
      }, 0)
    },
    [isCurrentSession],
  )

  /**
   * 展开(基线 §4 就绪→展开步骤 2-5):就绪信号置位与相位转换在协调
   * 器,几何飞行交 Card Morph;到达后做 edit 转换与自动聚焦(卡片自有
   * 时机,handle 时序偶发偏晚,带「已聚焦即停」守卫的重试兜底)。
   */
  const startOpening = useCallback(
    (session: number) => {
      const shell = shellRef.current
      if (!shell || !isCurrentSession(session) || phaseRef.current !== 'prepare') {
        return
      }

      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
        readyTimerRef.current = null
      }

      setEditorReady(true)
      transitionPhase('opening')

      morph.flyToDialog(session, () => {
        transitionPhase('edit')

        if (autoFocusRef.current) {
          viewportFocus.focusEditorWithRetries(session)
        }
      })
    },
    [isCurrentSession, morph, transitionPhase, viewportFocus],
  )

  /** 编辑器就绪:等一拍让首帧内容真正上屏,再起飞(避免拍到骨架屏)。 */
  const handleEditorReady = useCallback(() => {
    if (phaseRef.current !== 'prepare') return

    const session = sessionRef.current
    readyTimerRef.current = window.setTimeout(() => {
      if (isCurrentSession(session)) {
        startOpening(session)
      }
    }, 50)
  }, [isCurrentSession, startOpening])

  /**
   * openCard(基线 §4 步骤 1-12,顺序对齐旧组件 openCard)。步骤 1 起
   * 增会话号(旧会话异步回调自此全部失效);view→prepare 经统一转换
   * 入口,ref 先行 + React 批量提交,与旧版「ref 早置/state 后置」
   * 提交时机等价。
   */
  const openCard = useCallback(() => {
    if (phaseRef.current !== 'view') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    // 步骤 1-4:守卫已过;新会话;关源=用户;转换 prepare;存
    // scrollY;锁滚动(overflow hidden + 滚动条补偿)。
    const session = ++sessionRef.current
    closeSourceRef.current = 'user'
    transitionPhase('prepare')
    viewportFocus.saveScrollPosition()
    viewportFocus.lockBody()

    // 步骤 5-7:捕获折叠矩形 + slot 钉高(morph)→ 惰性化祖先链兄弟
    // (会话期外部交互隔离)。
    const first = morph.captureFoldedRect()
    if (!first) return
    if (inertedRef.current.length === 0) {
      inertedRef.current = inertSiblingsOf(shell)
    }

    // 步骤 8:提升 top layer(popover 属性常驻;失败降级 fixed 覆盖)。
    const topLayerSupported = showInTopLayer(shell)
    if (!topLayerSupported) {
      console.warn('[new-mobile-wdf-view] Popover API 不可用,降级为 fixed 覆盖层')
    }

    // 步骤 9-10:清动画类;内联 fixed 几何,钉在原视口矩形(morph)。
    morph.fixShellAtFolded(first)

    // 步骤 11:挂载编辑器(隐藏)、衬底转会话布局;DOM 属性随提交。
    setEditorReady(false)
    beginSession(currentDocumentRef.current)

    // 步骤 12:看门狗——编辑器就绪超时则直接展开(按会话隔离)。
    readyTimerRef.current = window.setTimeout(() => {
      if (isCurrentSession(session) && phaseRef.current === 'prepare') {
        console.warn('[new-mobile-wdf-view] editor ready 超时,直接展开')
        startOpening(session)
      }
    }, EDITOR_READY_TIMEOUT)
  }, [beginSession, isCurrentSession, morph, startOpening, transitionPhase, viewportFocus])

  /**
   * 收起编辑器(基线 §2.3):
   * - save:草稿经 fromTiptap 转换成功才提交;用户路径失败保留会话并
   *   提示,外部强制失败不提交但完成退出。
   * - cancel:丢弃草稿直接收起,衬底本就显示已提交文档,无需转换。
   */
  const closeEditor = useCallback(
    (intent: 'save' | 'cancel', source: CloseSource) => {
      if (phaseRef.current !== 'edit') return

      if (intent === 'save') {
        const committed = commitDraft('change')
        if (!committed && source === 'user') {
          flagConversionError()
          return
        }
      }

      closeSourceRef.current = source
      transitionPhase('closing')

      // 先失焦收键盘;键盘收起改变 visualViewport,等一拍再测几何。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }

      const session = sessionRef.current
      const flyHome = () => morph.flyToFolded(session, settleToView)
      if (viewportFocus.isKeyboardOpen()) {
        timerRef.current = window.setTimeout(() => {
          if (isCurrentSession(session)) {
            flyHome()
          }
        }, KEYBOARD_CLOSE_WAIT)
        return
      }

      // 经显式协作点起飞:衬底新内容先提交,测量后执行(§2.1)。
      scheduleCloseFlightAfterBackingCommit(session, flyHome)
    },
    [
      commitDraft,
      flagConversionError,
      isCurrentSession,
      morph,
      scheduleCloseFlightAfterBackingCommit,
      settleToView,
      transitionPhase,
    ],
  )
  const closeEditorRef = useRef(closeEditor)
  closeEditorRef.current = closeEditor

  // mode 协调:edit 请求展开;view 请求收起(prepare/opening 直接
  // 取消落回,edit 走收起流程,external 语义)。
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

  const requestMode = useCallback((next: NewMobileWdfViewMode) => {
    onModeChangeRef.current?.(next)
    if (!isModeControlledRef.current) {
      setInternalMode(next)
    }
  }, [])

  const handleSelectionFormatChange = useCallback(
    (format: RichEditorSelectionFormat | null) => {
      setSelectionFormat(format)
      editorProps?.onSelectionFormatChange?.(format)
    },
    [editorProps],
  )

  // 内置底栏(粗体/标题/无序列表/引用,与旧组件一致)。
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

  return (
    <div
      className={cn('new-mobile-wdf-view', className)}
      ref={slotRef}
      style={style}
      {...props}
    >
      {/* 卡片本体不可点击:进入编辑的唯一入口是右上角铅笔按钮。 */}
      <div
        aria-labelledby={editing ? titleId : undefined}
        aria-modal={editing ? true : undefined}
        className="new-mobile-wdf-view__card"
        data-phase={phase}
        ref={shellRef}
        role={editing ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <header className="new-mobile-wdf-view__header">
          <span className="new-mobile-wdf-view__title" id={titleId}>
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
              className="new-mobile-wdf-view__actions"
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
          <p className="new-mobile-wdf-view__error" role="alert">
            草稿转换失败,已保留编辑内容;请调整格式后重试收起。
          </p>
        )}

        <div className="new-mobile-wdf-view__body">
          {/* WdfRender 常驻衬底:查看态内容 + 展开准备期的视觉底。 */}
          <div className="new-mobile-wdf-view__render">
            <WdfRender {...renderProps} content={currentDocument} />
          </div>
          {sessionContent && (
            <div
              className="new-mobile-wdf-view__editor-layer"
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
          className="new-mobile-wdf-view__toolbar"
          inert={phase !== 'edit'}
        >
          <div
            aria-label="编辑操作"
            className="new-mobile-wdf-view__toolbar-group"
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
})

NewMobileWdfView.displayName = 'NewMobileWdfView'
