import { BlockMath } from '@tiptap/extension-mathematics'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { MdEditorBlockMathView } from './md-editor-math-view'

export const MdEditorBlockMath = BlockMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MdEditorBlockMathView, {
      className: 'md-editor__math md-editor__block-math tiptap-mathematics-render',
      attrs: ({ node }) => ({
        'data-type': 'block-math',
        'data-latex': String(node.attrs.latex ?? ''),
      }),
    })
  },
})
