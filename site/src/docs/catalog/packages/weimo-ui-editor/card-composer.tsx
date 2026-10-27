import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { CardComposer } from 'weimo-ui-editor/components/card-composer'
import { WdfCard } from 'weimo-ui-editor/components/wdf-card'
import type { WdfDocument } from 'weimo-wdf'

import { useDocsOutletContext } from '../../../shell/docs-outlet-context'
import type { ComponentDefinition } from '../../types'

/*
 * CardComposer 演示页(仅 site):列表场景的「新建」占位——壳层 0fr
 * 折叠展开,打开即编辑(窄屏对话框/宽屏行内);保存后占位复位、笔记
 * 落进下方列表;空内容退出(取消/空保存)整体收走。composer 收起后,
 * 顶栏右侧出现 + 钮(经 setTopBarAction 注册到站壳)重新打开。
 */

let noteSeq = 0

function CardComposerDemo() {
  const [notes, setNotes] = useState<{ id: number; document: WdfDocument }[]>([])
  const [composerVisible, setComposerVisible] = useState(true)
  const [composerClosing, setComposerClosing] = useState(false)
  const { setTopBarAction } = useDocsOutletContext()

  useEffect(() => {
    if (composerVisible) {
      setTopBarAction(null)
      return
    }

    setTopBarAction({
      ariaLabel: '新建笔记',
      icon: <Plus />,
      onClick: () => setComposerVisible(true),
    })
    return () => setTopBarAction(null)
  }, [composerVisible, setTopBarAction])

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
      ) : null}
      {notes.map((note) => (
        <WdfCard defaultValue={note.document} key={note.id} title="笔记" />
      ))}
    </div>
  )
}

export const cardComposerDefinition = {
  id: 'card-composer',
  summary:
    'CardComposer:列表内「新建」占位壳层——打开即编辑,空内容退出整体收起,有内容保存落列表',
  status: 'Preview',
  frame: 'plain',
  preview: () => <CardComposerDemo />,
} satisfies ComponentDefinition
