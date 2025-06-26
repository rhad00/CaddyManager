import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const ProxyList = ({ onEdit, onCreate }) => {
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token } = useAuth();
  
  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const fetchProxies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/proxies`, {
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
  }, [API_URL, token]);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          Active
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
          Disabled
        </span>
      );
    }
  };

  const getSslBadge = (sslType) => {
    if (sslType === 'acme') {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          Let's Encrypt
        </span>
      );
    } else if (sslType === 'custom') {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
          Custom
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
          None
        </span>
      );
    }
  };

  const handleDelete = async (proxyId) => {
    if (!window.confirm('Are you sure you want to delete this proxy?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/proxies/${proxyId}`, {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading proxies...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4 my-4">
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
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
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
                    <span className="ml-2">{getStatusBadge(proxy.status)}</span>
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
                    {getSslBadge(proxy.ssl_type)}
                  </div>
                    <div className="mt-2 flex space-x-2">
                      <button 
                        onClick={() => onEdit(proxy)}
                        className="px-3 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(proxy.id)}
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
      <div className="px-6 py-4 border-t border-gray-200">
        <button
          onClick={onCreate}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Create New Proxy
        </button>
      </div>
    </div>
  );
};

export default ProxyList;
