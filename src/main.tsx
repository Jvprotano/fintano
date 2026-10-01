import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { bootstrapLedgerKinds } from './data/ledgerMigration'
import { RecoveryScreen } from './components/RecoveryScreen'

const repository = bootstrapLedgerKinds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {repository.status === 'blocked' ? <RecoveryScreen inspection={repository} /> : <App />}
  </StrictMode>,
)
