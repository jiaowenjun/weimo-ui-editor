import {
  forwardRef, useEffect, useRef, useState, useSyncExternalStore, type ReactNode,
} from 'react'
import { WdfDocument } from 'weimo-wdf'

import { MOBILE_VIEWPORT_QUERY } from '../mobile-wdf-view/card-shell'
import { NewMdfInline } from './new-mdf-inline'
import { NewMdfOriginal } from './new-mdf-original'
import { resolveMdfImplementation } from './new-mdf-presentation'
export type { WdfDocument } from 'weimo-wdf'
export type NewMdfPresentation = 'auto' | 'inline' | 'dialog'
export type NewMdfViewHandle = {
  edit: () => void
  save: () => Promise<void>
  cancel: () => void
}
export type NewMdfViewProps = {
  document?: WdfDocument
  defaultDocument?: WdfDocument
  onCommit?: (document: WdfDocument) => void | Promise<void>
  onEditingChange?: (editing: boolean) => void
  heading?: ReactNode
  /** Accessible name, including when heading is not plain text. */
  label?: string
  placeholder?: string
  readOnly?: boolean
  /** Narrow screens always use the original panel; inline applies on wide screens. */
  presentation?: NewMdfPresentation
  following?: ReactNode
  className?: string
}

function subscribeNarrowScreen(notify: () => void) {
  const media = window.matchMedia(MOBILE_VIEWPORT_QUERY)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

function isNarrowScreen() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
}

/** Inline layout transitions on wide screens; original WdfView panel on mobile. */
export const NewMdfView = forwardRef<NewMdfViewHandle, NewMdfViewProps>(
  function NewMdfView(props, ref) {
    const [localDocument, setLocalDocument] = useState(() => props.defaultDocument ?? WdfDocument.empty())
    const narrow = useSyncExternalStore(subscribeNarrowScreen, isNarrowScreen, () => false)
    const [session, setSession] = useState<'original' | 'inline' | null>(null)
    const implementation = resolveMdfImplementation(narrow, props.presentation ?? 'auto', session)
    const Component = implementation === 'original' ? NewMdfOriginal : NewMdfInline
    const alive = useRef(true)
    const latest = useRef(props)
    latest.current = props
    useEffect(() => {
      alive.current = true
      return () => { alive.current = false }
    }, [])

    return <Component
      {...props} ref={ref} document={props.document ?? localDocument}
      onCommit={async (next) => {
        await latest.current.onCommit?.(next)
        if (alive.current && latest.current.document === undefined) setLocalDocument(next)
      }}
      onEditingChange={(editing) => {
        // Rotation / breakpoint changes must not replace an editor with an active draft.
        setSession(editing ? implementation : null)
        latest.current.onEditingChange?.(editing)
      }}
    />
  },
)

NewMdfView.displayName = 'NewMdfView'
