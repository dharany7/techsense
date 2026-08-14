import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Layout, { PageTransition } from './components/Layout'
import HomeScreen from './screens/HomeScreen'
import ClarifyingQuestionsScreen from './screens/ClarifyingQuestionsScreen'
import DiagnosisResultsScreen from './screens/DiagnosisResultsScreen'
import EscalationScreen from './screens/EscalationScreen'

// AnimatedRoutes must live inside BrowserRouter so useLocation() works
function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageTransition>
              <HomeScreen />
            </PageTransition>
          }
        />
        <Route
          path="/clarifying"
          element={
            <PageTransition>
              <ClarifyingQuestionsScreen />
            </PageTransition>
          }
        />
        <Route
          path="/results"
          element={
            <PageTransition>
              <DiagnosisResultsScreen />
            </PageTransition>
          }
        />
        <Route
          path="/escalation"
          element={
            <PageTransition>
              <EscalationScreen />
            </PageTransition>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <AnimatedRoutes />
      </Layout>
    </BrowserRouter>
  )
}
