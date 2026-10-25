import { useRef, useState } from 'react'
import { WdfDocument } from 'weimo-wdf'
import {
  NewMdfView, type NewMdfPresentation, type NewMdfViewHandle,
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

function EditableExample({
  sample, presentation, saveBehavior, onEditingChange,
}: {
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
    <section className="new-mdf-demo__example">
      <NewMdfView
        ref={editor} document={document} presentation={presentation}
        heading="自适应编辑" label="WDF 编辑卡片"
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
          <div className="new-mdf-demo__following">
            <p className="new-mdf-demo__reference">下方参照：与卡片的间距应始终保持一致</p>
            {[1, 2, 3].map((item) => <p key={item}>普通内容 {item}：进入与退出编辑时，观察这段文字是否平滑跟随，是否重影，以及最后一帧是否再次跳动。</p>)}
          </div>
        }
      />
      <div className="new-mdf-demo__external">
        <button type="button" onClick={() => editor.current?.edit()} disabled={editing}>开始编辑</button>
        <button type="button" onClick={() => void editor.current?.save()} disabled={!editing}>保存</button>
        <button type="button" onClick={() => editor.current?.cancel()} disabled={!editing}>取消</button>
      </div>
      <output className="new-mdf-demo__result" aria-live="polite">成功提交 {saves} 次 · {event}</output>
    </section>
  )
}

function NewMdfViewDemo() {
  const [sample, setSample] = useState('standard')
  const [presentation, setPresentation] = useState<NewMdfPresentation>('auto')
  const [saveBehavior, setSaveBehavior] = useState('instant')
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [spacer, setSpacer] = useState(false)
  const content = sample === 'long' ? longDocument : sample === 'empty' ? WdfDocument.empty() : wdfRenderSample
  return (
    <div className="new-mdf-demo">
      <div className="new-mdf-demo__description">
        <h2>NewMdfView</h2>
        <p>使用一份 WDF 内容完成阅读与编辑。先分别测试保存与取消，再在长文末尾打开软件键盘，观察卡片收高、下方内容和滚动位置。</p>
        <p>宽屏在卡片内编辑，工具栏、卡片高度和后续内容连续变化。窄屏（≤640px）使用原 WdfView：相同的卡片、顶部保存/取消、底部格式工具栏、键盘避让和返回过渡。</p>
        <p>进入编辑不自动聚焦正文；请先观察展开，再点击正文输入。窄屏即使选择“原位编辑”也仍使用原面板。</p>
      </div>
      <div className="new-mdf-demo__settings">
        <label>编辑方式 <select value={presentation} disabled={editing} onChange={(event) => setPresentation(event.target.value as NewMdfPresentation)}>
          <option value="auto">自适应</option><option value="inline">原位编辑（仅宽屏）</option><option value="dialog">原组件面板</option>
        </select></label>
        <label>内容 <select value={sample} disabled={editing} onChange={(event) => { setSample(event.target.value); setVersion((value) => value + 1) }}>
          <option value="standard">普通内容</option><option value="long">长文</option><option value="empty">空内容</option>
        </select></label>
        <label>保存方式 <select value={saveBehavior} onChange={(event) => setSaveBehavior(event.target.value)}>
          <option value="instant">立即成功</option><option value="wait">等待后成功</option><option value="fail">等待后失败</option>
        </select></label>
        <button type="button" disabled={editing} onClick={() => setVersion((value) => value + 1)}>重置卡片</button>
        <label><input type="checkbox" checked={spacer} disabled={editing} onChange={(event) => setSpacer(event.target.checked)} />增加页首空白以测试滚动</label>
      </div>
      {spacer && <div className="new-mdf-demo__spacer"><p>向下滚动至卡片，分别在页面中部与接近底部的位置测试。</p></div>}
      <EditableExample key={`${sample}-${version}`}
        sample={content} presentation={presentation} saveBehavior={saveBehavior}
        onEditingChange={setEditing} />
      <details className="new-mdf-demo__checklist">
        <summary>实机检查清单</summary>
        <ol>
          <li>进入与退出：卡片、工具栏和参照内容连续运动，无瞬收、闪白或结束帧跳位。</li>
          <li>窄屏对照原 WdfView：卡片外观、尺寸、按钮、展开、手动唤起键盘和退出落位均一致；进入时键盘不自动弹出。</li>
          <li>先向下滚动使 Safari 浏览器栏收起，再展开卡片并点击正文：键盘弹出与收起时，标题栏应保持顶部间距，不向上漂移或回弹。</li>
          <li>增加和删除正文后分别保存与取消；取消不增加成功提交次数。</li>
          <li>长文末尾输入，键盘展开后退出，再测试旋转屏幕与窗口调整。</li>
          <li>等待与失败：重复点击不能重复提交，失败后可改为成功并重试。</li>
          <li>检查明暗主题、中文输入法、键盘快捷键与减少动态效果。</li>
        </ol>
        <p>窄屏面板与键盘表现仍需实机回归；自动检查与桌面窄屏检查不能代替 iPhone Safari 验证。</p>
      </details>
    </div>
  )
}

export const newMdfViewDefinition = {
  id: 'new-mdf-view', summary: 'NewMdfView：WDF 阅读与编辑，宽屏连续布局过渡，窄屏原组件面板',
  status: 'Preview', frame: 'plain', preview: () => <NewMdfViewDemo />,
} satisfies ComponentDefinition
