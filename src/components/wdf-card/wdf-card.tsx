import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
  type TransitionEvent as ReactTransitionEvent,
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
import { WdfCardBridgeContext } from './wdf-card-bridge'
// 已验证模块与原语(时序契约见 docs/new-mobile-wdf-view-baseline.md)。
import { useEditorSession } from './editor-session'
import { useCardMorph } from './card-morph'
import { useViewportAndFocus } from './viewport-focus'

import {
  type CardPhase,
  clearShellGeometry,
  hideFromTopLayer,
  inertSiblingsOf,
  KEYBOARD_CLOSE_WAIT,
  MOBILE_VIEWPORT_QUERY,
  showInTopLayer,
  stageVisibilityHandoff,
} from './card-shell'

import 'weimo-ui-editor/styles/wdf-card.css'

export type {
  RichEditorBlockFormat,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
export type { Diagnostic, WdfDocument } from 'weimo-wdf'
// 只读/异步保存协作点:消费方经 Context 注入(如只读详情卡禁用编辑入口)
export { WdfCardBridgeContext, type WdfCardBridge } from './wdf-card-bridge'

export type WdfCardMode = 'view' | 'edit'
export type WdfCardConversionSource = 'change' | 'save'
/** 编辑样式:auto 按视口宽度(≤640px 对话框,否则内联);会话开始时
 * 解析并冻结(resolvedEditStyle),会话中途视口跨越断点不切换。 */
export type WdfCardEditStyle = 'auto' | 'dialog' | 'inline'

const CARD_CLASS_PREFIX = 'wdf-card'
const ANIMATING_CLASS = `${CARD_CLASS_PREFIX}__card--animating`
const EDITOR_READY_TIMEOUT = 800
const INLINE_TOOLBAR_EXIT_FADE_DURATION = 60
const INLINE_TOOLBAR_EXIT_DURATION = 200
const INLINE_TOOLBAR_EXIT_FALLBACK = 320

type CloseSource = 'user' | 'external'
type InlineExitGeometry = {
  stage: 'ready' | 'fading' | 'running'
  fromHeight: number
  toHeight: number
  toolbarHeight: number
  toolbarPaddingTop: string
  toolbarPaddingBottom: string
}

/**
 * 合法相位转换表:对话框路径走全链(view→prepare→opening→edit→
 * closing→view);内联路径仅新增 prepare→edit(编辑器
 * 就绪后直达,无飞行阶段)。内联退出在 closing 保留真实编辑卡片,
 * 卡片与工具栏高度到达终点后再结束会话。
 */
const PHASE_TRANSITIONS: Record<CardPhase, readonly CardPhase[]> = {
  view: ['prepare'],
  prepare: ['opening', 'edit', 'view'],
  opening: ['edit', 'view'],
  edit: ['closing'],
  closing: ['view'],
}

/**
 * 滚动锚定豁免(内联流进入/退出编辑的 ±48px 高度换挡提交时使用)。
 *
 * ## 现象(2026-10 实机报告,已实证)
 * 退出内联编辑回查看态时,Safari 27 实机出现「页面滚动条跳动而卡片
 * 底边视觉不动」;期望行为(滚动条不动、卡底上移)反而不出现。卡体
 * 收缩量恒等于底栏 48px(render 与编辑器内容高度经对齐后 ±0,实测
 * 文档总高精确 −48)。
 *
 * ## 根因:CSS scroll anchoring(滚动锚定)的静默补偿
 * 引擎在布局时于视口内选定一个「锚点」节点;当锚点上方的文档高度
 * 变化使其文档坐标移动时,自动调整 scrollY 保持锚点视觉位置不变。
 * 本组件的收缩发生在页面锚点(卡下方的内容,如下一组演示卡的
 * 分组标签)上方 → 锚点文档坐标上移 48 → 引擎静默 scrollY−48 保锚点
 * → 表现为滚动条跳、卡底(紧邻锚点上方)冻结。**组件自身无任何
 * 滚动调用**——同滚动位给 html 置 overflow-anchor:none 后 scrollY
 * 变化精确归零,即证补偿全部来自锚定。进入编辑(卡长高 48)在锚点
 * 于卡下方时存在镜像跳动(scrollY+48)。引擎差异:Chrome 锚点选择
 * 不同,浅滚动位(锚点在卡上方)不补偿;WebKit 于 STP 238(2026-02)
 * 启用锚定、Safari 27 全面搭载,故该跳动在旧 Safari 上不存在。
 *
 * ## 豁免方式与恢复时机
 * 收缩/长高提交前给页面滚动容器(html)置 overflow-anchor:'none'。
 * 提交经 flushSync 同步布局,属性在布局时已生效 → 该次补偿被跳过。
 * 恢复必须晚于「下一次带布局的渲染帧」:若在首个渲染帧前恢复,锚点
 * 基线可能未在豁免布局中刷新,补偿会在恢复后的布局中迟到发生——
 * 故用双 rAF(首帧布局仍在豁免中完成并刷新基线,第二帧前恢复);
 * rAF 被挂起的环境(后台标签页/自动化)以定时器兜底,恢复幂等。
 *
 * ## 退出侧占位与卡片高度分离(2026-10-24 实机验证)
 * 页面占位的高度变化整段落在单次提交布局内,避免逐帧收高后
 * WebKit 仍按旧基线补偿。当前实现将页面占位与真实卡片高度解耦:
 * 先钉住两端较大的高度,在动画结束后释放占位。可选的
 * 后续容器只通过向上位移动画跟随卡底;结束时同时释放占位与移除
 * 位移。卡片始终留在文档流内,实机对比通过后固定此路径。
 *
 * ## 边界
 * - 仅对滚动容器生效;在卡片子树内置 none 无效(锚点选在卡外下方)。
 * - 对话框流无需豁免:会话期 body 滚动被锁定,页面无锚定可言。
 * - 重入(极快开合)时第二个调用直接提交,由首个调用的恢复统一
 *   覆盖——两次换挡布局都落在豁免窗口内。
 */
function suppressScrollAnchoringAround(
  commit: () => void,
  restoreAfterMs?: number,
): void {
  const rootStyle = document.documentElement.style
  if (rootStyle.overflowAnchor === 'none') {
    commit()
    return
  }
  rootStyle.overflowAnchor = 'none'
  try {
    commit()
  } finally {
    const restore = () => {
      rootStyle.overflowAnchor = ''
    }
    if (restoreAfterMs !== undefined) {
      // 进入动画持续改变页面高度,豁免窗口须覆盖完整展开过程。
      window.setTimeout(restore, restoreAfterMs)
      return
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore)
    })
    window.setTimeout(restore, 150)
  }
}

/** rAF + 定时器竞速(rAF 在后台标签页/自动化下可能挂起,幂等)。 */
function scheduleAfterPaint(callback: () => void): void {
  let called = false
  const run = () => {
    if (called) return
    called = true
    callback()
  }
  window.requestAnimationFrame(run)
  window.setTimeout(run, 80)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * WdfCard:自适应编辑样式的 WDF 读写视图。
 *
 * - 窄屏(≤640px)/editStyle='dialog':popover 对话框 + 卡片 morph +
 *   焦点陷阱 + fix-3 收起清理的完整编排。
 * - 宽屏/editStyle='inline':行内编辑,不锁页、无遮罩/模态语义。
 *   卡片常驻文档流;退出动画钉住页面占位,先淡出工具栏图标再收高。
 *   编辑器在动画完成后才卸载;减少动态效果时即时收起。
 *
 * 两流共享 Editor Session 数据面与相位机;样式在会话开始时解析冻结
 * (resolvedEditStyle),中途视口跨越不切换,收起后下次打开重判。
 * 编辑样式轴经 data-edit-style 落 DOM,CSS 按轴分形。
 */
export type WdfCardProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title' | 'onChange' | 'value' | 'defaultValue'
> & {
  /** 受控模式;省略时组件自管理(X/Esc/遮罩收起)。 */
  mode?: WdfCardMode
  /** 非受控初始模式,默认 view。 */
  defaultMode?: WdfCardMode
  /** 用户交互请求切换模式时触发;转换失败不触发 view。 */
  onModeChange?: (mode: WdfCardMode) => void
  /** WDF 文档;会话期间外部更新不覆盖会话草稿。 */
  value?: WdfDocument
  defaultValue?: WdfDocument
  /** 收起时草稿经 fromTiptap 转换成功后提交,一次会话一次。 */
  onChange?: (document: WdfDocument) => void
  /** Cmd/Ctrl+S 保存,不退出编辑。 */
  onSave?: (document: WdfDocument) => void
  /** 转换失败上报;组件内同时显示保留会话提示。 */
  onConversionError?: (
    diagnostics: Diagnostic[],
    source: WdfCardConversionSource,
  ) => void
  /** 展开完成后自动聚焦,默认 false。 */
  autoFocus?: boolean
  /** 自动聚焦光标位置,默认 end。 */
  autoFocusPosition?: RichEditorFocusPosition
  /** 编辑样式,默认 auto(视口 ≤640px 对话框,否则内联);会话内冻结。 */
  editStyle?: WdfCardEditStyle
  /** 可选的后续内容容器,须紧邻组件根节点且处于同一纵向文档流。
   * 动画退出时同步移动容器,避免释放占位后跳位;仅动画期间生效。
   * 容器应包住所有需要跟随的内容,不要包含本卡片。 */
  inlineExitFollowRef?: RefObject<HTMLElement | null>
  /** 卡片标题(对话框态作为可访问名称)。 */
  title?: ReactNode
  /** 常驻卡内附加行(标签栏等),渲染在正文与编辑工具栏之间;查看态
   *  即可交互,不参与编辑工具栏的高度编排。空插槽不占卡内空间。 */
  bottomBar?: ReactNode
  /** 顶栏操作插槽,渲染在标题与编辑入口(铅笔/取消保存组)之间;
   *  内容与交互由消费方自治,空插槽不占位。 */
  actionSlot?: ReactNode
  /** 隐藏查看态的铅笔编辑入口(消费方经 handle.open() 或自定义菜单进入
   *  编辑);编辑态的取消/保存组不受影响。 */
  hideEditEntry?: boolean
  /** 透传 WdfRender(查看态与衬底)。 */
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

export type WdfCardHandle = {
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

export const WdfCard = forwardRef<WdfCardHandle, WdfCardProps>(
  function WdfCard(
    {
      autoFocus = false,
      autoFocusPosition = 'end',
      actionSlot,
      bottomBar,
      className,
      defaultMode = 'view',
      defaultValue,
      editStyle = 'auto',
      editorProps,
      hideEditEntry = false,
      inlineExitFollowRef,
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
    const bridge = useContext(WdfCardBridgeContext)
    const bridgeRef = useRef(bridge)
    bridgeRef.current = bridge
    const titleId = useId()
    const [phase, setPhase] = useState<CardPhase>('view')
    const [internalMode, setInternalMode] = useState<WdfCardMode>(defaultMode)
    const [selectionFormat, setSelectionFormat] =
      useState<RichEditorSelectionFormat | null>(null)
    // 会话编辑样式:打开时解析冻结,收起时清空(null=无会话)。
    const [resolvedEditStyle, setResolvedEditStyle] = useState<
      'dialog' | 'inline' | null
    >(null)
    // 内联轴工具栏带开合(CSS 经 data-toolbar-open 分形,相位机不感知)。
    const [inlineToolbarOpen, setInlineToolbarOpen] = useState(false)
    const [inlineExit, setInlineExit] = useState<InlineExitGeometry | null>(null)

    // Editor Session:文档/草稿/提交/错误的数据面,两流共用。
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
    } = useEditorSession({
      controlledValue: value,
      defaultValue,
      onChange,
      onConversionError,
      onSave,
    })

    const slotRef = useRef<HTMLDivElement | null>(null)
    const shellRef = useRef<HTMLDivElement | null>(null)
    const toolbarRef = useRef<HTMLElement | null>(null)
    const backdropRef = useRef<HTMLDivElement | null>(null)
    const phaseRef = useRef<CardPhase>('view')
    const timerRef = useRef<number | null>(null)
    const readyTimerRef = useRef<number | null>(null)
    const inlineExitTimerRef = useRef<number | null>(null)
    const inlineExitTokenRef = useRef(0)
    const inlineExitRef = useRef<InlineExitGeometry | null>(null)
    const inlineExitFollowAnimationRef = useRef<Animation | null>(null)
    const inertedRef = useRef<HTMLElement[]>([])
    const closeSourceRef = useRef<CloseSource>('user')
    const sessionRef = useRef(0)
    const resolvedEditStyleRef = useRef<'dialog' | 'inline' | null>(null)

    const isModeControlled = mode !== undefined
    const activeMode = isModeControlled ? mode : internalMode

    // 供定时器/命令式句柄读取最新 props 的 ref 集。
    const onModeChangeRef = useRef(onModeChange)
    const autoFocusRef = useRef(autoFocus)
    const autoFocusPositionRef = useRef(autoFocusPosition)
    const isModeControlledRef = useRef(isModeControlled)
    const currentDocumentRef = useRef(currentDocument)
    const inlineExitFollowTargetRef = useRef(inlineExitFollowRef)

    phaseRef.current = phase
    onModeChangeRef.current = onModeChange
    autoFocusRef.current = autoFocus
    autoFocusPositionRef.current = autoFocusPosition
    isModeControlledRef.current = isModeControlled
    currentDocumentRef.current = currentDocument
    inlineExitRef.current = inlineExit
    inlineExitFollowTargetRef.current = inlineExitFollowRef

    // 集中式相位转换:表校验 + 告警拒绝,ref 与 state 同步推进。
    const transitionPhase = useCallback((next: CardPhase): boolean => {
      const current = phaseRef.current
      if (current === next) return false
      if (!PHASE_TRANSITIONS[current].includes(next)) {
        console.warn(
          `[wdf-card] 忽略非法相位转换 ${current} → ${next}`,
        )
        return false
      }
      phaseRef.current = next
      setPhase(next)
      return true
    }, [])

    const isCurrentSession = useCallback(
      (session: number) => session === sessionRef.current,
      [],
    )

    // Card Morph(对话框流):飞行与测量;内联流不调用。类前缀派生
    // 动画类与衬底/标题栏选择器(DOM 契约见 card-morph 头注)。
    const morph = useCardMorph({
      shellRef,
      slotRef,
      phaseRef,
      isCurrentSession,
      classPrefix: CARD_CLASS_PREFIX,
    })

    // Viewport & Focus:对话框流全量;内联流关闭模态挂件
    // (vv 几何跟随 + 焦点陷阱),仅用聚焦重试等能力。
    const viewportFocus = useViewportAndFocus({
      shellRef,
      phase,
      phaseRef,
      sessionRef,
      editorRef,
      autoFocusPositionRef,
      isCurrentSession,
      requestCancelClose: () => closeEditorRef.current('cancel', 'user'),
      enableDialogChrome: resolvedEditStyle !== 'inline',
      animatingClass: ANIMATING_CLASS,
    })

    /** 会话样式解析:auto 按视口宽度(open 事件时判定,不依赖渲染期
     * window);与 CSS 媒体查询共用 MOBILE_VIEWPORT_QUERY 断点。 */
    const resolveEditStyle = useCallback((): 'dialog' | 'inline' => {
      if (editStyle !== 'auto') return editStyle
      return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
        ? 'dialog'
        : 'inline'
    }, [editStyle])

    const finishSessionMode = useCallback(() => {
      if (closeSourceRef.current === 'user') {
        onModeChangeRef.current?.('view')
        if (!isModeControlledRef.current) {
          setInternalMode('view')
        }
      }
    }, [])

    const resetInlineExitAnimation = useCallback(() => {
      inlineExitTokenRef.current += 1
      if (inlineExitTimerRef.current !== null) {
        window.clearTimeout(inlineExitTimerRef.current)
        inlineExitTimerRef.current = null
      }
      inlineExitRef.current = null
      setInlineExit(null)
    }, [])

    /**
     * 内联收起(独立路径,不复用对话框 settle):不解锁页面、不使用
     * 工具栏替身。保存路径的提交已在 closeEditor
     * 完成;取消路径直接丢弃(endSession 卸载编辑器)。最终布局复位
     * 始终由 flushSync 一次性提交;动画到达真实卡片高度终点后
     * 才进入此处,卸载编辑器与清除几何不会提前截断工具栏过渡。
     */
    const settleInlineToView = useCallback(() => {
      if (phaseRef.current === 'view') return
      resetInlineExitAnimation()

      // resolvedEditStyle 不清除:仅作样式轴(相位规则已不命中)。
      // 在此释放占位,并在同一次提交后撤销后续容器的
      // 视觉位移。二者抵消,下方内容不在结束帧二次跳位。
      suppressScrollAnchoringAround(() => {
        flushSync(() => {
          transitionPhase('view')
          endSession()
          setInlineToolbarOpen(false)
        })
        inlineExitFollowAnimationRef.current?.cancel()
        inlineExitFollowAnimationRef.current = null
        // 在豁免内完成布局,不要把恢复普通文档流的布局推迟到窗口外。
        void slotRef.current?.getBoundingClientRect()
      })
      finishSessionMode()
    }, [
      endSession,
      finishSessionMode,
      resetInlineExitAnimation,
      transitionPhase,
    ])

    /** 在文档流内动画真实卡片。只冻结页面占位,不冻结卡片底边。 */
    const startInlineExitAnimation = useCallback(() => {
      const shell = shellRef.current
      const toolbar = toolbarRef.current
      const slot = slotRef.current
      if (!shell || !toolbar || !slot) {
        transitionPhase('closing')
        settleInlineToView()
        return
      }

      const first = shell.getBoundingClientRect()
      const following = inlineExitFollowTargetRef.current?.current
      // 仅接管调用方明确给出的相邻容器,不遍历或改写任意页面兄弟。
      const followTarget = following === slot.nextElementSibling ? following : null
      const followTop = followTarget?.getBoundingClientRect().top
      const toolbarStyle = getComputedStyle(toolbar)
      const geometry: InlineExitGeometry = {
        stage: 'ready',
        fromHeight: first.height,
        toHeight: first.height,
        toolbarHeight: toolbar.getBoundingClientRect().height,
        toolbarPaddingTop: toolbarStyle.paddingTop,
        toolbarPaddingBottom: toolbarStyle.paddingBottom,
      }
      const token = ++inlineExitTokenRef.current

      suppressScrollAnchoringAround(() => {
        // 同步提交保存后的 WdfRender 与 closing。先钉原占位,同步量取
        // 真实 view 布局,因此保存/取消导致的正文高差也包含在终点内。
        flushSync(() => {
          setInlineExit(geometry)
          transitionPhase('closing')
        })
        const previousHeight = shell.style.height
        const previousToolbarStyle = toolbar.getAttribute('style')
        const toolbarOpen = shell.dataset.toolbarOpen
        let toHeight = geometry.fromHeight
        try {
          delete shell.dataset.inlineExitStage
          shell.dataset.phase = 'view'
          shell.dataset.toolbarOpen = 'false'
          shell.style.height = 'auto'
          toolbar.style.height = '0px'
          toolbar.style.paddingBlock = '0px'
          toHeight = shell.getBoundingClientRect().height
        } finally {
          shell.dataset.phase = 'closing'
          shell.dataset.toolbarOpen = toolbarOpen
          shell.dataset.inlineExitStage = 'ready'
          shell.style.height = previousHeight
          if (previousToolbarStyle === null) toolbar.removeAttribute('style')
          else toolbar.setAttribute('style', previousToolbarStyle)
        }

        const nextGeometry: InlineExitGeometry = {
          ...geometry,
          toHeight,
        }
        flushSync(() => setInlineExit(nextGeometry))
        if (followTarget && followTop !== undefined && typeof followTarget.animate === 'function') {
          const heldHeight = Math.max(geometry.fromHeight, toHeight)
          // 占位取两端较大值,两端位移均不向下溢出页面。先在旧布局
          // 上向上移动后续内容,终点再释放占位,保持 scrollHeight
          // 只有一次缩减。增长场景起点负移、终点归零,同样没有跳帧。
          const fromOffset = followTop - followTarget.getBoundingClientRect().top
          inlineExitFollowAnimationRef.current = followTarget.animate([
            { translate: `0 ${fromOffset}px` },
            { translate: `0 ${toHeight - heldHeight}px` },
          ], {
            duration: INLINE_TOOLBAR_EXIT_DURATION,
            easing: 'ease',
            fill: 'both',
            composite: 'add',
          })
          inlineExitFollowAnimationRef.current.pause()
          inlineExitFollowAnimationRef.current.currentTime = 0
        }
        // 明确建立 before-change 几何,且让 slot 的唯一换高在豁免内布局。
        void shell.getBoundingClientRect()
        void slot.getBoundingClientRect()
      })

      // ready 保留实测高度(包括进入动画尚未结束就退出的半高工具栏)。
      // 跨绘制帧后同时驱动卡片 height 与 footer height/padding,不能在
      // 此时 endSession/切 view,否则工具栏会先归零,再次丢失卡底动画。
      scheduleAfterPaint(() => {
        scheduleAfterPaint(() => {
          if (token !== inlineExitTokenRef.current) return
          flushSync(() => {
            setInlineExit((current) => current && { ...current, stage: 'fading' })
          })
          // 先让图标完整淡出,再缩小裁切盒;不能边裁掉按钮边淡出。
          const toolbarGroup = toolbar.firstElementChild
          if (toolbarGroup) void getComputedStyle(toolbarGroup).opacity
          inlineExitTimerRef.current = window.setTimeout(() => {
            if (token !== inlineExitTokenRef.current) return
            flushSync(() => {
              setInlineExit((current) => current && { ...current, stage: 'running' })
            })
            const followAnimation = inlineExitFollowAnimationRef.current
            if (followAnimation) {
              // CSS 过渡与 WAAPI 的待播放任务可能在不同帧启动。
              // 读取真实 height 过渡并共用起点,避免参照间距偏差一帧。
              const heightTransition = shell.getAnimations().find((animation) =>
                'transitionProperty' in animation && animation.transitionProperty === 'height',
              )
              followAnimation.play()
              if (heightTransition) {
                const syncStartTime = () => {
                  if (
                    token === inlineExitTokenRef.current &&
                    inlineExitFollowAnimationRef.current === followAnimation &&
                    heightTransition.startTime !== null
                  ) {
                    followAnimation.startTime = heightTransition.startTime
                  }
                }
                syncStartTime()
                // resize/unmount 可取消待播放的过渡,此时不再同步。
                void heightTransition.ready.then(syncStartTime, () => {})
              }
            }
            inlineExitTimerRef.current = window.setTimeout(() => {
              if (token !== inlineExitTokenRef.current) return
              inlineExitTimerRef.current = null
              settleInlineToView()
            }, INLINE_TOOLBAR_EXIT_FALLBACK)
          }, INLINE_TOOLBAR_EXIT_FADE_DURATION)
        })
      })
    }, [settleInlineToView, transitionPhase])

    /**
     * 对话框 settle-to-view(fix-v3 收起清理,顺序见基线 §2.2)。
     */
    const settleToView = useCallback(() => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      // 步骤 1:先 flushSync 切 view 布局再退 top layer(防塌陷帧)。
      // resolvedEditStyle 同内联路径保留(对话框收起时工具栏已在
      // 飞行中归零,无行为差异;轴标记统一生命周期)。
      if (phaseRef.current !== 'view') {
        flushSync(() => {
          transitionPhase('view')
          endSession()
        })
      }

      // 步骤 2-5:退 top layer(卡壳与遮罩)→ 清几何 → 释放钉高/
      // 解锁/去 inert → 恢复滚动。
      hideFromTopLayer(shell)
      hideFromTopLayer(backdropRef.current)
      clearShellGeometry(shell, ANIMATING_CLASS)
      slot.style.height = ''
      viewportFocus.unlockBody()
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
      viewportFocus.restoreScrollPosition()

      // 步骤 6-8:Ghost 替身 + 一帧隐藏 + 双 rAF/64ms 幂等恢复。
      const restoreHandoff = stageVisibilityHandoff(shell, slot)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restoreHandoff)
      })
      window.setTimeout(restoreHandoff, 64)

      finishSessionMode()
    }, [endSession, finishSessionMode, transitionPhase, viewportFocus])

    // 卸载兜底:清定时器、废弃迟到回调、退 top layer、去 inert。
    useEffect(() => {
      return () => {
        inlineExitTokenRef.current += 1
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        if (readyTimerRef.current !== null) {
          window.clearTimeout(readyTimerRef.current)
        }
        if (inlineExitTimerRef.current !== null) {
          window.clearTimeout(inlineExitTimerRef.current)
        }
        inlineExitFollowAnimationRef.current?.cancel()
        inlineExitFollowAnimationRef.current = null
        hideFromTopLayer(shellRef.current)
        hideFromTopLayer(backdropRef.current)
        for (const element of inertedRef.current) {
          element.removeAttribute('inert')
        }
        inertedRef.current = []
      }
    }, [])

    // 窗口缩放可能改变正文换行,中断退出动画并落回自然布局。
    const inlineExiting = inlineExit !== null
    useLayoutEffect(() => {
      if (!inlineExiting) return
      window.addEventListener('resize', settleInlineToView)
      return () => window.removeEventListener('resize', settleInlineToView)
    }, [inlineExiting, settleInlineToView])

    /** 显式协作点(基线 §2.1):衬底新内容先提交,收起测量后执行。 */
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

    /** 对话框流展开(基线 §4 就绪→展开):FLIP 交 Card Morph。 */
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

    /** 内联流进入编辑:就绪后直达 edit(无飞行相位),可选自动聚焦。 */
    const enterInlineEdit = useCallback(
      (session: number) => {
        if (!isCurrentSession(session) || phaseRef.current !== 'prepare') {
          return
        }

        if (readyTimerRef.current !== null) {
          window.clearTimeout(readyTimerRef.current)
          readyTimerRef.current = null
        }

        // edit 相位提交使卡长高 48px(工具栏瞬进,render→编辑器 ±0):
        // 同退出路径一样豁免滚动锚定(镜像跳动,机制详见助手注释);
        // flushSync 让换挡布局同步落在豁免窗口内,不赌下一帧时序。
        suppressScrollAnchoringAround(() => {
          flushSync(() => {
            transitionPhase('edit')
          })
        })

        // 工具栏带不在本帧展开——编辑器首栅格恰落在 edit 提交帧
        // (prepare 期 visibility:hidden 不绘制),过渡若同帧起跑会被
        // 首绘延迟压缩前段(半高工具栏教训);双帧确认内容已上屏后
        // 再置位展开(band 配方,实机 A/B 择定转正;相位/会话双守卫
        // 防迟到链,开带本身的 +48 增量同样需锚定豁免,450ms 定长窗
        // 覆盖 200ms 过渡)。
        scheduleAfterPaint(() => {
          scheduleAfterPaint(() => {
            if (!isCurrentSession(session) || phaseRef.current !== 'edit') {
              return
            }
            suppressScrollAnchoringAround(() => {
              setInlineToolbarOpen(true)
            }, 450)
          })
        })

        if (autoFocusRef.current) {
          viewportFocus.focusEditorWithRetries(session)
        }
      },
      [isCurrentSession, transitionPhase, viewportFocus],
    )

    /** 编辑器就绪:等一拍让首帧内容上屏,再按会话样式分流。 */
    const handleEditorReady = useCallback(() => {
      if (phaseRef.current !== 'prepare') return

      const session = sessionRef.current
      const inline = resolvedEditStyleRef.current === 'inline'
      readyTimerRef.current = window.setTimeout(() => {
        if (!isCurrentSession(session)) return
        if (inline) {
          enterInlineEdit(session)
        } else {
          startOpening(session)
        }
      }, 50)
    }, [enterInlineEdit, isCurrentSession, startOpening])

    /**
     * openCard:解析并冻结会话样式,按样式分流。对话框流 = 基线 §4
     * 十二步;内联流为其编排子集——无锁页/钉高/inert/提升/几何,仅
     * 挂载编辑器 + 看门狗,就绪直达 edit。
     */
    const openCard = useCallback(() => {
      if (phaseRef.current !== 'view') return

      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      resetInlineExitAnimation()

      const style = resolveEditStyle()
      resolvedEditStyleRef.current = style
      setResolvedEditStyle(style)
      const session = ++sessionRef.current
      closeSourceRef.current = 'user'
      transitionPhase('prepare')

      if (style === 'inline') {
        // 内联:挂载编辑器(隐藏)+ 看门狗;卡保持文档流。
        beginSession(currentDocumentRef.current)
        readyTimerRef.current = window.setTimeout(() => {
          if (isCurrentSession(session) && phaseRef.current === 'prepare') {
            console.warn('[wdf-card] editor ready 超时,直接进入编辑')
            enterInlineEdit(session)
          }
        }, EDITOR_READY_TIMEOUT)
        return
      }

      // 对话框流(基线 §4 步骤 3-12)。
      viewportFocus.saveScrollPosition()
      viewportFocus.lockBody()

      const first = morph.captureFoldedRect()
      if (!first) return
      if (inertedRef.current.length === 0) {
        inertedRef.current = inertSiblingsOf(shell, backdropRef.current)
      }

      const topLayerSupported = showInTopLayer(backdropRef.current)
      showInTopLayer(shell)
      if (!topLayerSupported) {
        console.warn('[wdf-card] Popover API 不可用,降级为 fixed 覆盖层')
      }

      morph.fixShellAtFolded(first)
      beginSession(currentDocumentRef.current)

      readyTimerRef.current = window.setTimeout(() => {
        if (isCurrentSession(session) && phaseRef.current === 'prepare') {
          console.warn('[wdf-card] editor ready 超时,直接展开')
          startOpening(session)
        }
      }, EDITOR_READY_TIMEOUT)
    }, [
      beginSession,
      enterInlineEdit,
      isCurrentSession,
      morph,
      resolveEditStyle,
      resetInlineExitAnimation,
      startOpening,
      transitionPhase,
      viewportFocus,
    ])

    /**
     * 收起编辑器(基线 §2.3 语义两流一致):
     * - save:转换成功才提交;用户路径失败保留会话并提示。
     * - cancel:丢弃草稿直接收起。
     * 内联流走独立收起(无飞行/清理链);对话框流走飞行 + settle。
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

        if (resolvedEditStyleRef.current === 'inline') {
          // 内联:失焦后在文档流内收拢真实卡片,动画终点才卸载会话。
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
          if (!prefersReducedMotion()) {
            startInlineExitAnimation()
            return
          }
          transitionPhase('closing')
          settleInlineToView()
          return
        }

        // 对话框流:失焦收键盘 → 飞行(键盘开启时延后)→ settle。
        transitionPhase('closing')
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

        scheduleCloseFlightAfterBackingCommit(session, flyHome)
      },
      [
        commitDraft,
        flagConversionError,
        isCurrentSession,
        morph,
        scheduleCloseFlightAfterBackingCommit,
        settleInlineToView,
        startInlineExitAnimation,
        settleToView,
        transitionPhase,
        viewportFocus,
      ],
    )
    const closeEditorRef = useRef(closeEditor)
    closeEditorRef.current = (intent, source) => {
      const adapter = bridgeRef.current
      if (!adapter) return closeEditor(intent, source)
      if (phaseRef.current !== 'edit' || adapter.saving) return
      if (intent === 'cancel') return closeEditor(intent, source)
      const content = editorRef.current?.getContent()
      if (!content) return
      const session = sessionRef.current
      adapter.save(content, () => {
        if (!isCurrentSession(session) || phaseRef.current !== 'edit') return
        // The adapter has already committed the backing document. Reuse the exact
        // original closing path without converting or submitting that draft twice.
        closeEditor('cancel', source)
      })
    }

    const bridgeCancelRef = bridge?.cancelRef
    useLayoutEffect(() => {
      if (!bridgeCancelRef) return
      bridgeCancelRef.current = () => closeEditorRef.current('cancel', 'user')
      return () => { bridgeCancelRef.current = null }
    }, [bridgeCancelRef])

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

      // prepare/opening:取消展开,无草稿可提交,按样式落回。
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
        readyTimerRef.current = null
      }
      closeSourceRef.current = 'external'
      if (resolvedEditStyleRef.current === 'inline') {
        settleInlineToView()
      } else {
        settleToView()
      }
    }, [activeMode, openCard, settleInlineToView, settleToView])

    const requestMode = useCallback((next: WdfCardMode) => {
      if (next === 'edit' && bridgeRef.current?.readOnly) return
      onModeChangeRef.current?.(next)
      if (!isModeControlledRef.current) {
        setInternalMode(next)
      }
    }, [])

    // 内联流 Esc:非模态,不设陷阱,仅提供轻量收起键(对齐对话框流
    // 的 Esc 语义)。
    useEffect(() => {
      if (resolvedEditStyle !== 'inline' || phase !== 'edit') return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeEditorRef.current('cancel', 'user')
        }
      }
      document.addEventListener('keydown', handleKeyDown, true)
      return () => document.removeEventListener('keydown', handleKeyDown, true)
    }, [phase, resolvedEditStyle])

    const handleSelectionFormatChange = useCallback(
      (format: RichEditorSelectionFormat | null) => {
        setSelectionFormat(format)
        editorProps?.onSelectionFormatChange?.(format)
      },
      [editorProps],
    )

    const handleInlineExitTransitionEnd = useCallback(
      (event: ReactTransitionEvent<HTMLDivElement>) => {
        if (event.currentTarget !== event.target || event.propertyName !== 'height') {
          return
        }
        if (
          phaseRef.current === 'closing' &&
          inlineExitRef.current?.stage === 'running'
        ) {
          settleInlineToView()
        }
      },
      [settleInlineToView],
    )

    // 内置底栏(粗体/标题/无序列表/引用,两流一致)。
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
    const dialogEditing = editing && resolvedEditStyle === 'dialog'

    return (
      <div
        className={cn('wdf-card', className)}
        ref={slotRef}
        style={inlineExit ? {
          ...style,
          height: Math.max(inlineExit.fromHeight, inlineExit.toHeight),
        } : style}
        {...props}
      >
        <div
          aria-hidden="true"
          className="wdf-card__backdrop"
          data-visible={
            resolvedEditStyle === 'dialog' &&
            (phase === 'opening' || phase === 'edit')
              ? 'true'
              : undefined
          }
          onClick={() => closeEditorRef.current('cancel', 'user')}
          ref={backdropRef}
        />

        {/* 卡片本体不可点击:进入编辑的唯一入口是右上角铅笔按钮。 */}
        <div
          aria-labelledby={dialogEditing ? titleId : undefined}
          aria-modal={dialogEditing ? true : undefined}
          className="wdf-card__card"
          data-edit-style={resolvedEditStyle ?? undefined}
          data-inline-exit-stage={inlineExit?.stage}
          data-phase={phase}
          data-toolbar-open={inlineToolbarOpen ? 'true' : 'false'}
          inert={inlineExit ? true : undefined}
          onTransitionEnd={handleInlineExitTransitionEnd}
          ref={shellRef}
          role={dialogEditing ? 'dialog' : undefined}
          style={inlineExit ? {
            height: inlineExit.stage === 'running'
              ? inlineExit.toHeight
              : inlineExit.fromHeight,
          } : undefined}
          tabIndex={-1}
        >
          <header className="wdf-card__header">
            <span className="wdf-card__title" id={titleId}>
              {title}
            </span>
            {actionSlot !== undefined && actionSlot !== null ? (
              <div className="wdf-card__action-slot">{actionSlot}</div>
            ) : null}
            {phase === 'view' ? (
              hideEditEntry ? null : (
                <GhostIconButton
                  aria-label="切换到编辑模式"
                  disabled={bridge?.readOnly}
                  onClick={() => requestMode('edit')}
                  size="sm"
                >
                  <Pencil />
                </GhostIconButton>
              )
            ) : (
              <div
                aria-label="编辑操作"
                className="wdf-card__actions"
                role="group"
              >
                <GhostIconButton
                  aria-label="取消编辑"
                  disabled={phase !== 'edit' || bridge?.saving}
                  onClick={() => closeEditorRef.current('cancel', 'user')}
                  size="sm"
                >
                  <X />
                </GhostIconButton>
                <GhostIconButton
                  aria-label="保存编辑"
                  disabled={phase !== 'edit' || bridge?.saving}
                  onClick={() => closeEditorRef.current('save', 'user')}
                  size="sm"
                >
                  <Check />
                </GhostIconButton>
              </div>
            )}
          </header>

          {conversionError && (
            <p className="wdf-card__error" role="alert">
              草稿转换失败,已保留编辑内容;请调整格式后重试收起。
            </p>
          )}
          {bridge?.saving && <p className="wdf-card__error" role="status">保存中…</p>}
          {bridge?.error && <p className="wdf-card__error" role="alert">{bridge.error}</p>}

          <div className="wdf-card__body">
            {/* WdfRender 衬底:对话框流常驻(查看态内容+准备期视觉底);
                内联流编辑期隐藏,退出时复显最新文档。 */}
            <div className="wdf-card__render">
              <WdfRender {...renderProps} content={currentDocument} />
            </div>
            {sessionContent && (
              <div className="wdf-card__editor-layer">
                <RichEditor
                  {...editorProps}
                  autoFocus={false}
                  disabled={editorProps?.disabled || bridge?.saving}
                  defaultValue={sessionContent}
                  onReady={handleEditorReady}
                  onSave={bridge ? () => closeEditorRef.current('save', 'user') : handleEditorSave}
                  onSelectionFormatChange={handleSelectionFormatChange}
                  ref={editorRef}
                />
              </div>
            )}
          </div>

          {/* 底部插槽:常驻可交互的卡内附加行(标签栏等)。不参与工具栏
              的编辑态高度编排;内容高度需在会话两态间保持稳定,避免
              进入/退出动画窗口内的额外换挡。 */}
          {bottomBar !== undefined && bottomBar !== null ? (
            <div className="wdf-card__bottom-bar">{bottomBar}</div>
          ) : null}

          {/* 内置底栏:常驻 DOM,编辑态经高度/透明度过渡显出;非编辑态
              inert 禁焦点。收起态高度为 0,不占卡片空间。 */}
          <footer
            aria-label="编辑工具栏"
            className="wdf-card__toolbar"
            inert={phase !== 'edit'}
            ref={toolbarRef}
            style={inlineExit && inlineExit.stage !== 'running' ? {
              height: inlineExit.toolbarHeight,
              paddingTop: inlineExit.toolbarPaddingTop,
              paddingBottom: inlineExit.toolbarPaddingBottom,
            } : undefined}
          >
            <div
              aria-label="编辑操作"
              className="wdf-card__toolbar-group"
              role="group"
            >
              {toolbarButtons.map((button) => (
                <GhostIconButton
                  active={button.active}
                  aria-label={button.label}
                  disabled={phase !== 'edit' || !selectionFormat || bridge?.saving}
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

WdfCard.displayName = 'WdfCard'
