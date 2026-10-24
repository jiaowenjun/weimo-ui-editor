import { useRef, useState } from 'react'
import { WdfDocument } from 'weimo-wdf'
import {
  NewMdfView, type NewMdfMotion, type NewMdfPresentation, type NewMdfViewHandle,
} from 'weimo-ui-editor/components/new-mdf-view'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

const longDocument: WdfDocument = {
  ...wdfRenderSample,
  root: {
    type: 'doc',
    content: [
      ...wdfRenderSample.root.content,
      ...Array.from({ length: 18 }, (_, index) => ({
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: `第 ${index + 1} 段：这是一段用于检查长文滚动与软件键盘的正文。可以在文末输入，删除多段内容，或取消修改，观察退出后的卡片底边与阅读位置。` }],
      })),
    ],
  },
}

function Comparison({
  motion, sample, presentation, saveBehavior, onEditingChange,
}: {
  motion: NewMdfMotion
  sample: WdfDocument
  presentation: NewMdfPresentation
  saveBehavior: string
  onEditingChange: (editing: boolean) => void
}) {
  const editor = useRef<NewMdfViewHandle>(null)
  const [document, setDocument] = useState(sample)
  const [saves, setSaves] = useState(0)
  const [editing, setEditing] = useState(false)
  const [event, setEvent] = useState('尚未开始编辑')
  return (
    <section className="new-mdf-comparison__case">
      <div className="new-mdf-comparison__intro">
        <h3>{motion === 'flow' ? '方案 A · 连续布局' : '方案 B · 浏览器转场'}</h3>
        <p>{motion === 'flow' ? '观察卡片收高时，正文和下方内容的连续移动。' : '对照同样的操作，观察转场清晰度和滚动稳定性。'}</p>
      </div>
      <NewMdfView
        ref={editor} document={document} presentation={presentation} motion={motion}
        heading="自适应编辑" label={`方案 ${motion === 'flow' ? 'A' : 'B'} 编辑卡片`}
        onEditingChange={(next) => {
          setEditing(next)
          setEvent(next ? '正在编辑，输入仅保留在草稿中' : '已退出编辑')
          onEditingChange(next)
        }}
        onCommit={async (next) => {
          if (saveBehavior !== 'instant') await new Promise<void>((resolve) => window.setTimeout(resolve, 800))
          if (saveBehavior === 'fail') throw new Error('模拟保存失败，草稿已保留。可将保存方式改为成功后重试。')
          setDocument(next)
          setSaves((count) => count + 1)
          setEvent('内容已保存')
        }}
        following={
          <div className="new-mdf-comparison__following">
            <p className="new-mdf-comparison__reference">下方参照：与卡片的间距应始终保持一致</p>
            {[1, 2, 3].map((item) => <p key={item}>普通内容 {item}：进入与退出编辑时，观察这段文字是否平滑跟随，是否重影，以及最后一帧是否再次跳动。</p>)}
          </div>
        }
      />
      <div className="new-mdf-comparison__external">
        <button type="button" onClick={() => editor.current?.edit()} disabled={editing}>开始编辑</button>
        <button type="button" onClick={() => void editor.current?.save()} disabled={!editing}>保存</button>
        <button type="button" onClick={() => editor.current?.cancel()} disabled={!editing}>取消</button>
      </div>
      <output className="new-mdf-comparison__result" aria-live="polite">成功提交 {saves} 次 · {event}</output>
    </section>
  )
}

function NewMdfViewDemo() {
  const [sample, setSample] = useState('standard')
  const [presentation, setPresentation] = useState<NewMdfPresentation>('auto')
  const [saveBehavior, setSaveBehavior] = useState('instant')
  const [version, setVersion] = useState(0)
  const [editingCount, setEditingCount] = useState(0)
  const [spacer, setSpacer] = useState(false)
  const [snapshotSupported] = useState(() => typeof document.startViewTransition === 'function')
  const content = sample === 'long' ? longDocument : sample === 'empty' ? WdfDocument.empty() : wdfRenderSample
  return (
    <div className="new-mdf-comparison">
      <div className="new-mdf-comparison__description">
        <h2>NewMdfView · 两种新方案</h2>
        <p>同内容、同样式、同保存语义。先分别测试保存与取消，再在长文末尾打开软件键盘，观察卡片收高、下方内容和滚动位置。</p>
        <p>两方案的差别在原位切换;面板编辑共用相同的展开与返回动画。手机上请选择“原位编辑”直接比较 A / B,再用“自适应”检查面板与键盘。</p>
        <p>进入编辑不会自动弹出键盘；请先观察面板展开，再点击正文输入。窄屏面板顶部对齐，键盘弹出时只收缩可用空间。</p>
        <p>{snapshotSupported ? '此浏览器支持方案 B 的浏览器转场。' : '此浏览器不支持浏览器转场，方案 B 当前使用方案 A；不能据此比较两种动画。'}</p>
      </div>
      <div className="new-mdf-comparison__settings">
        <label>编辑方式 <select value={presentation} disabled={editingCount > 0} onChange={(event) => setPresentation(event.target.value as NewMdfPresentation)}>
          <option value="auto">自适应</option><option value="inline">原位编辑</option><option value="dialog">面板编辑</option>
        </select></label>
        <label>内容 <select value={sample} disabled={editingCount > 0} onChange={(event) => { setSample(event.target.value); setVersion((value) => value + 1) }}>
          <option value="standard">普通内容</option><option value="long">长文</option><option value="empty">空内容</option>
        </select></label>
        <label>保存方式 <select value={saveBehavior} onChange={(event) => setSaveBehavior(event.target.value)}>
          <option value="instant">立即成功</option><option value="wait">等待后成功</option><option value="fail">等待后失败</option>
        </select></label>
        <button type="button" disabled={editingCount > 0} onClick={() => setVersion((value) => value + 1)}>重置两张卡片</button>
        <label><input type="checkbox" checked={spacer} disabled={editingCount > 0} onChange={(event) => setSpacer(event.target.checked)} />增加页首空白以测试滚动</label>
      </div>
      {spacer && <div className="new-mdf-comparison__spacer"><p>向下滚动至卡片，分别在页面中部与接近底部的位置测试。</p></div>}
      <div className="new-mdf-comparison__grid">
        {(['flow', 'snapshot'] as const).map((motion) => <Comparison key={`${motion}-${sample}-${version}`}
          motion={motion} sample={content} presentation={presentation} saveBehavior={saveBehavior}
          onEditingChange={(next) => setEditingCount((count) => Math.max(0, count + (next ? 1 : -1)))} />)}
      </div>
      <details className="new-mdf-comparison__checklist">
        <summary>实机检查清单</summary>
        <ol>
          <li>进入与退出：卡片、工具栏和参照内容连续运动，无瞬收、闪白或结束帧跳位。</li>
          <li>进入时键盘不自动弹出；点击正文后键盘出现，卡片不先下移再上跳。展开未结束时立即点击正文也应稳定。</li>
          <li>增加和删除正文后分别保存与取消；取消不增加成功提交次数。</li>
          <li>长文末尾输入，键盘展开后退出，再测试旋转屏幕与窗口调整。</li>
          <li>等待与失败：重复点击不能重复提交，失败后可改为成功并重试。</li>
          <li>检查明暗主题、中文输入法、键盘快捷键与减少动态效果。</li>
        </ol>
        <p>尚未完成实机验收。相同效果下优先考虑方案 A 的兼容性；若 Safari 连续布局仍引起跳位，再以方案 B 的设备表现决定。</p>
      </details>
    </div>
  )
}

export const newMdfViewDefinition = {
  id: 'new-mdf-view', summary: 'NewMdfView：从体验规格重新设计的 WDF 阅读与编辑，两种动画方案实机对比',
  status: 'Preview', frame: 'plain', preview: () => <NewMdfViewDemo />,
} satisfies ComponentDefinition
