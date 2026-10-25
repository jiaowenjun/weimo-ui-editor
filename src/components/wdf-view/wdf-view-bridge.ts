import { createContext, type RefObject } from 'react'
import type { JSONContent } from '@tiptap/core'

/** Internal persistence adapter. It never owns layout, focus, viewport, or animation. */
export type WdfViewBridge = {
  readOnly: boolean
  saving: boolean
  error: string
  cancelRef: RefObject<(() => void) | null>
  save: (content: JSONContent, close: () => void) => void
}

export const WdfViewBridgeContext = createContext<WdfViewBridge | null>(null)
