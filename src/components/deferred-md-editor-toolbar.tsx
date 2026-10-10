import { lazy, Suspense } from 'react'

import type { MdEditorToolbarProps } from './md-editor/md-editor-toolbar'

const MdEditorToolbar = lazy(() =>
  import('./md-editor/md-editor-toolbar').then((module) => ({
    default: module.MdEditorToolbar,
  })),
)

export function DeferredMdEditorToolbar(props: MdEditorToolbarProps) {
  return (
    <Suspense fallback={null}>
      <MdEditorToolbar {...props} />
    </Suspense>
  )
}
