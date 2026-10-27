import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { CardComposer } from 'weimo-ui-editor/components/card-composer'

/*
 * ComposerPlayground:CardComposer 的槽位驱动展示模型——+ 在列表顶
 * 插入 composer,保存者原地落位为笔记永留,空内容退出经退场协议移除;
 * hasActive 驱动 + 的禁用。主页展示区使用。
 */

let playgroundSlotSeq = 0

export type ComposerPlayground = {
  /** 有进行中的 composer(开启未落位/未退出),+ 应禁用。 */
  hasActive: boolean
  /** 顶部插入一个新的 composer。 */
  openNew: () => void
  /** composer 列表(最新在前);在渲染期调用。 */
  renderList: () => ReactNode
}

export function useComposerPlayground(): ComposerPlayground {
  const [slots, setSlots] = useState<number[]>([])
  const [closingKeys, setClosingKeys] = useState<number[]>([])
  const [hasActive, setHasActive] = useState(false)

  const openNew = useCallback(() => {
    setSlots((current) => [++playgroundSlotSeq, ...current])
    setHasActive(true)
  }, [])

  const requestClose = useCallback((key: number) => {
    setClosingKeys((keys) => [...keys, key])
  }, [])

  const handleExited = useCallback((key: number) => {
    setClosingKeys((keys) => keys.filter((item) => item !== key))
    setSlots((current) => current.filter((item) => item !== key))
    setHasActive(false)
  }, [])

  const handleSaved = useCallback(() => setHasActive(false), [])

  function renderList() {
    return slots.map((key) => (
      <CardComposer
        clientId={`composer-playground-${key}`}
        isClosing={closingKeys.includes(key)}
        key={key}
        onCancel={() => requestClose(key)}
        onExitAnimationEnd={() => handleExited(key)}
        onSave={handleSaved}
      />
    ))
  }

  return { hasActive, openNew, renderList }
}
