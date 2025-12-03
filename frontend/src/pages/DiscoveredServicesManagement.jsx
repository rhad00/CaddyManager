import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { get, post, del } from '../utils/api';

const DiscoveredServicesManagement = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [status, setStatus] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const { token, csrfToken } = useAuth();

  const fetchServices = async () => {
    try {
      setLoading(true);
      const endpoint = filterStatus === 'all'
        ? '/discovery'
        : `/discovery?status=${filterStatus}`;
      const response = await get(endpoint, token);

      if (!response.ok) {
        throw new Error('Failed to fetch discovered services');
      }

      const data = await response.json();
      setServices(data.services || []);
    } catch (error) {
      console.error('Error fetching discovered services:', error);
      setError('Failed to load discovered services. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await get('/discovery/status', token);

      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterStatus]);

  const handleScan = async () => {
    try {
      setActionInProgress(true);
      setActionMessage('Scanning for containers...');

      const response = await post('/discovery/scan', {}, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to trigger scan');
      }

      const data = await response.json();
      setActionMessage(data.message || 'Scan completed successfully');
      fetchServices();
    } catch (error) {
      console.error('Error triggering scan:', error);
      setError('Failed to trigger scan. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleSync = async (serviceId) => {
    try {
      setActionInProgress(true);
      setActionMessage('Syncing service...');

      const response = await post(`/discovery/${serviceId}/sync`, {}, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to sync service');
      }

      setActionMessage('Service synced successfully');
      fetchServices();
    } catch (error) {
      console.error('Error syncing service:', error);
      setError('Failed to sync service. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleDisable = async (serviceId) => {
    try {
      setActionInProgress(true);
      setActionMessage('Disabling auto-management...');

      const response = await post(`/discovery/${serviceId}/disable`, {}, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to disable auto-management');
      }

      setActionMessage('Auto-management disabled');
      fetchServices();
    } catch (error) {
      console.error('Error disabling auto-management:', error);
      setError('Failed to disable auto-management. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleEnable = async (serviceId) => {
    try {
      setActionInProgress(true);
      setActionMessage('Enabling auto-management...');

      const response = await post(`/discovery/${serviceId}/enable`, {}, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to enable auto-management');
      }

      setActionMessage('Auto-management enabled');
      fetchServices();
    } catch (error) {
      console.error('Error enabling auto-management:', error);
      setError('Failed to enable auto-management. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this discovered service? This will not delete the associated proxy unless you choose to.')) {
      return;
    }

    try {
      setActionInProgress(true);
      setActionMessage('Deleting service...');

      const response = await del(`/discovery/${serviceId}`, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to delete service');
      }

      setActionMessage('Service deleted successfully');
      fetchServices();
    } catch (error) {
      console.error('Error deleting service:', error);
      setError('Failed to delete service. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusBadgeColor = (serviceStatus) => {
    switch (serviceStatus) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-yellow-100 text-yellow-800';
      case 'removed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceTypeBadgeColor = (sourceType) => {
    switch (sourceType) {
      case 'docker':
        return 'bg-blue-100 text-blue-800';
      case 'kubernetes':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discovered Services</h1>
          {status && (
            <p className="mt-1 text-sm text-gray-600">
              {status.initialized ? (
                status.watching ? (
                  <span className="text-green-600">Discovery service is active</span>
                ) : (
                  <span className="text-yellow-600">Discovery service initialized but not watching</span>
                )
              ) : (
                <span className="text-gray-600">Discovery service not enabled</span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={actionInProgress || !status?.initialized}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {actionInProgress ? 'Processing...' : 'Scan Containers'}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 rounded-md p-4">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm">{actionMessage}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Status
        </label>
        <select
          id="statusFilter"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="all">All Services</option>
          <option value="active">Active</option>
          <option value="stopped">Stopped</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Auto-Discovered Services
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Services automatically discovered from Docker containers and Kubernetes services.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading discovered services...</div>
          </div>
        ) : (
          <div className="border-t border-gray-200">
            {services.length === 0 ? (
              <div className="px-6 py-4 text-center text-gray-500">
                {!status?.initialized ? (
                  <div>
                    <p className="mb-2">Docker discovery is not enabled.</p>
                    <p className="text-sm">Enable it by setting ENABLE_DOCKER_DISCOVERY=true in your environment variables.</p>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2">No discovered services found.</p>
                    <p className="text-sm">Start a container with the label caddymanager.enable=true to get started.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Service Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Domain
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Upstream
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SSL Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Template
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Auto-Managed
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Seen
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {services.map((service) => (
                      <tr key={service.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSourceTypeBadgeColor(service.source_type)}`}>
                            {service.source_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {service.source_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.domain}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.upstream_url}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.ssl_type || 'none'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.template_name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(service.status)}`}>
                            {service.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {service.auto_managed ? (
                            <span className="text-green-600">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(service.last_seen)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleSync(service.id)}
                              disabled={actionInProgress || service.status === 'removed'}
                              className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Manually sync from container"
                            >
                              Sync
                            </button>
                            {service.auto_managed ? (
                              <button
                                onClick={() => handleDisable(service.id)}
                                disabled={actionInProgress}
                                className="text-yellow-600 hover:text-yellow-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Disable auto-management"
                              >
                                Disable
                              </button>
                            ) : (
                              <button
                                onClick={() => handleEnable(service.id)}
                                disabled={actionInProgress}
                                className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Enable auto-management"
                              >
                                Enable
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(service.id)}
                              disabled={actionInProgress}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete discovered service record"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {!status?.initialized && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Docker Discovery Setup</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p className="mb-2">To enable Docker discovery, add the following to your environment:</p>
                <pre className="bg-blue-100 p-2 rounded text-xs overflow-x-auto">
                  ENABLE_DOCKER_DISCOVERY=true
                </pre>
                <p className="mt-2">Then restart the backend service.</p>
                <p className="mt-2">To auto-discover containers, add labels to your Docker containers:</p>
                <pre className="bg-blue-100 p-2 rounded text-xs overflow-x-auto mt-1">
{`caddymanager.enable=true
caddymanager.domain=api.example.com
caddymanager.port=3000
caddymanager.ssl=cloudflare|acme|none`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveredServicesManagement;
