import { useEffect, useState } from 'react'

import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'

/*
 * 演示页底部 DEBUG 开关(仅 site):开启后给站壳顶层部件(标题栏/内容区)
 * 画 outline,便于核对页面布局;轮廓样式见 app.css 的 .debug-outline 规则。
 */
export function DebugOutlineToggle() {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('debug-outline', checked)
    return () => {
      document.documentElement.classList.remove('debug-outline')
    }
  }, [checked])

  return (
    <div className="debug-outline-toggle">
      <LabeledSwitch
        ariaLabel="显示页面顶层部件轮廓"
        checked={checked}
        labelOff="DEBUG 关"
        labelOn="DEBUG 开"
        onCheckedChange={setChecked}
      />
    </div>
  )
}
