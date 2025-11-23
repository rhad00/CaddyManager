import React from 'react';
import { useAuth } from '../context/AuthContext';
import ProxyManagement from './ProxyManagement';
import TemplateManagement from './TemplateManagement';
import BackupManagement from './BackupManagement';
import MetricsDashboard from './MetricsDashboard';
import AuditLogViewer from './AuditLogViewer';

const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  const [activeTab, setActiveTab] = React.useState('proxies');

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-indigo-600">CaddyManager</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => setActiveTab('proxies')}
                  className={`${
                    activeTab === 'proxies'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Proxies
                </button>
                <button
                  onClick={() => setActiveTab('templates')}
                  className={`${
                    activeTab === 'templates'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Templates
                </button>
                <button
                  onClick={() => setActiveTab('backups')}
                  className={`${
                    activeTab === 'backups'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Backup & Restore
                </button>
                <button
                  onClick={() => setActiveTab('metrics')}
                  className={`${
                    activeTab === 'metrics'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Metrics
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`${
                    activeTab === 'audit'
                      ? 'border-indigo-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Audit Logs
                </button>
              </div>
            </div>
            <div className="flex items-center">
              <div className="ml-3 relative">
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-700">
                    {currentUser?.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="py-10">
        <main>
          {activeTab === 'proxies' && <ProxyManagement />}
          {activeTab === 'templates' && <TemplateManagement />}
          {activeTab === 'backups' && <BackupManagement />}
          {activeTab === 'metrics' && <MetricsDashboard />}
          {activeTab === 'audit' && <AuditLogViewer />}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
