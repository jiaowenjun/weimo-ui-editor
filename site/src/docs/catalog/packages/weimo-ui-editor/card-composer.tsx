import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'

import { CardComposer } from 'weimo-ui-editor/components/card-composer'

import { useDocsOutletContext } from '../../../shell/docs-outlet-context'
import type { ComponentDefinition } from '../../types'

/*
 * CardComposer 演示页(仅 site):列表场景的「新建」——顶栏 + 插入
 * composer(默认关闭,开启期 + 置灰);打开即编辑(窄屏对话框/宽屏
 * 行内);保存即落位:卡片原地变形为笔记常驻列表,+ 恢复可用;空
 * 内容退出(取消/空保存)整体收走。
 */

let slotSeq = 0

type ComposerSlot = { key: number }

function CardComposerDemo() {
  const [slots, setSlots] = useState<ComposerSlot[]>([])
  const [closingKeys, setClosingKeys] = useState<number[]>([])
  const [hasActive, setHasActive] = useState(false)
  const { setTopBarAction } = useDocsOutletContext()

  useEffect(() => {
    setTopBarAction({
      ariaLabel: '新建笔记',
      icon: <Plus />,
      onClick: () => {
        const key = ++slotSeq
        setSlots((current) => [{ key }, ...current])
        setHasActive(true)
      },
      disabled: hasActive,
    })
    return () => setTopBarAction(null)
  }, [hasActive, setTopBarAction])

  return (
    <div className="card-composer-demo">
      {slots.map((slot) => (
        <CardComposer
          clientId={`docs-card-composer-${slot.key}`}
          isClosing={closingKeys.includes(slot.key)}
          key={slot.key}
          onCancel={() =>
            setClosingKeys((keys) => [...keys, slot.key])
          }
          onExitAnimationEnd={() => {
            setClosingKeys((keys) => keys.filter((key) => key !== slot.key))
            setSlots((current) =>
              current.filter((item) => item.key !== slot.key),
            )
            setHasActive(false)
          }}
          onSave={() => setHasActive(false)}
        />
      ))}
    </div>
  )
}

export const cardComposerDefinition = {
  id: 'card-composer',
  summary:
    'CardComposer:列表内「新建」——打开即编辑,保存即落位为笔记常驻列表,空内容退出整体收起',
  status: 'Preview',
  frame: 'plain',
  preview: () => <CardComposerDemo />,
} satisfies ComponentDefinition
