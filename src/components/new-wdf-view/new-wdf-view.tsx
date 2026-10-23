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
// 复用 MobileWdfView 的已验证模块与原语(时序契约见
// docs/new-mobile-wdf-view-baseline.md)。
import { useEditorSession } from '../mobile-wdf-view/editor-session'
import { useCardMorph } from '../mobile-wdf-view/card-morph'
import { useViewportAndFocus } from '../mobile-wdf-view/viewport-focus'
import type { CardPhase } from '../mobile-wdf-view/mobile-wdf-view'
import {
  clearShellGeometry,
  hideFromTopLayer,
  inertSiblingsOf,
  KEYBOARD_CLOSE_WAIT,
  MOBILE_VIEWPORT_QUERY,
  showInTopLayer,
  stageVisibilityHandoff,
} from '../mobile-wdf-view/card-shell'

import 'weimo-ui-editor/styles/new-wdf-view.css'

export type {
  RichEditorBlockFormat,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
export type { Diagnostic, WdfDocument } from 'weimo-wdf'

export type NewWdfViewMode = 'view' | 'edit'
export type NewWdfViewConversionSource = 'change' | 'save'
/** 编辑样式:auto 按视口宽度(≤640px 对话框,否则内联);会话开始时
 * 解析并冻结(resolvedEditStyle),会话中途视口跨越断点不切换。 */
export type NewWdfViewEditStyle = 'auto' | 'dialog' | 'inline'

const ANIMATING_CLASS = 'new-wdf-view__card--animating'
const EDITOR_READY_TIMEOUT = 800

type CloseSource = 'user' | 'external'

/**
 * 合法相位转换表:对话框路径 = MobileWdfView 原表(view→prepare→
 * opening→edit→closing→view);内联路径仅新增 prepare→edit(编辑器
 * 就绪后直达,无飞行阶段),closing 为内联的同 tick 拆卸过站(无可见
 * 动画)。仅按需加边,不伪造动画相位。
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
      // 定长窗口:高度过渡在提交后仍持续数百毫秒,恢复必须晚于
      // 过渡全程(双 rAF 路径会在过渡中途恢复,尾段补偿滑移)。
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

/**
 * NewWdfView:自适应编辑样式的 WDF 读写视图(基于 MobileWdfView 架构)。
 *
 * - 窄屏(≤640px)/editStyle='dialog':与 MobileWdfView 行为一致——
 *   popover 对话框 + 卡片 morph + 焦点陷阱 + fix-3,完整复用既有编排。
 * - 宽屏/editStyle='inline':WdfView 式行内编辑——卡不脱离文档流,
 *   不提升 top layer、不 FLIP、不锁页、无遮罩/模态语义;编辑器就绪后
 *   接管内容区,保存/取消后 flushSync 回渲染态。
 *
 * 两流共享 Editor Session 数据面与相位机;样式在会话开始时解析冻结
 * (resolvedEditStyle),中途视口跨越不切换,收起后下次打开重判。
 * 编辑样式轴经 data-edit-style 落 DOM,CSS 按轴分形。
 */
export type NewWdfViewProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title' | 'onChange' | 'value' | 'defaultValue'
> & {
  /** 受控模式;省略时组件自管理(X/Esc/遮罩收起)。 */
  mode?: NewWdfViewMode
  /** 非受控初始模式,默认 view。 */
  defaultMode?: NewWdfViewMode
  /** 用户交互请求切换模式时触发;转换失败不触发 view。 */
  onModeChange?: (mode: NewWdfViewMode) => void
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
    source: NewWdfViewConversionSource,
  ) => void
  /** 展开完成后自动聚焦,默认 false。 */
  autoFocus?: boolean
  /** 自动聚焦光标位置,默认 end。 */
  autoFocusPosition?: RichEditorFocusPosition
  /** 编辑样式,默认 auto(视口 ≤640px 对话框,否则内联);会话内冻结。 */
  editStyle?: NewWdfViewEditStyle
  /** 卡片标题(对话框态作为可访问名称)。 */
  title?: ReactNode
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

export type NewWdfViewHandle = {
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

export const NewWdfView = forwardRef<NewWdfViewHandle, NewWdfViewProps>(
  function NewWdfView(
    {
      autoFocus = false,
      autoFocusPosition = 'end',
      className,
      defaultMode = 'view',
      defaultValue,
      editStyle = 'auto',
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
    const [internalMode, setInternalMode] = useState<NewWdfViewMode>(defaultMode)
    const [selectionFormat, setSelectionFormat] =
      useState<RichEditorSelectionFormat | null>(null)
    // 会话编辑样式:打开时解析冻结,收起时清空(null=无会话)。
    const [resolvedEditStyle, setResolvedEditStyle] = useState<
      'dialog' | 'inline' | null
    >(null)
    // 内联轴工具栏带开合(CSS 经 data-toolbar-open 分形,相位机不感知)。
    const [inlineToolbarOpen, setInlineToolbarOpen] = useState(false)

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
    const backdropRef = useRef<HTMLDivElement | null>(null)
    const phaseRef = useRef<CardPhase>('view')
    const timerRef = useRef<number | null>(null)
    const readyTimerRef = useRef<number | null>(null)
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

    phaseRef.current = phase
    onModeChangeRef.current = onModeChange
    autoFocusRef.current = autoFocus
    autoFocusPositionRef.current = autoFocusPosition
    isModeControlledRef.current = isModeControlled
    currentDocumentRef.current = currentDocument

    // 集中式相位转换:表校验 + 告警拒绝,ref 与 state 同步推进。
    const transitionPhase = useCallback((next: CardPhase): boolean => {
      const current = phaseRef.current
      if (current === next) return false
      if (!PHASE_TRANSITIONS[current].includes(next)) {
        console.warn(
          `[new-wdf-view] 忽略非法相位转换 ${current} → ${next}`,
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

    // Card Morph(对话框流):飞行与测量;内联流不调用。
    const morph = useCardMorph({
      shellRef,
      slotRef,
      phaseRef,
      isCurrentSession,
      animatingClass: ANIMATING_CLASS,
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

    /**
     * 内联收起(独立路径,不复用对话框 settle):无飞行/无 top layer/
     * 无 Ghost/无解锁——仅布局复位。保存路径的提交已在 closeEditor
     * 完成;取消路径直接丢弃(endSession 卸载编辑器)。closing 为
     * 同 tick 过站相位,flushSync 保证无中间绘制。
     */
    const settleInlineToView = useCallback(() => {
      // resolvedEditStyle 不清除:仅作样式轴(相位规则已不命中)。
      // 布局复位使卡收缩 48px(工具栏),滚动锚定豁免防止引擎静默
      // scrollY 补偿导致「滚动条跳、卡底冻结」(机制详见助手注释)。
      // 工具栏收拢走 200ms 过渡(与清位同帧起跑,退出侧无首绘问题,
      // 实机 A/B 双向验证),豁免用 450ms 定长窗覆盖过渡全程。
      if (phaseRef.current !== 'view') {
        suppressScrollAnchoringAround(
          () => {
            flushSync(() => {
              transitionPhase('view')
              endSession()
              setInlineToolbarOpen(false)
            })
          },
          450,
        )
      }
      finishSessionMode()
    }, [endSession, finishSessionMode, transitionPhase])

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

    // 卸载兜底:清定时器、退 top layer、去 inert(对话框资源;内联
    // 会话这些从未获得,清理为安全 no-op)。
    useEffect(() => {
      return () => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        if (readyTimerRef.current !== null) {
          window.clearTimeout(readyTimerRef.current)
        }
        hideFromTopLayer(shellRef.current)
        hideFromTopLayer(backdropRef.current)
        for (const element of inertedRef.current) {
          element.removeAttribute('inert')
        }
        inertedRef.current = []
      }
    }, [])

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
            console.warn('[new-wdf-view] editor ready 超时,直接进入编辑')
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
        console.warn('[new-wdf-view] Popover API 不可用,降级为 fixed 覆盖层')
      }

      morph.fixShellAtFolded(first)
      beginSession(currentDocumentRef.current)

      readyTimerRef.current = window.setTimeout(() => {
        if (isCurrentSession(session) && phaseRef.current === 'prepare') {
          console.warn('[new-wdf-view] editor ready 超时,直接展开')
          startOpening(session)
        }
      }, EDITOR_READY_TIMEOUT)
    }, [
      beginSession,
      enterInlineEdit,
      isCurrentSession,
      morph,
      resolveEditStyle,
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
          // 内联:失焦收键盘 → closing 过站 → 同 tick 复位布局。
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
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
        settleToView,
        transitionPhase,
        viewportFocus,
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

    const requestMode = useCallback((next: NewWdfViewMode) => {
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
        className={cn('new-wdf-view', className)}
        ref={slotRef}
        style={style}
        {...props}
      >
        <div
          aria-hidden="true"
          className="new-wdf-view__backdrop"
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
          className="new-wdf-view__card"
          data-edit-style={resolvedEditStyle ?? undefined}
          data-phase={phase}
          data-toolbar-open={inlineToolbarOpen ? 'true' : 'false'}
          ref={shellRef}
          role={dialogEditing ? 'dialog' : undefined}
          tabIndex={-1}
        >
          <header className="new-wdf-view__header">
            <span className="new-wdf-view__title" id={titleId}>
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
                className="new-wdf-view__actions"
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
            <p className="new-wdf-view__error" role="alert">
              草稿转换失败,已保留编辑内容;请调整格式后重试收起。
            </p>
          )}

          <div className="new-wdf-view__body">
            {/* WdfRender 衬底:对话框流常驻(查看态内容+准备期视觉底);
                内联流编辑期隐藏,退出时复显最新文档。 */}
            <div className="new-wdf-view__render">
              <WdfRender {...renderProps} content={currentDocument} />
            </div>
            {sessionContent && (
              <div className="new-wdf-view__editor-layer">
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

          {/* 内置底栏:常驻 DOM,编辑态经高度/透明度过渡显出;非编辑态
              inert 禁焦点。收起态高度为 0,不占卡片空间。 */}
          <footer
            aria-label="编辑工具栏"
            className="new-wdf-view__toolbar"
            inert={phase !== 'edit'}
          >
            <div
              aria-label="编辑操作"
              className="new-wdf-view__toolbar-group"
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

NewWdfView.displayName = 'NewWdfView'
