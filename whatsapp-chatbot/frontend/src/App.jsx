import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ConversationsPage from './pages/ConversationsPage';

import DocumentsPage from './pages/DocumentsPage';
import NumberControlPage from './pages/NumberControlPage';
import HolidaysPage from './pages/HolidaysPage';
import QuickRepliesPage from './pages/QuickRepliesPage';
import WelcomePage from './pages/WelcomePage';
import SettingsPage from './pages/SettingsPage';
import StatisticsPage from './pages/StatisticsPage';
import StatusesPage from './pages/StatusesPage';
import AIRulesPage from './pages/AIRulesPage';
import BulkMessagesPage from './pages/BulkMessagesPage';
import CalendarPage from './pages/CalendarPage'; // ✅ NUEVO: Página de calendario
import './styles/global.css';

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
          <Route path="/conversations" element={<ErrorBoundary><ConversationsPage /></ErrorBoundary>} />

          <Route path="/documents" element={<ErrorBoundary><DocumentsPage /></ErrorBoundary>} />
          <Route path="/number-control" element={<ErrorBoundary><NumberControlPage /></ErrorBoundary>} />
          <Route path="/holidays" element={<ErrorBoundary><HolidaysPage /></ErrorBoundary>} />
          <Route path="/quick-replies" element={<ErrorBoundary><QuickRepliesPage /></ErrorBoundary>} />
          <Route path="/welcome" element={<ErrorBoundary><WelcomePage /></ErrorBoundary>} />
          <Route path="/statistics" element={<ErrorBoundary><StatisticsPage /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          <Route path="/statuses" element={<ErrorBoundary><StatusesPage /></ErrorBoundary>} />
          <Route path="/ai-rules" element={<ErrorBoundary><AIRulesPage /></ErrorBoundary>} />
          <Route path="/bulk-messages" element={<ErrorBoundary><BulkMessagesPage /></ErrorBoundary>} />
          <Route path="/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
