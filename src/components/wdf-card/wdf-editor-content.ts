import { toTiptap, type WdfDocument } from 'weimo-wdf'

import type { RichEditorContent } from '../rich-editor/rich-editor'

/**
 * ProseMirror omits empty `content` arrays from `getJSON()`. Mirror that wire
 * shape before passing a controlled value to RichEditor, otherwise a valid WDF
 * empty paragraph would look different after every update and trigger a full
 * `setContent` that resets the selection.
 */
export function toWdfEditorContent(document: WdfDocument): RichEditorContent {
  return JSON.parse(
    JSON.stringify(toTiptap(document), (_key, value: unknown) =>
      Array.isArray(value) && value.length === 0 ? undefined : value,
    ),
  ) as RichEditorContent
}
