import { InlineMath } from '@tiptap/extension-mathematics'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { MdEditorInlineMathView } from './md-editor-math-view'

export const MdEditorInlineMath = InlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MdEditorInlineMathView, {
      className: 'md-editor__math md-editor__inline-math tiptap-mathematics-render',
      attrs: ({ node }) => ({
        'data-type': 'inline-math',
        'data-latex': String(node.attrs.latex ?? ''),
      }),
    })
  },
})
