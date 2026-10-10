import { forwardRef } from 'react'

import { MdRender, type MdRenderProps } from 'weimo-ui-markdown/components/md-render'

export type MdRenderSimpleProps = MdRenderProps

export const MdRenderSimple = forwardRef<HTMLDivElement, MdRenderSimpleProps>(
  function MdRenderSimple(props, ref) {
    return <MdRender ref={ref} variant="simple" {...props} />
  },
)

MdRenderSimple.displayName = 'MdRenderSimple'
