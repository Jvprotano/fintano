import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { bootstrapMonthlyPlans } from './data/monthlyPlanMigration'
import { RecoveryScreen } from './components/RecoveryScreen'

const repository = bootstrapMonthlyPlans()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {repository.status === 'blocked' ? <RecoveryScreen inspection={repository} /> : <App />}
  </StrictMode>,
)
