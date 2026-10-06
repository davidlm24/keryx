import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import PageTransition from '@/components/PageTransition';
import ErrorBoundary from '@/components/ErrorBoundary';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

import BannerProjection from './pages/BannerProjection';
import SongHistoryPage from './pages/SongHistoryPage';
import StageView from './pages/StageView';
import BibleSchool from './pages/BibleSchool';
import PastorView from './pages/PastorView';
import ProjectionManager from './pages/ProjectionManager';
import OperatorPanel from './pages/OperatorPanel';
import DeviceView from './pages/DeviceView';
import BibleMaterialProjection from './pages/BibleMaterialProjection';
import LyricProjection from './pages/LyricProjection';
import GlobalSearch from './pages/GlobalSearch';
import Analytics from './pages/Analytics';
import AnnouncementCarouselPage from './pages/AnnouncementCarouselPage';

// Public routes. These render OUTSIDE AuthenticatedApp: that component
// redirects to the login page whenever auth fails, so a /login route nested
// inside it would never render and the redirect would loop.
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}><PageTransition>{children}</PageTransition></Layout>
  : <PageTransition>{children}</PageTransition>;

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <AnimatePresence mode="wait">
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Services/:id" element={
        <LayoutWrapper currentPageName="Services">
          <Pages.Services />
        </LayoutWrapper>
      } />
      <Route path="/BannerProjection" element={<BannerProjection />} />
      <Route path="/StageView" element={<StageView />} />
      <Route path="/SongHistoryPage" element={
        <LayoutWrapper currentPageName="SongHistoryPage">
          <SongHistoryPage />
        </LayoutWrapper>
      } />
      <Route path="/BibleSchool" element={
        <LayoutWrapper currentPageName="BibleSchool">
          <BibleSchool />
        </LayoutWrapper>
      } />
      <Route path="/ProjectionManager" element={
        <LayoutWrapper currentPageName="ProjectionManager">
          <ProjectionManager />
        </LayoutWrapper>
      } />
      <Route path="/OperatorPanel" element={
        <LayoutWrapper currentPageName="OperatorPanel">
          <OperatorPanel />
        </LayoutWrapper>
      } />
      <Route path="/DeviceView" element={<DeviceView />} />
      <Route path="/PastorView" element={<PastorView />} />
      <Route path="/BibleMaterialProjection" element={<BibleMaterialProjection />} />
      <Route path="/LyricProjection" element={<LyricProjection />} />
      <Route path="/GlobalSearch" element={
        <LayoutWrapper currentPageName="GlobalSearch">
          <GlobalSearch />
        </LayoutWrapper>
      } />
      <Route path="/Analytics" element={
        <LayoutWrapper currentPageName="Analytics">
          <Analytics />
        </LayoutWrapper>
      } />
      <Route path="/AnnouncementCarousel" element={<AnnouncementCarouselPage />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </AnimatePresence>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ErrorBoundary>
          <Routes>
            {/* The paths here are the ones the auth pages link to each other
                by, and the ones Base44 custom auth redirects to. Keep them in
                sync with the app's auth settings on the server. */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App