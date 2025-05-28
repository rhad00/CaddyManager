import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ProxyForm = ({ proxy = null, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [sslType, setSslType] = useState('acme');
  const [httpToHttpsRedirect, setHttpToHttpsRedirect] = useState(true);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);
  const [configPreview, setConfigPreview] = useState(null);
  
  const { token, currentUser } = useAuth();
  
  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Load templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch(`${API_URL}/api/templates`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch templates');
        }
        
        const data = await response.json();
        setTemplates(data.templates || []);
      } catch (error) {
        console.error('Error fetching templates:', error);
        setError('Failed to load templates. Please try again later.');
      }
    };
    
    fetchTemplates();
    
    // If editing an existing proxy, populate the form
    if (proxy) {
      setName(proxy.name);
      setDomains(proxy.domains.join(', '));
      setUpstreamUrl(proxy.upstream_url);
      setSslType(proxy.ssl_type);
      setHttpToHttpsRedirect(proxy.http_to_https_redirect);
      setCompressionEnabled(proxy.compression_enabled);
    }
  }, [API_URL, token, proxy]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Validate form
      if (!name || !domains || !upstreamUrl) {
        throw new Error('Please fill in all required fields');
      }
      
      // Parse domains from comma-separated string to array
      const domainsArray = domains.split(',').map(domain => domain.trim()).filter(Boolean);
      
      if (domainsArray.length === 0) {
        throw new Error('Please provide at least one domain');
      }
      
      const proxyData = {
        name,
        domains: domainsArray,
        upstream_url: upstreamUrl,
        ssl_type: sslType,
        http_to_https_redirect: httpToHttpsRedirect,
        compression_enabled: compressionEnabled,
        created_by: currentUser.id
      };
      
      let response;
      
      if (proxy) {
        // Update existing proxy
        response = await fetch(`${API_URL}/api/proxies/${proxy.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(proxyData)
        });
      } else {
        // Create new proxy
        response = await fetch(`${API_URL}/api/proxies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(proxyData)
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save proxy');
      }
      
      const savedProxyData = await response.json();
      
      // If a template was selected, apply it to the proxy
      if (selectedTemplate) {
        const templateResponse = await fetch(`${API_URL}/api/templates/${selectedTemplate}/apply/${savedProxyData.proxy.id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!templateResponse.ok) {
          console.error('Failed to apply template, but proxy was saved');
        } else {
          // Show the configuration changes
          const templateResult = await templateResponse.json();
          if (templateResult.result && templateResult.result.before && templateResult.result.after) {
            setConfigPreview({
              before: templateResult.result.before,
              after: templateResult.result.after
            });
          }
        }
      }
      
      // Only call onSave if there's no config preview to show
      if (!configPreview) {
        onSave(savedProxyData.proxy);
      }
    } catch (error) {
      console.error('Error saving proxy:', error);
      setError(error.message || 'Failed to save proxy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">
          {proxy ? 'Edit Proxy' : 'Create New Proxy'}
        </h3>
        
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
        
        <form className="mt-5 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="My Website"
              required
            />
          </div>
          
          <div>
            <label htmlFor="domains" className="block text-sm font-medium text-gray-700">
              Domains *
            </label>
            <input
              type="text"
              id="domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="example.com, www.example.com"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Comma-separated list of domains
            </p>
          </div>
          
          <div>
            <label htmlFor="upstream_url" className="block text-sm font-medium text-gray-700">
              Upstream URL *
            </label>
            <input
              type="text"
              id="upstream_url"
              value={upstreamUrl}
              onChange={(e) => setUpstreamUrl(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="http://localhost:8080"
              required
            />
          </div>
          
          <div>
            <label htmlFor="ssl_type" className="block text-sm font-medium text-gray-700">
              SSL Type
            </label>
            <select
              id="ssl_type"
              value={sslType}
              onChange={(e) => setSslType(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="acme">Let's Encrypt (ACME)</option>
              <option value="custom">Custom Certificate</option>
              <option value="none">None</option>
            </select>
          </div>
          
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="http_to_https_redirect"
                type="checkbox"
                checked={httpToHttpsRedirect}
                onChange={(e) => setHttpToHttpsRedirect(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="http_to_https_redirect" className="font-medium text-gray-700">
                HTTP to HTTPS Redirect
              </label>
              <p className="text-gray-500">
                Automatically redirect HTTP requests to HTTPS
              </p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="compression_enabled"
                type="checkbox"
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="compression_enabled" className="font-medium text-gray-700">
                Enable Compression
              </label>
              <p className="text-gray-500">
                Compress responses using gzip/zstd
              </p>
            </div>
          </div>
          
          <div>
            <label htmlFor="template" className="block text-sm font-medium text-gray-700">
              Apply Template
            </label>
            <div>
              <select
                id="template"
                value={selectedTemplate}
                onChange={async (e) => {
                  const templateId = e.target.value;
                  setSelectedTemplate(templateId);
                  if (templateId) {
                    try {
                      const response = await fetch(`${API_URL}/api/templates/${templateId}`, {
                        headers: {
                          'Authorization': `Bearer ${token}`
                        }
                      });
                      if (response.ok) {
                        const data = await response.json();
                        setSelectedTemplateDetails(data.template);
                      }
                    } catch (error) {
                      console.error('Error fetching template details:', error);
                    }
                  } else {
                    setSelectedTemplateDetails(null);
                  }
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">None</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Apply a predefined template for common services
              </p>
              
              {selectedTemplateDetails && (
                <div className="mt-4 p-4 bg-gray-50 rounded-md">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Template Configuration Preview:</h4>
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-sm font-medium text-gray-700">Description:</h5>
                      <p className="text-sm text-gray-600">{selectedTemplateDetails.description}</p>
                    </div>
                    {selectedTemplateDetails.headers && selectedTemplateDetails.headers.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700">Headers to be configured:</h5>
                        <div className="mt-2 space-y-2">
                          {selectedTemplateDetails.headers.map((header, index) => (
                            <div key={index} className="text-sm">
                              <span className="font-mono text-indigo-600">{header.header_name}</span>
                              <span className="text-gray-600"> = </span>
                              <span className="font-mono text-green-600">{header.header_value}</span>
                              <span className="text-gray-500 ml-2">({header.header_type})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedTemplateDetails.middleware && selectedTemplateDetails.middleware.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700">Middleware to be applied:</h5>
                        <div className="mt-2 space-y-2">
                          {selectedTemplateDetails.middleware.map((mw, index) => (
                            <div key={index} className="text-sm">
                              <span className="font-medium text-indigo-600">{mw.middleware_type}</span>
                              <span className="text-gray-600 ml-2">
                                {JSON.stringify(mw.configuration)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {configPreview && (
            <div className="mb-6 p-4 bg-gray-50 rounded-md">
              <h4 className="text-sm font-medium text-gray-900 mb-4">Configuration Changes:</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Before:</h5>
                  <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-60">
                    {JSON.stringify(configPreview.before, null, 2)}
                  </pre>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">After:</h5>
                  <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-60">
                    {JSON.stringify(configPreview.after, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            {configPreview ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setConfigPreview(null);
                    onSave(savedProxyData.proxy);
                  }}
                  className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Confirm Changes
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProxyForm;
