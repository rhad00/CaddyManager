import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ProxyForm = ({ proxy = null, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [sslType, setSslType] = useState('acme');
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);
  const [configPreview, setConfigPreview] = useState(null);
  const [securityHeadersEnabled, setSecurityHeadersEnabled] = useState(false);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(false);
  const [requestsPerSecond, setRequestsPerSecond] = useState(10);
  const [rateLimitBurst, setRateLimitBurst] = useState(20);
  const [ipFilteringEnabled, setIpFilteringEnabled] = useState(false);
  const [ipFilteringMode, setIpFilteringMode] = useState('block');
  const [ipList, setIpList] = useState('');
  const [basicAuthEnabled, setBasicAuthEnabled] = useState(false);
  const [basicAuthUsername, setBasicAuthUsername] = useState('');
  const [basicAuthPassword, setBasicAuthPassword] = useState('');
  const [pathRoutingEnabled, setPathRoutingEnabled] = useState(false);
  const [pathRoutes, setPathRoutes] = useState([{ path: '', upstream_url: '' }]);
  
  const { token, currentUser } = useAuth();
  
  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Load templates on component mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch(`${API_URL}/templates`, {
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
      setCompressionEnabled(proxy.compression_enabled);
      setSecurityHeadersEnabled(proxy.security_headers_enabled);

      // Populate rate limiting fields
      if (proxy.rate_limit) {
        setRateLimitEnabled(proxy.rate_limit.enabled);
        setRequestsPerSecond(proxy.rate_limit.requests_per_second);
        setRateLimitBurst(proxy.rate_limit.burst);
      }

      // Populate IP filtering fields
      if (proxy.ip_filtering) {
        setIpFilteringEnabled(proxy.ip_filtering.enabled);
        setIpFilteringMode(proxy.ip_filtering.mode);
        setIpList(proxy.ip_filtering.ip_list.join('\n'));
      }

      // Populate basic auth fields
      if (proxy.basic_auth) {
        setBasicAuthEnabled(proxy.basic_auth.enabled);
        setBasicAuthUsername(proxy.basic_auth.username);
        // Note: Password is not populated for security reasons
      }

      // Populate path routing fields
      if (proxy.path_routing) {
        setPathRoutingEnabled(proxy.path_routing.enabled);
        setPathRoutes(proxy.path_routing.routes.length > 0 
          ? proxy.path_routing.routes 
          : [{ path: '', upstream_url: '' }]
        );
      }
    }
  }, [API_URL, token, proxy]);

  const [savedProxyData, setSavedProxyData] = useState(null);

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
        compression_enabled: compressionEnabled,
        security_headers_enabled: securityHeadersEnabled,
        rate_limit: rateLimitEnabled ? {
          enabled: true,
          requests_per_second: parseInt(requestsPerSecond),
          burst: parseInt(rateLimitBurst)
        } : null,
        ip_filtering: ipFilteringEnabled ? {
          enabled: true,
          mode: ipFilteringMode,
          ip_list: ipList.split('\n').map(ip => ip.trim()).filter(Boolean)
        } : null,
        basic_auth: basicAuthEnabled ? {
          enabled: true,
          username: basicAuthUsername,
          password: basicAuthPassword // Will be hashed on the backend
        } : null,
        path_routing: pathRoutingEnabled ? {
          enabled: true,
          routes: pathRoutes.filter(route => route.path && route.upstream_url)
        } : null,
        created_by: currentUser.id
      };
      
      let response;
      
      if (proxy) {
        // Update existing proxy
        response = await fetch(`${API_URL}/proxies/${proxy.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(proxyData)
        });
      } else {
        // Create new proxy
        response = await fetch(`${API_URL}/proxies`, {
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
      
      const responseData = await response.json();
      setSavedProxyData(responseData);
      
      // If a template was selected, apply it to the proxy
      if (selectedTemplate) {
        const templateResponse = await fetch(`${API_URL}/templates/${selectedTemplate}/apply/${responseData.proxy.id}`, {
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
        onSave(responseData.proxy);
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
              placeholder="My proxy name"
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
              Upstream Server *
            </label>
            <input
              type="text"
              id="upstream_url"
              value={upstreamUrl}
              onChange={(e) => setUpstreamUrl(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="localhost:8080 or server:80 or server:443"
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

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="security_headers_enabled"
                type="checkbox"
                checked={securityHeadersEnabled}
                onChange={(e) => setSecurityHeadersEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="security_headers_enabled" className="font-medium text-gray-700">
                Enable Security Headers
              </label>
              <p className="text-gray-500">
                Add recommended security headers:
              </p>
              <ul className="mt-2 text-xs text-gray-500 space-y-1 list-disc list-inside">
                <li>Strict-Transport-Security (HSTS): max-age=31536000; includeSubDomains; preload</li>
                <li>X-Content-Type-Options: nosniff</li>
                <li>X-Frame-Options: SAMEORIGIN</li>
                <li>Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';</li>
                <li>Referrer-Policy: strict-origin-when-cross-origin</li>
                <li>Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()</li>
              </ul>
            </div>
          </div>

          {/* Rate Limiting Section */}
          <div className="flex items-start mb-4">
            <div className="flex items-center h-5">
              <input
                id="rate_limit_enabled"
                type="checkbox"
                checked={rateLimitEnabled}
                onChange={(e) => setRateLimitEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm flex-grow">
              <label htmlFor="rate_limit_enabled" className="font-medium text-gray-700">
                Enable Rate Limiting
              </label>
              {rateLimitEnabled && (
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600">Requests per second</label>
                    <input
                      type="number"
                      value={requestsPerSecond}
                      onChange={(e) => setRequestsPerSecond(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Burst</label>
                    <input
                      type="number"
                      value={rateLimitBurst}
                      onChange={(e) => setRateLimitBurst(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      min="1"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* IP Filtering Section */}
          <div className="flex items-start mb-4">
            <div className="flex items-center h-5">
              <input
                id="ip_filtering_enabled"
                type="checkbox"
                checked={ipFilteringEnabled}
                onChange={(e) => setIpFilteringEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm flex-grow">
              <label htmlFor="ip_filtering_enabled" className="font-medium text-gray-700">
                Enable IP Filtering
              </label>
              {ipFilteringEnabled && (
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600">Mode</label>
                    <select
                      value={ipFilteringMode}
                      onChange={(e) => setIpFilteringMode(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="block">Block List</option>
                      <option value="allow">Allow List</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">IP Addresses (one per line)</label>
                    <textarea
                      value={ipList}
                      onChange={(e) => setIpList(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      rows="4"
                      placeholder="192.168.1.1&#10;10.0.0.0/24"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Basic Authentication Section */}
          <div className="flex items-start mb-4">
            <div className="flex items-center h-5">
              <input
                id="basic_auth_enabled"
                type="checkbox"
                checked={basicAuthEnabled}
                onChange={(e) => setBasicAuthEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm flex-grow">
              <label htmlFor="basic_auth_enabled" className="font-medium text-gray-700">
                Enable Basic Authentication
              </label>
              {basicAuthEnabled && (
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600">Username</label>
                    <input
                      type="text"
                      value={basicAuthUsername}
                      onChange={(e) => setBasicAuthUsername(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Password</label>
                    <input
                      type="password"
                      value={basicAuthPassword}
                      onChange={(e) => setBasicAuthPassword(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Path-based Routing Section */}
          <div className="flex items-start mb-4">
            <div className="flex items-center h-5">
              <input
                id="path_routing_enabled"
                type="checkbox"
                checked={pathRoutingEnabled}
                onChange={(e) => setPathRoutingEnabled(e.target.checked)}
                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm flex-grow">
              <label htmlFor="path_routing_enabled" className="font-medium text-gray-700">
                Enable Path-based Routing
              </label>
              {pathRoutingEnabled && (
                <div className="mt-2 space-y-3">
                  {pathRoutes.map((route, index) => (
                    <div key={index} className="p-3 border border-gray-200 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Route {index + 1}</span>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newRoutes = [...pathRoutes];
                              newRoutes.splice(index, 1);
                              setPathRoutes(newRoutes);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-sm text-gray-600">Path</label>
                          <input
                            type="text"
                            value={route.path}
                            onChange={(e) => {
                              const newRoutes = [...pathRoutes];
                              newRoutes[index].path = e.target.value;
                              setPathRoutes(newRoutes);
                            }}
                            placeholder="/api/*"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Upstream URL</label>
                          <input
                            type="text"
                            value={route.upstream_url}
                            onChange={(e) => {
                              const newRoutes = [...pathRoutes];
                              newRoutes[index].upstream_url = e.target.value;
                              setPathRoutes(newRoutes);
                            }}
                            placeholder="localhost:8080"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPathRoutes([...pathRoutes, { path: '', upstream_url: '' }])}
                    className="mt-2 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Add Route
                  </button>
                </div>
              )}
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
                      const response = await fetch(`${API_URL}/templates/${templateId}`, {
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
