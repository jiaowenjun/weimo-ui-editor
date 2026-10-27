import { useState } from 'react'

import { CardComposer } from 'weimo-ui-editor/components/card-composer'
import { WdfCard } from 'weimo-ui-editor/components/wdf-card'
import type { WdfDocument } from 'weimo-wdf'

import type { ComponentDefinition } from '../../types'

/*
 * CardComposer 演示页(仅 site):列表场景的「新建」占位——壳层 0fr
 * 折叠展开;点铅笔进入编辑(窄屏对话框/宽屏行内),保存后占位复位、
 * 笔记落进下方列表;✕ 走 isClosing 退场协议,收起动画结束后卸载。
 */

let noteSeq = 0

function CardComposerDemo() {
  const [notes, setNotes] = useState<{ id: number; document: WdfDocument }[]>([])
  const [composerVisible, setComposerVisible] = useState(true)
  const [composerClosing, setComposerClosing] = useState(false)

  return (
    <div className="card-composer-demo">
      {composerVisible ? (
        <CardComposer
          clientId="docs-card-composer"
          isClosing={composerClosing}
          onCancel={() => setComposerClosing(true)}
          onExitAnimationEnd={() => {
            setComposerClosing(false)
            setComposerVisible(false)
          }}
          onSave={(document) => {
            const id = ++noteSeq
            setNotes((current) => [{ id, document }, ...current])
          }}
        />
      ) : (
        <button
          className="card-composer-demo__reopen"
          onClick={() => setComposerVisible(true)}
          type="button"
        >
          重新打开新建
        </button>
      )}
      {notes.map((note) => (
        <WdfCard defaultValue={note.document} key={note.id} title="笔记" />
      ))}
    </div>
  )
}

export const cardComposerDefinition = {
  id: 'card-composer',
  summary:
    'CardComposer:列表内「新建」占位壳层——0fr 折叠进出场,编辑交给 WdfCard(窄屏对话框/宽屏行内),不自动聚焦',
  status: 'Preview',
  frame: 'plain',
  preview: () => <CardComposerDemo />,
} satisfies ComponentDefinition
