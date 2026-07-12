import { lazy, Suspense } from 'react'

const LandingPage = lazy(() => import('./site/LandingPage'))
const GamePage = lazy(() => import('./game/GamePage'))

function RouteFallback() {
  return (
    <main className="route-loader" aria-live="polite">
      <div className="route-loader__mark" aria-hidden="true" />
      <p>RESTORING GREEN SIGNAL</p>
    </main>
  )
}

export default function App() {
  const playRoute = window.location.pathname.replace(/\/+$/, '') === '/play'

  return (
    <Suspense fallback={<RouteFallback />}>
      {playRoute ? <GamePage /> : <LandingPage />}
    </Suspense>
  )
}
