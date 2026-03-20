import React from 'react'
import { useEffect } from 'react'
import { useUiStore } from './store/ui.store'
import { HomePage } from './pages/Home'
import { SetupPage } from './pages/Setup'
import { ScanPage } from './pages/Scan'
import { ExplorerPage } from './pages/Explorer'
import { PreviewPage } from './pages/Preview'
import { SettingsPage } from './pages/Settings'
import { DuplicatesPage } from './pages/Duplicates'
import { DateFixPage } from './pages/DateFix'

export default function App(): React.JSX.Element {
  const { page, setDependencies } = useUiStore()

  useEffect(() => {
    window.api.metadata.checkDependencies().then(setDependencies)
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      {page === 'home' && <HomePage />}
      {page === 'setup' && <SetupPage />}
      {page === 'scan' && <ScanPage />}
      {page === 'explorer' && <ExplorerPage />}
      {page === 'preview' && <PreviewPage />}
      {page === 'duplicates' && <DuplicatesPage />}
      {page === 'date-fix' && <DateFixPage />}
      {page === 'settings' && <SettingsPage />}
    </div>
  )
}
