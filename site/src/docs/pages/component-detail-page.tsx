import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'

import { PreviewPage } from 'weimo-ui-template/components/card'
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

  return (
    <PreviewPage
      componentId={selected.id}
      frame={selected.frame}
      summary={selected.summary}
    >
      {selected.preview()}
    </PreviewPage>
  )
}
