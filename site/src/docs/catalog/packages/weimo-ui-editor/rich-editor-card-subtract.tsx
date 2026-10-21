import './rich-editor-card-subtract.css'

import { useState } from 'react'

import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'
import {
  RichEditorCardDiagnosticDemo,
  type RichEditorCardOmit,
} from './rich-editor-card-diagnostic'
import type { ComponentDefinition } from '../../types'

/*
 * 减法排查页(仅 site):隔离页的复刻实验(E/F 系列)全部可恢复,但真实卡片
 * 仍复现白带——复刻路线失效,改为在真实卡片(诊断副本)上逐项关掉机制做减法。
 * 「卡片式编辑」「无阴影/遮罩」两页保持原始行为,不受本页影响。
 * 默认全部关闭开关 = 原样卡片(应复现);每次只打开一个开关,开合卡片
 * 3~5 次,找出让白带消失的开关。
 */

type SubtractSwitch = {
  key: RichEditorCardOmit | 'focus'
  label: string
  hint: string
}

const SUBTRACT_SWITCHES: SubtractSwitch[] = [
  { key: 'editor', label: '移除编辑器', hint: 'Tiptap 实例换静态占位' },
  { key: 'flushSync', label: '移除 flushSync', hint: 'phase 切换直接 setState' },
  { key: 'scrollBack', label: '移除收起滚动动画', hint: '编辑器视口不滚回开头' },
  { key: 'viewportTrack', label: '移除视口跟随', hint: '不监听 visualViewport/resize' },
  { key: 'modalHandlers', label: '移除 Esc/焦点陷阱', hint: '不挂 keydown/focusin' },
  { key: 'slotPin', label: '移除槽位钉高', hint: 'slot 不写 height' },
  { key: 'backdropTopLayer', label: '不提升遮罩', hint: '遮罩不进 top layer' },
  { key: 'keepAttribute', label: '关闭时移除 popover 属性', hint: '回到原始行为(A1 定罪路径)' },
  { key: 'focus', label: '展开不聚焦', hint: '不弹软键盘' },
]

function RichEditorCardSubtractDemo() {
  const [enabled, setEnabled] = useState<Partial<Record<SubtractSwitch['key'], boolean>>>({})

  const omit = SUBTRACT_SWITCHES.filter(
    (item) => item.key !== 'focus' && enabled[item.key],
  ).map((item) => item.key) as RichEditorCardOmit[]
  const focusOnOpen = !enabled.focus

  return (
    <div className="rec-subtract-demo">
      <p className="rec-subtract-note">
        减法排查页(构建标记 sub-v1,看不到说明未整页刷新)。默认与原卡片一致
        (应复现白带)。每次只打开一个开关,开合卡片 3~5 次:若白带消失,该开关
        对应的机制即根因;全部开关单独测完仍复现,再试两两组合。
      </p>

      <div className="rec-subtract-panel" role="group" aria-label="减法排查开关">
        {SUBTRACT_SWITCHES.map((item) => (
          <LabeledSwitch
            key={item.key}
            ariaLabel={item.label}
            checked={enabled[item.key] === true}
            labelOff={`${item.label}(原样)`}
            labelOn={`${item.label}:${item.hint}`}
            onCheckedChange={(checked) =>
              setEnabled((prev) => ({ ...prev, [item.key]: checked }))
            }
          />
        ))}
      </div>

      <RichEditorCardDiagnosticDemo focusOnOpen={focusOnOpen} omit={omit} />
    </div>
  )
}

export const richEditorCardSubtractDefinition = {
  id: 'rich-editor-card-subtract',
  summary:
    '卡片式编辑减法排查页:在真实卡片上逐项移除机制(编辑器/flushSync/滚动动画/视口跟随等),定位 iOS Safari 状态栏白带',
  status: 'Preview',
  frame: 'plain',
  preview: () => <RichEditorCardSubtractDemo />,
} satisfies ComponentDefinition
