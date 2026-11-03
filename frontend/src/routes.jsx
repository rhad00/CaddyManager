import React from 'react';
import { useAuth } from './context/AuthContext';
import ProxyManagement from './pages/ProxyManagement';
import TemplateManagement from './pages/TemplateManagement';
import BackupManagement from './pages/BackupManagement';
import MetricsDashboard from './pages/MetricsDashboard';
import AuditLogViewer from './pages/AuditLogViewer';
import Users from './pages/Users';
import DiscoveredServicesManagement from './pages/DiscoveredServicesManagement';
import GitIntegration from './pages/GitIntegration';
import LogViewer from './pages/LogViewer';
import AlertManagement from './pages/AlertManagement';
import AccountPage from './pages/AccountPage';

const Narrow = ({ children }) => <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">{children}</div>;

/** Says why a page is closed to this account instead of showing an empty or failing page */
const AdminOnly = ({ what, children }) => {
  const { currentUser } = useAuth();
  if (currentUser?.role === 'admin') return children;
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-lg bg-white p-6 shadow" role="alert">
        <h1 className="text-lg font-semibold text-gray-900">This page is for administrators</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account ({currentUser?.role || 'no role'}) cannot {what}. Ask an administrator to change your role or to do it for you.
        </p>
      </div>
    </div>
  );
};

/** Page of each path in navigation.js */
export const PAGES = {
  '/proxies': <ProxyManagement />,
  '/templates': <TemplateManagement />,
  '/discovery': <DiscoveredServicesManagement />,
  '/metrics': <MetricsDashboard />,
  '/logs': (
    <Narrow>
      <LogViewer />
    </Narrow>
  ),
  '/alerts': (
    <Narrow>
      <AlertManagement />
    </Narrow>
  ),
  '/audit': <AuditLogViewer />,
  '/backups': <BackupManagement />,
  '/git': <GitIntegration />,
  '/settings/account/two-factor': <AccountPage section="two-factor" />,
  '/settings/account/api-keys': <AccountPage section="api-keys" />,
  '/settings/users': (
    <AdminOnly what="manage users">
      <Users />
    </AdminOnly>
  ),
};
