import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ProxyList from '../components/ProxyList';
import ProxyForm from '../components/ProxyForm';

const ProxyManagement = () => {
  const [showForm, setShowForm] = useState(false);
  const [currentProxy, setCurrentProxy] = useState(null);
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token } = useAuth();
  
  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const fetchProxies = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/proxies`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch proxies');
      }
      
      const data = await response.json();
      setProxies(data.proxies || []);
    } catch (error) {
      console.error('Error fetching proxies:', error);
      setError('Failed to load proxies. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProxies();
  }, [API_URL, token]);

  const handleCreateProxy = () => {
    setCurrentProxy(null);
    setShowForm(true);
  };

  const handleEditProxy = (proxy) => {
    setCurrentProxy(proxy);
    setShowForm(true);
  };

  const handleDeleteProxy = async (proxyId) => {
    if (!window.confirm('Are you sure you want to delete this proxy?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/proxies/${proxyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete proxy');
      }
      
      // Refresh the proxy list
      fetchProxies();
    } catch (error) {
      console.error('Error deleting proxy:', error);
      setError('Failed to delete proxy. Please try again later.');
    }
  };

  const handleSaveProxy = async (proxy) => {
    setShowForm(false);
    // Refresh the proxy list
    fetchProxies();
  };

  const handleCancelForm = () => {
    setShowForm(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proxy Management</h1>
        {!showForm && (
          <button
            onClick={handleCreateProxy}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Create New Proxy
          </button>
        )}
      </div>
      
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
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
      
      {showForm ? (
        <ProxyForm
          proxy={currentProxy}
          onSave={handleSaveProxy}
          onCancel={handleCancelForm}
        />
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500">Loading proxies...</div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {proxies.length === 0 ? (
                <li className="px-6 py-4 text-center text-gray-500">
                  No proxies found. Create your first proxy to get started.
                </li>
              ) : (
                proxies.map((proxy) => (
                  <li key={proxy.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="text-lg font-medium text-indigo-600">{proxy.name}</span>
                          <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                            proxy.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {proxy.status === 'active' ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          {proxy.domains.join(', ')}
                        </div>
                        <div className="mt-2 flex items-center text-sm text-gray-500">
                          <span className="mr-2">Upstream:</span>
                          <code className="px-2 py-1 bg-gray-100 rounded">{proxy.upstream_url}</code>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center space-x-2">
                          <span>SSL:</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            proxy.ssl_type === 'acme'
                              ? 'bg-blue-100 text-blue-800'
                              : proxy.ssl_type === 'custom'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}>
                            {proxy.ssl_type === 'acme' 
                              ? "Let's Encrypt" 
                              : proxy.ssl_type === 'custom' 
                                ? 'Custom' 
                                : 'None'}
                          </span>
                        </div>
                        <div className="mt-2 flex space-x-2">
                          <button 
                            onClick={() => handleEditProxy(proxy)}
                            className="px-3 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteProxy(proxy.id)}
                            className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-800 hover:bg-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ProxyManagement;
