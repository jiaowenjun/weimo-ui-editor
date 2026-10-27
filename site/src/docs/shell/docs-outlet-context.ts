import { useOutletContext } from 'react-router'
import type { ReactNode } from 'react'

import { type ComponentDoc } from '../catalog/component-docs'

/** 页面注册到站壳顶栏右侧的动作钮(经 FrostedIconButton 渲染)。 */
export type DocsTopBarAction = {
  ariaLabel: string
  icon: ReactNode
  onClick: () => void
  /** 置灰禁用(钮常驻,由页面按自身状态切换)。 */
  disabled?: boolean
}

export type DocsOutletContext = {
  docs: ComponentDoc[]
  /** 页面挂载期注册/注销顶栏动作;传 null 清除,卸载清理由页面负责。 */
  setTopBarAction: (action: DocsTopBarAction | null) => void
}

export function useDocsOutletContext() {
  return useOutletContext<DocsOutletContext>()
}
