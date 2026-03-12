import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { get } from '../utils/api';
import TemplateCreator from '../components/TemplateCreator';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const TemplateManagement = () => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showCreator, setShowCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token, csrfToken, currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await get('/templates', token);
      
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setError('Failed to load templates. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleViewTemplate = (template) => {
    setSelectedTemplate(template);
    setShowCreator(false);
    setEditingTemplate(null);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setSelectedTemplate(null);
    setShowCreator(false);
  };

  const handleDelete = async (template) => {
    if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_URL}/templates/${template.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'x-csrf-token': csrfToken },
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (err) { toast.error(err.message); }
  };

  const handleSaved = () => {
    setShowCreator(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Service Templates</h1>
        {isAdmin && !showCreator && !editingTemplate && (
          <button onClick={() => { setShowCreator(true); setSelectedTemplate(null); setEditingTemplate(null); }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700">
            + Create Template
          </button>
        )}
      </div>
      
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Template Creator / Editor */}
      {(showCreator || editingTemplate) && isAdmin && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {editingTemplate ? `Edit: ${editingTemplate.name}` : 'Create New Template'}
          </h2>
          <TemplateCreator
            initial={editingTemplate}
            onSave={handleSaved}
            onCancel={() => { setShowCreator(false); setEditingTemplate(null); }}
          />
        </div>
      )}
      
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Available Templates
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Predefined templates for common services with proper headers and middleware configurations.
          </p>
        </div>
        
        {selectedTemplate ? (
          <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-medium text-indigo-600">{selectedTemplate.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{selectedTemplate.description}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <button onClick={() => handleEdit(selectedTemplate)}
                    className="px-3 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
                    Edit
                  </button>
                )}
                <button onClick={() => setSelectedTemplate(null)}
                  className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 hover:bg-gray-200">
                  Back to List
                </button>
              </div>
            </div>
            
            <div className="mt-6">
              <h4 className="text-md font-medium text-gray-900">Headers</h4>
              {selectedTemplate.headers.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">No headers defined in this template.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedTemplate.headers.map((header, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              header.header_type === 'request' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {header.header_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{header.header_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{header.header_value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="mt-6">
              <h4 className="text-md font-medium text-gray-900">Middleware</h4>
              {selectedTemplate.middleware.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">No middleware defined in this template.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Configuration</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedTemplate.middleware.map((middleware, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{middleware.middleware_type}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{middleware.order || 0}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                              {JSON.stringify(middleware.configuration, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-200">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-gray-500">Loading templates...</div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {templates.length === 0 ? (
                  <li className="px-6 py-4 text-center text-gray-500">
                    No templates found.
                  </li>
                ) : (
                  templates.map((template) => (
                    <li key={template.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <div className="flex items-center">
                            <span className="text-lg font-medium text-indigo-600">{template.name}</span>
                          </div>
                          <div className="mt-1 text-sm text-gray-500">{template.description}</div>
                          <div className="mt-2 flex items-center text-sm text-gray-500">
                            <span className="mr-2">Headers:</span>
                            <span className="px-2 py-1 bg-gray-100 rounded">{template.headers.length}</span>
                            <span className="mx-2">Middleware:</span>
                            <span className="px-2 py-1 bg-gray-100 rounded">{template.middleware.length}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleViewTemplate(template)}
                            className="px-3 py-1 text-xs font-medium rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
                            View Details
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => handleEdit(template)}
                                className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800 hover:bg-gray-200">
                                Edit
                              </button>
                              <button onClick={() => handleDelete(template)}
                                className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200">
                                Delete
                              </button>
                            </>
                          )}
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
    </div>
  );
};

export default TemplateManagement;

