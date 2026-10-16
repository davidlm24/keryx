// Every stylesheet loads with the entry, in the order the single bundle had
// before the pages were split (Tailwind last, main.jsx): a page's code now
// loads apart, but a tie between a console rule and a Tailwind utility still
// resolves as it did. A new stylesheet goes in this list too: the build
// refuses CSS outside the entry (scripts/bundle-budget.cjs).
import './App.css'
// The design system's tokens for every page (the console, the screens on the
// network); projected content uses only its own screen-* styles.
import '@ds/tokens.css'
import '@/components/network/net.css'
import '@ds/components/bundle.css'
import '@/components/console/console.css'
import '@/components/screen/screen.css'
import '@/components/screen/activity.css'
import '@/components/screen/layout.css'
import '@/components/screen/output-prefs.css'
import { lazy, Suspense, useLayoutEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetStatus from '@/components/network/NetStatus';
import DesktopOnly from '@/components/DesktopOnly';
import PreviewBanner from '@/components/PreviewBanner';
import { keryx } from '@/api/keryxClient';
import { useWindowTitle } from '@/hooks/useChurch';
import { outputMeta } from '@/lib/outputPrefs';
import { OUTPUT_NAMES } from '@/lib/network/views';

// Every page is a chunk of its own: an output window or a screen on the
// church network loads the entry, its page and the renderer, never the
// console's code (scripts/bundle-budget.cjs holds them to a budget). While a
// page's code loads, an output stays black (never a spinner on the
// projector), Transmissão stays transparent (OBS lays it over the camera) and
// the console, a detached page, the phone and the network's start page show
// the console's ground.
const Console = lazy(() => import('./pages/Console'));
const Janela = lazy(() => import('./pages/Janela'));
const Projection = lazy(() => import('./pages/Projection'));
const LyricProjection = lazy(() => import('./pages/LyricProjection'));
const StageView = lazy(() => import('./pages/StageView'));
const VideoProjection = lazy(() => import('./pages/VideoProjection'));
const CommunicationProjection = lazy(() => import('./pages/CommunicationProjection'));
const PastorView = lazy(() => import('./pages/PastorView'));
const StreamView = lazy(() => import('./pages/StreamView'));
const RemoteView = lazy(() => import('./pages/RemoteView'));
const NetworkHome = lazy(() => import('@/components/network/NetworkHome'));

const BLACK = <div className="fixed inset-0 bg-black" />;
const GROUND = <div className="fixed inset-0" style={{ background: 'var(--bg-0)' }} />;
const page = (Page, fallback, props) => <Suspense fallback={fallback}><Page {...props} /></Suspense>;

// The screens every output shows (the projector, the stage, the video
// screens…): opened by the console or the main process on this computer,
// and by tablets and TVs on the church network (electron/lan.cjs serves only
// these, NETWORK_SCREENS).
const screens = (
  <>
    <Route path="/Projection" element={page(Projection, BLACK)} />
    <Route path="/LyricProjection" element={page(LyricProjection, BLACK)} />
    <Route path="/StageView" element={page(StageView, BLACK)} />
    <Route path="/VideoProjection" element={page(VideoProjection, BLACK)} />
    <Route path="/CommunicationProjection" element={page(CommunicationProjection, BLACK)} />
    <Route path="/PastorView" element={page(PastorView, BLACK)} />
    <Route path="/StreamView" element={page(StreamView, null)} />
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
// A detached page (/Janela) names its own window after the page it shows.
function WindowTitle() {
  const { pathname } = useLocation();
  return pathname === '/Janela' || pathname === '/Editor' ? null : <ScreenTitle pathname={pathname} />;
}
function ScreenTitle({ pathname }) {
  useWindowTitle(pathname === '/Remote' ? 'Controle remoto' : TITLED.has(pathname) ? outputMeta(pathname).name : '');
  return null;
}

// An output's whole document keeps its colours under a Windows contrast
// theme (forced-color-adjust, screen.css): the congregation never sees this
// computer's accessibility settings. Before the first paint, so the black
// fallback is never repainted either.
function OutputDocument() {
  const { pathname } = useLocation();
  const output = TITLED.has(pathname);
  useLayoutEffect(() => { document.documentElement.classList.toggle('ks-output-doc', output); }, [output]);
  return null;
}

// Development only: the network start page in the browser preview, with the
// screens electron/lan.cjs lists (NETWORK_SCREENS), to check its layout.
const PREVIEW_SCREENS = [
  { path: '/Projection', label: OUTPUT_NAMES['/Projection'], hint: 'O mesmo que o projetor: letras, Bíblia, mídia e avisos' },
  { path: '/LyricProjection', label: OUTPUT_NAMES['/LyricProjection'], hint: 'Tablet ou TV com a letra da música' },
  { path: '/StageView', label: OUTPUT_NAMES['/StageView'], hint: 'Monitor do palco: letra atual, próxima e relógio' },
  { path: '/VideoProjection', label: OUTPUT_NAMES['/VideoProjection'], hint: 'Recebe os vídeos enviados pelo operador' },
  { path: '/CommunicationProjection', label: OUTPUT_NAMES['/CommunicationProjection'], hint: 'Contagens regressivas e avisos' },
  { path: '/PastorView', label: OUTPUT_NAMES['/PastorView'], hint: 'O que está projetado, relógio e tempo do culto' },
  { path: '/StreamView', label: OUTPUT_NAMES['/StreamView'], hint: 'Legenda para a live: no OBS, Fonte de navegador 1920 × 1080, fundo transparente' },
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
        <OutputDocument />
        <ErrorBoundary>
          {keryx.isNetworkScreen ? (
            <>
              <NetworkStatus />
              <Routes>
                {screens}
                {/* The phone that conducts the service: the network server
                    serves it only while it is on, behind its own code. */}
                <Route path="/Remote" element={page(RemoteView, GROUND)} />
                <Route path="*" element={page(NetworkHome, GROUND)} />
              </Routes>
            </>
          ) : (
            <Routes>
              <Route path="/Console" element={page(Console, GROUND)} />
              {/* A page of the console's window, detached ("Destacar em
                  janela", src/pages/Janela.jsx); /Editor is the old detached
                  Editor de temas e telas, which lands there too. Never a
                  network screen (lan.cjs serves only NETWORK_SCREENS, so it
                  stays off the network). */}
              <Route path="/Janela" element={page(Janela, GROUND)} />
              <Route path="/Editor" element={page(Janela, GROUND)} />
              {screens}
              {import.meta.env.DEV && keryx.isPreview && <Route path="/Rede" element={page(NetworkHome, GROUND, { screens: PREVIEW_SCREENS })} />}
              {import.meta.env.DEV && keryx.isPreview && <Route path="/Remote" element={page(RemoteView, GROUND)} />}
              <Route path="*" element={<Navigate to="/Console" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </Router>
    </QueryClientProvider>
  )
}

export default App
