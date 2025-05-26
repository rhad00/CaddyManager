import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProxyListPage from './pages/proxies/ProxyListPage';
import ProxyForm from './pages/proxies/ProxyForm';
import EditProxyPage from './pages/proxies/EditProxyPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<div>Dashboard</div>} />
        <Route path="proxies" element={<ProxyListPage />} />
        <Route path="proxies/new" element={<ProxyForm />} />
        <Route path="proxies/:id" element={<EditProxyPage />} />
        <Route path="settings" element={<div>Settings</div>} />
        <Route path="*" element={<div>404 Not Found</div>} />
      </Route>
    </Routes>
  );
}

export default App;
