import React, { useState } from 'react';
import ProxyList from '../components/ProxyList';
import ProxyForm from '../components/ProxyForm';

const ProxyManagement = () => {
  const [showForm, setShowForm] = useState(false);
  const [currentProxy, setCurrentProxy] = useState(null);

  const handleCreateProxy = () => {
    setCurrentProxy(null);
    setShowForm(true);
  };

  const handleSaveProxy = () => {
    setShowForm(false);
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
      
      {showForm ? (
        <ProxyForm
          proxy={currentProxy}
          onSave={handleSaveProxy}
          onCancel={handleCancelForm}
        />
      ) : (
        <ProxyList 
          onEdit={(proxy) => {
            setCurrentProxy(proxy);
            setShowForm(true);
          }}
          onCreate={handleCreateProxy}
        />
      )}
    </div>
  );
};

export default ProxyManagement;
