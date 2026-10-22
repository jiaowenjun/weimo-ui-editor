import { useState } from 'react'
import { Pencil } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  MobileWdfView,
  type MobileWdfViewMode,
} from 'weimo-ui-editor/components/mobile-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * 移动卡片式视图演示页(仅 site):对齐 wdf-view 演示,由
 * ComponentPreviewCard 提供标题栏与编辑入口(铅笔);组件以 embedded
 * 模式嵌入——折叠态融入外卡(无自有卡面/标题栏/内容边距),展开
 * 对话框态随 morph 滑出 chrome。关闭操作与工具栏留在卡片内:会话期
 * 外部交互全部被 inert,不可外置。组件实现见 src/components/
 * mobile-wdf-view/(iOS Safari 状态栏修复背景详见
 * docs/ios-safari-statusbar-toplayer.md)。
 */

function MobileWdfViewDemo() {
  const [mode, setMode] = useState<MobileWdfViewMode>('view')

  return (
    <ComponentPreviewCard
      action={
        <GhostIconButton
          aria-label="切换到编辑模式"
          onClick={() => setMode('edit')}
          size="sm"
        >
          <Pencil />
        </GhostIconButton>
      }
      label={
        <>
          移动卡片式视图{' '}
          <code className="docs-component-class">mobile-wdf-view</code>
        </>
      }
    >
      <MobileWdfView
        defaultValue={wdfRenderSample as WdfDocument}
        embedded
        mode={mode}
        onModeChange={setMode}
        title="移动卡片式视图"
      />
    </ComponentPreviewCard>
  )
}

export const mobileWdfViewDefinition = {
  id: 'mobile-wdf-view',
  summary:
    'MobileWdfView:卡片式 WDF 读写视图(CardShell + WdfRender 衬底 + 按会话挂载 RichEditor + 内容撑高无上限 + iOS Safari 状态栏修复)',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewDemo />,
} satisfies ComponentDefinition
