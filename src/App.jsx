import './App.css'
// The design system's tokens for every page (the console, the screens on the
// network); projected content uses only its own screen-* styles.
import '@ds/tokens.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkHome from '@/components/network/NetworkHome';
import NetStatus from '@/components/network/NetStatus';
import DesktopOnly from '@/components/DesktopOnly';
import PreviewBanner from '@/components/PreviewBanner';
import { keryx } from '@/api/keryxClient';
import { useWindowTitle } from '@/hooks/useChurch';
import { outputMeta } from '@/lib/outputPrefs';

import Console from './pages/Console';
import Projection from './pages/Projection';
import LyricProjection from './pages/LyricProjection';
import StageView from './pages/StageView';
import VideoProjection from './pages/VideoProjection';
import CommunicationProjection from './pages/CommunicationProjection';
import PastorView from './pages/PastorView';
import StreamView from './pages/StreamView';
import RemoteView from './pages/RemoteView';

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
    <Route path="/StreamView" element={<StreamView />} />
  </>
);

// A screen on the network says when it is (re)connecting, on every page but
// Transmissão (OBS composes that page over the camera: nothing else on it).
function NetworkStatus() {
  const { pathname } = useLocation();
  return pathname === '/StreamView' ? null : <NetStatus />;
}

// The window's (or the tab's) title carries the church: "Igreja X · KERYX"
// for the console, "Palco · Igreja X" for a screen (on the taskbar, in
// Alt-Tab and in a tablet's bookmarks).
const TITLED = new Set(['/Projection', '/LyricProjection', '/StageView', '/VideoProjection', '/CommunicationProjection', '/PastorView', '/StreamView']);
function WindowTitle() {
  const { pathname } = useLocation();
  useWindowTitle(pathname === '/Remote' ? 'Controle remoto' : TITLED.has(pathname) ? outputMeta(pathname).name : '');
  return null;
}

// Development only: the network start page in the browser preview, with the
// screens electron/lan.cjs lists (NETWORK_SCREENS), to check its layout.
const PREVIEW_SCREENS = [
  { path: '/Projection', label: 'Projeção principal', hint: 'O mesmo que o projetor: letras, Bíblia, mídia e avisos' },
  { path: '/LyricProjection', label: 'Letras', hint: 'Tablet ou TV com a letra da música' },
  { path: '/StageView', label: 'Palco', hint: 'Monitor do palco: letra atual, próxima e relógio' },
  { path: '/VideoProjection', label: 'Vídeo', hint: 'Recebe os vídeos enviados pelo operador' },
  { path: '/CommunicationProjection', label: 'Avisos', hint: 'Contagens regressivas e avisos' },
  { path: '/PastorView', label: 'Tela do pastor', hint: 'O que está projetado, relógio e tempo do culto' },
  { path: '/StreamView', label: 'Transmissão', hint: 'Legenda para a live: no OBS, Fonte de navegador 1920 × 1080, fundo transparente' },
];

// KERYX is the desktop app (docs/desktop-architecture.md): the operator
// console is the whole app; there is no login. On the church network a
// screen picks what it shows at "/". In a plain browser there is no backend,
// except in development: `npm run dev` runs the browser preview (sample
// data, src/api/backends/preview.js), marked by PreviewBanner.
function App() {
  if (!keryx.isDesktop && !keryx.isNetworkScreen) return <DesktopOnly />;
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        {import.meta.env.DEV && keryx.isPreview && <PreviewBanner />}
        <WindowTitle />
        <ErrorBoundary>
          {keryx.isNetworkScreen ? (
            <>
              <NetworkStatus />
              <Routes>
                {screens}
                {/* The phone that conducts the service: the network server
                    serves it only while it is on, behind its own code. */}
                <Route path="/Remote" element={<RemoteView />} />
                <Route path="*" element={<NetworkHome />} />
              </Routes>
            </>
          ) : (
            <Routes>
              <Route path="/Console" element={<Console />} />
              {screens}
              {import.meta.env.DEV && keryx.isPreview && <Route path="/Rede" element={<NetworkHome screens={PREVIEW_SCREENS} />} />}
              {import.meta.env.DEV && keryx.isPreview && <Route path="/Remote" element={<RemoteView />} />}
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
