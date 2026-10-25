import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'

/*
 * 演示页 DEBUG 开关(仅 site):经 portal 挂到站壳 main 内容区末尾,
 * 位于内容列 __content 之外,不受内容列宽度约束;
 * 开启后给站壳顶层部件(标题栏/内容区)画 outline,样式见 app.css。
 */
export function DebugOutlineToggle() {
  const [checked, setChecked] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost(document.querySelector('main.weimo-mini-site-template'))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('debug-outline', checked)
    return () => {
      document.documentElement.classList.remove('debug-outline')
    }
  }, [checked])

  if (!host) {
    return null
  }

  return createPortal(
    <div className="debug-outline-toggle">
      <LabeledSwitch
        ariaLabel="显示页面顶层部件轮廓"
        checked={checked}
        labelOff="DEBUG 关"
        labelOn="DEBUG 开"
        onCheckedChange={setChecked}
      />
    </div>,
    host,
  )
}
