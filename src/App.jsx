import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkHome from '@/components/network/NetworkHome';
import DesktopOnly from '@/components/DesktopOnly';
import { keryx } from '@/api/keryxClient';

import Console from './pages/Console';
import Projection from './pages/Projection';
import LyricProjection from './pages/LyricProjection';
import StageView from './pages/StageView';
import VideoProjection from './pages/VideoProjection';
import CommunicationProjection from './pages/CommunicationProjection';
import PastorView from './pages/PastorView';

// The screens every output shows (the projector, the stage, the video
// screens…): opened by the console or the main process on this computer,
// and by tablets and TVs on the church network (electron/lan.cjs serves only
// these, NETWORK_SCREENS).
const screens = (
  <>
    <Route path="/Projection" element={<Projection />} />
    <Route path="/LyricProjection" element={<LyricProjection />} />
    <Route path="/StageView" element={<StageView />} />
    <Route path="/VideoProjection" element={<VideoProjection />} />
    <Route path="/CommunicationProjection" element={<CommunicationProjection />} />
    <Route path="/PastorView" element={<PastorView />} />
  </>
);

// KERYX is the desktop app (docs/desktop-architecture.md): the operator
// console is the whole app; there is no login. On the church network a
// screen picks what it shows at "/". In a plain browser there is no backend.
function App() {
  if (!keryx.isDesktop && !keryx.isNetworkScreen) return <DesktopOnly />;
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ErrorBoundary>
          {keryx.isNetworkScreen ? (
            <Routes>
              {screens}
              <Route path="*" element={<NetworkHome />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/Console" element={<Console />} />
              {screens}
              <Route path="*" element={<Navigate to="/Console" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
