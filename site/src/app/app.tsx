import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import './app.css'
import { componentDocs } from '../docs/catalog/component-docs'
import { DocsShell } from '../docs/shell/docs-shell'
import { ComponentDetailPage } from '../docs/pages/component-detail-page'
import { componentPath, routerBasename } from '../docs/routes'

const defaultComponentPath = componentPath(componentDocs[0].id)

function App() {
  return (
    <BrowserRouter basename={routerBasename || undefined}>
      <Routes>
        <Route element={<DocsShell />} path="/">
          <Route index element={<Navigate replace to={defaultComponentPath} />} />
          <Route element={<ComponentDetailPage />} path="components/:componentId" />
          <Route element={<Navigate replace to={defaultComponentPath} />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
