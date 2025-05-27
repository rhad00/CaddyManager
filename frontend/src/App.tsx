import { Routes, Route } from 'react-router-dom';
import { WebSocketProvider } from './context/WebSocketContext';
import Layout from './components/layout/Layout';
import ProxyListPage from './pages/proxies/ProxyListPage';
import ProxyForm from './pages/proxies/ProxyForm';
import EditProxyPage from './pages/proxies/EditProxyPage';
import LoginPage from './pages/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { SettingsPage } from './pages/settings/SettingsPage';
import { MonitoringDashboard } from './components/monitoring/MonitoringDashboard';

function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<MonitoringDashboard />} />
            <Route path="proxies" element={<ProxyListPage />} />
            <Route path="proxies/new" element={<ProxyForm />} />
            <Route path="proxies/:id" element={<EditProxyPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<div>404 Not Found</div>} />
          </Route>
        </Route>
      </Routes>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;
