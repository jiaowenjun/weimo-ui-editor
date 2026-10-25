import type { NewMdfPresentation } from './new-mdf-view'

/** Freeze the chosen implementation until its original closing lifecycle completes. */
export function resolveMdfImplementation(
  narrow: boolean,
  presentation: NewMdfPresentation,
  session: 'original' | 'inline' | null,
): 'original' | 'inline' {
  return session ?? (narrow || presentation === 'dialog' ? 'original' : 'inline')
}
