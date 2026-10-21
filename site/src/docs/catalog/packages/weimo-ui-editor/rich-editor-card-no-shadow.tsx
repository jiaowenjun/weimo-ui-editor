import './rich-editor-card-no-shadow.css'

import { richEditorCardDefinition } from './rich-editor-card'
import type { ComponentDefinition } from '../../types'

/*
 * 对照页:复用 rich-editor-card 的演示,只在本页把 --shadow-overlay 置空。
 * 现有 rich-editor-card 页面保持不变。
 */
export const richEditorCardNoShadowDefinition = {
  id: 'rich-editor-card-no-shadow',
  summary:
    '卡片式编辑的对照页:展开态移除浮层阴影与遮罩,用于观察 iOS Safari 状态栏安全区回退',
  status: 'Preview',
  frame: 'plain',
  preview: () => (
    <div className="rec-card-noshadow-demo">
      <p className="rec-card-noshadow-note">
        对照页:本页展开态已移除浮层阴影和遮罩（仅本页生效）。用真机 Safari
        开合卡片,观察状态栏是否仍变为不透明。遮罩已移除,请用右上角 X/完成或
        Esc 收起。
      </p>
      {richEditorCardDefinition.preview()}
    </div>
  ),
} satisfies ComponentDefinition
