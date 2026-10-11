import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { useDocsOutletContext } from '../shell/docs-outlet-context'

export function ComponentDetailPage() {
  const { componentId } = useParams()
  const navigate = useNavigate()
  const { docs } = useDocsOutletContext()
  const selected = docs.find((doc) => doc.id === componentId)

  useEffect(() => {
    if (!selected) {
      navigate('/', { replace: true })
    }
  }, [navigate, selected])

  if (!selected) {
    return null
  }

  if (selected.frame === 'plain') {
    return <>{selected.preview()}</>
  }

  return (
    <ComponentPreviewCard
      data-component-id={selected.id}
      label={
        <>
          {selected.name}{' '}
          <code className="docs-component-class">{selected.id}</code>
        </>
      }
    >
      {selected.summary ? (
        <p>{selected.summary}</p>
      ) : null}
      {selected.preview()}
    </ComponentPreviewCard>
  )
}
