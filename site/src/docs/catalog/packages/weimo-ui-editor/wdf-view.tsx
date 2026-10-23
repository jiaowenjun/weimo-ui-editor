import { useState } from 'react'

import './wdf-view.css'

import { WdfView } from 'weimo-ui-editor/components/wdf-view'
import type { WdfViewExitScrollFix } from 'weimo-ui-editor/components/wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * WdfView 演示页(仅 site):单卡自适应编辑 + 「退出滚动条自调」
 * 修复候选切换(实机判别病因用,详见组件 exitScrollFix 注释)。
 * 页底填充块制造滚动余量,用于区分「页面中部」与「文档底部」两种
 * 退出位置的行为。
 */

const FIXES: ReadonlyArray<{ id: WdfViewExitScrollFix; label: string }> = [
  { id: 'none', label: '对照 none' },
  { id: 'anchor-end', label: 'A anchor-end' },
  { id: 'refcount', label: 'B refcount' },
  { id: 'preclamp', label: 'C preclamp' },
  { id: 'blur', label: 'D blur' },
]

function WdfViewDemo() {
  const sample = wdfRenderSample as WdfDocument
  const [fix, setFix] = useState<WdfViewExitScrollFix>('none')

  return (
    <div className="wdf-fix-lab">
      <div aria-label="退出滚动修复候选" className="wdf-fix-lab__switch" role="group">
        {FIXES.map((item) => (
          <button
            className="wdf-fix-lab__option"
            data-active={fix === item.id || undefined}
            key={item.id}
            onClick={() => setFix(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <WdfView
        defaultValue={sample}
        exitScrollFix={fix}
        title={
          <>
            自适应编辑 <code className="docs-component-class">wdf-view</code>
          </>
        }
      />
      <div className="wdf-fix-lab__filler">
        页面填充——制造滚动余量:分别在「页面中部」与「文档底部」
        进入/退出编辑,对比各候选下滚动条行为。
      </div>
    </div>
  )
}

export const wdfViewDefinition = {
  id: 'wdf-view',
  summary:
    'WdfView:自适应编辑样式——窄屏(≤640px)卡片对话框 morph,宽屏行内编辑;样式会话内冻结',
  status: 'Preview',
  frame: 'plain',
  preview: () => <WdfViewDemo />,
} satisfies ComponentDefinition
