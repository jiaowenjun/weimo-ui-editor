import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  CardFrame as CossCardFrame,
  CardPanel as CossCardPanel,
} from '../../components/primitives/card'
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
    return selected.preview()
  }

  return (
    <CossCardFrame className="doc-page">
      {selected.summary ? <p className="doc-page__summary">{selected.summary}</p> : null}

      <div className="demo-block">
        <CossCardPanel className="demo-block__panel preview-stage" data-component-id={selected.id} variant="stage">
          {selected.preview()}
        </CossCardPanel>
      </div>
    </CossCardFrame>
  )
}
