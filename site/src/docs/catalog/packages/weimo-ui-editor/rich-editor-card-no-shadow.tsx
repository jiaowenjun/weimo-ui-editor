import './rich-editor-card-no-shadow.css'

import { RichEditorCardDemo } from './rich-editor-card'
import type { ComponentDefinition } from '../../types'

/*
 * 对照页:复用 rich-editor-card 的演示,只在本页把 --shadow-overlay 置空,
 * 且展开时不聚焦编辑器、不弹软键盘。
 * 现有 rich-editor-card 页面保持不变。
 */
export const richEditorCardNoShadowDefinition = {
  id: 'rich-editor-card-no-shadow',
  summary:
    '卡片式编辑的对照页:无阴影/遮罩 + 展开不聚焦(不弹软键盘),用于观察 iOS Safari 状态栏安全区回退',
  status: 'Preview',
  frame: 'plain',
  preview: () => (
    <div className="rec-card-noshadow-demo">
      <p className="rec-card-noshadow-note">
        对照页:本页展开态已移除浮层阴影和遮罩,且展开时不聚焦编辑器、软键盘不弹出
        (仅本页生效)。用真机 Safari 开合卡片,观察状态栏是否保持透明。
        若键盘从未弹出即为透明,则白带与软键盘相关。遮罩已移除,请用右上角
        X/完成或 Esc 收起;点击正文仍会聚焦并弹出键盘,观察时请勿点击正文。
      </p>
      <RichEditorCardDemo focusOnOpen={false} />
    </div>
  ),
} satisfies ComponentDefinition
