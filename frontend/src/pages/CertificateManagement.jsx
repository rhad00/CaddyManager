import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { format, parseISO, differenceInDays } from 'date-fns';

const CertificateManagement = () => {
  const [activeTab, setActiveTab] = useState('certificates');
  const [certificates, setCertificates] = useState([]);
  const [cas, setCAs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [selectedCA, setSelectedCA] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [showAddCAForm, setShowAddCAForm] = useState(false);
  const { token } = useAuth();
  
  // API URL from environment
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Form states
  const [uploadForm, setUploadForm] = useState({
    name: '',
    domains: '',
    certificate: null,
    privateKey: null
  });
  
  const [generateForm, setGenerateForm] = useState({
    name: '',
    domains: '',
    validityDays: 365
  });
  
  const [caForm, setCAForm] = useState({
    name: '',
    type: 'acme',
    url: '',
    email: '',
    certificate: null,
    trusted: false
  });

  // Fetch certificates
  const fetchCertificates = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/certificates`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch certificates');
      }
      
      const data = await response.json();
      setCertificates(data.certificates);
      setError(null);
    } catch (error) {
      console.error('Error fetching certificates:', error);
      setError('Failed to load certificates. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch certificate authorities
  const fetchCAs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/certificates/cas`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch certificate authorities');
      }
      
      const data = await response.json();
      setCAs(data.cas);
      setError(null);
    } catch (error) {
      console.error('Error fetching CAs:', error);
      setError('Failed to load certificate authorities. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (activeTab === 'certificates') {
      fetchCertificates();
    } else if (activeTab === 'cas') {
      fetchCAs();
    }
  }, [activeTab, API_URL, token]);

  // Handle certificate selection
  const handleCertificateSelect = (certificate) => {
    setSelectedCertificate(certificate);
    setSelectedCA(null);
  };

  // Handle CA selection
  const handleCASelect = (ca) => {
    setSelectedCA(ca);
    setSelectedCertificate(null);
  };

  // Handle certificate deletion
  const handleDeleteCertificate = async (id) => {
    if (!confirm('Are you sure you want to delete this certificate?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/certificates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete certificate');
      }
      
      // Refresh certificates
      fetchCertificates();
      
      // Clear selection if the deleted certificate was selected
      if (selectedCertificate && selectedCertificate.id === id) {
        setSelectedCertificate(null);
      }
    } catch (error) {
      console.error('Error deleting certificate:', error);
      setError('Failed to delete certificate. Please try again later.');
    }
  };

  // Handle CA deletion
  const handleDeleteCA = async (id) => {
    if (!confirm('Are you sure you want to delete this certificate authority?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/certificates/cas/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete certificate authority');
      }
      
      // Refresh CAs
      fetchCAs();
      
      // Clear selection if the deleted CA was selected
      if (selectedCA && selectedCA.id === id) {
        setSelectedCA(null);
      }
    } catch (error) {
      console.error('Error deleting CA:', error);
      setError('Failed to delete certificate authority. Please try again later.');
    }
  };

  // Handle certificate renewal
  const handleRenewCertificate = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/certificates/${id}/renew`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to renew certificate');
      }
      
      // Refresh certificates
      fetchCertificates();
    } catch (error) {
      console.error('Error renewing certificate:', error);
      setError('Failed to renew certificate. Please try again later.');
    }
  };

  // Handle CA trust update
  const handleUpdateCATrust = async (id, trusted) => {
    try {
      const response = await fetch(`${API_URL}/api/certificates/cas/${id}/trust`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trusted })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update CA trust status');
      }
      
      // Refresh CAs
      fetchCAs();
    } catch (error) {
      console.error('Error updating CA trust:', error);
      setError('Failed to update CA trust status. Please try again later.');
    }
  };

  // Handle upload form submission
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    
    if (!uploadForm.name || !uploadForm.domains || !uploadForm.certificate || !uploadForm.privateKey) {
      setError('All fields are required');
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('name', uploadForm.name);
      formData.append('domains', uploadForm.domains);
      formData.append('certificate', uploadForm.certificate);
      formData.append('privateKey', uploadForm.privateKey);
      
      const response = await fetch(`${API_URL}/api/certificates/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload certificate');
      }
      
      // Reset form and hide it
      setUploadForm({
        name: '',
        domains: '',
        certificate: null,
        privateKey: null
      });
      setShowUploadForm(false);
      
      // Refresh certificates
      fetchCertificates();
    } catch (error) {
      console.error('Error uploading certificate:', error);
      setError('Failed to upload certificate. Please try again later.');
    }
  };

  // Handle generate form submission
  const handleGenerateSubmit = async (e) => {
    e.preventDefault();
    
    if (!generateForm.name || !generateForm.domains) {
      setError('Name and domains are required');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/certificates/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(generateForm)
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate certificate');
      }
      
      // Reset form and hide it
      setGenerateForm({
        name: '',
        domains: '',
        validityDays: 365
      });
      setShowGenerateForm(false);
      
      // Refresh certificates
      fetchCertificates();
    } catch (error) {
      console.error('Error generating certificate:', error);
      setError('Failed to generate certificate. Please try again later.');
    }
  };

  // Handle CA form submission
  const handleCASubmit = async (e) => {
    e.preventDefault();
    
    if (!caForm.name || !caForm.type) {
      setError('Name and type are required');
      return;
    }
    
    if (caForm.type === 'acme' && !caForm.url) {
      setError('URL is required for ACME certificate authorities');
      return;
    }
    
    if (caForm.type === 'custom' && !caForm.certificate) {
      setError('Certificate is required for custom certificate authorities');
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('name', caForm.name);
      formData.append('type', caForm.type);
      
      if (caForm.url) {
        formData.append('url', caForm.url);
      }
      
      if (caForm.email) {
        formData.append('email', caForm.email);
      }
      
      if (caForm.certificate) {
        formData.append('certificate', caForm.certificate);
      }
      
      formData.append('trusted', caForm.trusted);
      
      const response = await fetch(`${API_URL}/api/certificates/cas`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to add certificate authority');
      }
      
      // Reset form and hide it
      setCAForm({
        name: '',
        type: 'acme',
        url: '',
        email: '',
        certificate: null,
        trusted: false
      });
      setShowAddCAForm(false);
      
      // Refresh CAs
      fetchCAs();
    } catch (error) {
      console.error('Error adding CA:', error);
      setError('Failed to add certificate authority. Please try again later.');
    }
  };

  // Calculate days until expiration
  const getDaysUntilExpiration = (validTo) => {
    const expirationDate = parseISO(validTo);
    return differenceInDays(expirationDate, new Date());
  };

  // Get status class based on days until expiration
  const getStatusClass = (validTo) => {
    const daysLeft = getDaysUntilExpiration(validTo);
    
    if (daysLeft < 0) {
      return 'bg-red-100 text-red-800';
    } else if (daysLeft < 30) {
      return 'bg-yellow-100 text-yellow-800';
    } else {
      return 'bg-green-100 text-green-800';
    }
  };

  // Render certificate list
  const renderCertificateList = () => {
    if (loading && certificates.length === 0) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading certificates...</div>
        </div>
      );
    }
    
    if (error && certificates.length === 0) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
      );
    }
    
    if (certificates.length === 0) {
      return (
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No certificates</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new certificate.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowUploadForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Upload Certificate
            </button>
            <button
              onClick={() => setShowGenerateForm(true)}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Generate Self-Signed
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="overflow-hidden bg-white shadow sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {certificates.map((certificate) => (
            <li key={certificate.id} className={`cursor-pointer hover:bg-gray-50 ${selectedCertificate && selectedCertificate.id === certificate.id ? 'bg-gray-50' : ''}`}>
              <div className="px-4 py-4 sm:px-6" onClick={() => handleCertificateSelect(certificate)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <p className="truncate text-sm font-medium text-indigo-600">{certificate.name}</p>
                    <div className={`ml-2 inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClass(certificate.valid_to)}`}>
                      {certificate.status}
                    </div>
                  </div>
                  <div className="ml-2 flex flex-shrink-0">
                    <p className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${certificate.type === 'acme' ? 'bg-green-100 text-green-800' : certificate.type === 'uploaded' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {certificate.type}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500">
                      <svg className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      {certificate.domains.split(',').join(', ')}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                    <svg className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <p>
                      Expires <time dateTime={certificate.valid_to}>{format(parseISO(certificate.valid_to), 'MMM d, yyyy')}</time>
                      {' '}
                      ({getDaysUntilExpiration(certificate.valid_to)} days)
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Render CA list
  const renderCAList = () => {
    if (loading && cas.length === 0) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading certificate authorities...</div>
        </div>
      );
    }
    
    if (error && cas.length === 0) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
      );
    }
    
    if (cas.length === 0) {
      return (
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No certificate authorities</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by adding a new certificate authority.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowAddCAForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Certificate Authority
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="overflow-hidden bg-white shadow sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {cas.map((ca) => (
            <li key={ca.id} className={`cursor-pointer hover:bg-gray-50 ${selectedCA && selectedCA.id === ca.id ? 'bg-gray-50' : ''}`}>
              <div className="px-4 py-4 sm:px-6" onClick={() => handleCASelect(ca)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <p className="truncate text-sm font-medium text-indigo-600">{ca.name}</p>
                    <div className={`ml-2 inline-flex flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ca.trusted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {ca.trusted ? 'Trusted' : 'Untrusted'}
                    </div>
                  </div>
                  <div className="ml-2 flex flex-shrink-0">
                    <p className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${ca.type === 'acme' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {ca.type}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500">
                      {ca.type === 'acme' ? (
                        <>
                          <svg className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd" />
                          </svg>
                          {ca.url}
                        </>
                      ) : (
                        <>
                          <svg className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          Custom CA
                        </>
                      )}
                    </p>
                  </div>
                  {ca.email && (
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <svg className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                      </svg>
                      <p>{ca.email}</p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Render certificate details
  const renderCertificateDetails = () => {
    if (!selectedCertificate) {
      return null;
    }
    
    return (
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">Certificate Details</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Details and properties of the selected certificate.</p>
          </div>
          <div className="flex space-x-2">
            {selectedCertificate.type === 'acme' && (
              <button
                onClick={() => handleRenewCertificate(selectedCertificate.id)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Renew
              </button>
            )}
            <button
              onClick={() => handleDeleteCertificate(selectedCertificate.id)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete
            </button>
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCertificate.name}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Domains</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCertificate.domains.split(',').join(', ')}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Issuer</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCertificate.issuer}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${selectedCertificate.type === 'acme' ? 'bg-green-100 text-green-800' : selectedCertificate.type === 'uploaded' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                  {selectedCertificate.type}
                </span>
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusClass(selectedCertificate.valid_to)}`}>
                  {selectedCertificate.status}
                </span>
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Valid From</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {format(parseISO(selectedCertificate.valid_from), 'MMMM d, yyyy')}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Valid To</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {format(parseISO(selectedCertificate.valid_to), 'MMMM d, yyyy')}
                {' '}
                ({getDaysUntilExpiration(selectedCertificate.valid_to)} days)
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Auto Renew</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {selectedCertificate.auto_renew ? 'Yes' : 'No'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    );
  };

  // Render CA details
  const renderCADetails = () => {
    if (!selectedCA) {
      return null;
    }
    
    return (
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">Certificate Authority Details</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Details and properties of the selected certificate authority.</p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleUpdateCATrust(selectedCA.id, !selectedCA.trusted)}
              className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white ${selectedCA.trusted ? 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'} focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {selectedCA.trusted ? (
                <>
                  <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Untrust
                </>
              ) : (
                <>
                  <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Trust
                </>
              )}
            </button>
            <button
              onClick={() => handleDeleteCA(selectedCA.id)}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete
            </button>
          </div>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCA.name}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${selectedCA.type === 'acme' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                  {selectedCA.type}
                </span>
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Trust Status</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${selectedCA.trusted ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {selectedCA.trusted ? 'Trusted' : 'Untrusted'}
                </span>
              </dd>
            </div>
            {selectedCA.url && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">URL</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCA.url}</dd>
              </div>
            )}
            {selectedCA.email && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCA.email}</dd>
              </div>
            )}
            {selectedCA.acme_account_id && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">ACME Account ID</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{selectedCA.acme_account_id}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    );
  };

  // Render upload certificate form
  const renderUploadForm = () => {
    if (!showUploadForm) {
      return null;
    }
    
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Upload Certificate</h3>
            <button
              onClick={() => setShowUploadForm(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
          
          <form onSubmit={handleUploadSubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                id="name"
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="domains" className="block text-sm font-medium text-gray-700">Domains (comma-separated)</label>
              <input
                type="text"
                id="domains"
                value={uploadForm.domains}
                onChange={(e) => setUploadForm({ ...uploadForm, domains: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Example: example.com, www.example.com</p>
            </div>
            
            <div className="mb-4">
              <label htmlFor="certificate" className="block text-sm font-medium text-gray-700">Certificate (PEM format)</label>
              <input
                type="file"
                id="certificate"
                onChange={(e) => setUploadForm({ ...uploadForm, certificate: e.target.files[0] })}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                required
              />
            </div>
            
            <div className="mb-6">
              <label htmlFor="privateKey" className="block text-sm font-medium text-gray-700">Private Key (PEM format)</label>
              <input
                type="file"
                id="privateKey"
                onChange={(e) => setUploadForm({ ...uploadForm, privateKey: e.target.files[0] })}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                required
              />
            </div>
            
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Upload
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Render generate certificate form
  const renderGenerateForm = () => {
    if (!showGenerateForm) {
      return null;
    }
    
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Generate Self-Signed Certificate</h3>
            <button
              onClick={() => setShowGenerateForm(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
          
          <form onSubmit={handleGenerateSubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                id="name"
                value={generateForm.name}
                onChange={(e) => setGenerateForm({ ...generateForm, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="domains" className="block text-sm font-medium text-gray-700">Domains (comma-separated)</label>
              <input
                type="text"
                id="domains"
                value={generateForm.domains}
                onChange={(e) => setGenerateForm({ ...generateForm, domains: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">Example: example.com, www.example.com</p>
            </div>
            
            <div className="mb-6">
              <label htmlFor="validityDays" className="block text-sm font-medium text-gray-700">Validity (days)</label>
              <input
                type="number"
                id="validityDays"
                value={generateForm.validityDays}
                onChange={(e) => setGenerateForm({ ...generateForm, validityDays: parseInt(e.target.value) })}
                min="1"
                max="3650"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowGenerateForm(false)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Generate
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Render add CA form
  const renderAddCAForm = () => {
    if (!showAddCAForm) {
      return null;
    }
    
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Add Certificate Authority</h3>
            <button
              onClick={() => setShowAddCAForm(false)}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
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
          
          <form onSubmit={handleCASubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                id="name"
                value={caForm.name}
                onChange={(e) => setCAForm({ ...caForm, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="type" className="block text-sm font-medium text-gray-700">Type</label>
              <select
                id="type"
                value={caForm.type}
                onChange={(e) => setCAForm({ ...caForm, type: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              >
                <option value="acme">ACME</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            
            {caForm.type === 'acme' && (
              <>
                <div className="mb-4">
                  <label htmlFor="url" className="block text-sm font-medium text-gray-700">ACME Directory URL</label>
                  <input
                    type="url"
                    id="url"
                    value={caForm.url}
                    onChange={(e) => setCAForm({ ...caForm, url: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">Example: https://acme-v02.api.letsencrypt.org/directory</p>
                </div>
                
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    id="email"
                    value={caForm.email}
                    onChange={(e) => setCAForm({ ...caForm, email: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </>
            )}
            
            {caForm.type === 'custom' && (
              <div className="mb-4">
                <label htmlFor="certificate" className="block text-sm font-medium text-gray-700">CA Certificate (PEM format)</label>
                <input
                  type="file"
                  id="certificate"
                  onChange={(e) => setCAForm({ ...caForm, certificate: e.target.files[0] })}
                  className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  required
                />
              </div>
            )}
            
            <div className="mb-6">
              <div className="flex items-center">
                <input
                  id="trusted"
                  type="checkbox"
                  checked={caForm.trusted}
                  onChange={(e) => setCAForm({ ...caForm, trusted: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="trusted" className="ml-2 block text-sm text-gray-900">
                  Trust this certificate authority
                </label>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAddCAForm(false)}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Certificate Management</h1>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('certificates')}
            className={`${
              activeTab === 'certificates'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Certificates
          </button>
          <button
            onClick={() => setActiveTab('cas')}
            className={`${
              activeTab === 'cas'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Certificate Authorities
          </button>
        </nav>
      </div>
      
      {/* Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {activeTab === 'certificates' && (
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Certificates</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowUploadForm(true)}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Upload
                </button>
                <button
                  onClick={() => setShowGenerateForm(true)}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Generate
                </button>
              </div>
            </div>
          )}
          
          {activeTab === 'cas' && (
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Certificate Authorities</h2>
              <button
                onClick={() => setShowAddCAForm(true)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="-ml-0.5 mr-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add CA
              </button>
            </div>
          )}
          
          {activeTab === 'certificates' && renderCertificateList()}
          {activeTab === 'cas' && renderCAList()}
        </div>
        
        <div className="lg:col-span-2">
          {activeTab === 'certificates' && renderCertificateDetails()}
          {activeTab === 'cas' && renderCADetails()}
        </div>
      </div>
      
      {/* Forms */}
      {renderUploadForm()}
      {renderGenerateForm()}
      {renderAddCAForm()}
    </div>
  );
};

export default CertificateManagement;
