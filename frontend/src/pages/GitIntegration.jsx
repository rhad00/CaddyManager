import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { get, post, put, del } from '../utils/api';

const GitIntegration = () => {
  const [activeSection, setActiveSection] = useState('repositories');
  const [repositories, setRepositories] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [showRepoForm, setShowRepoForm] = useState(false);
  const [editingRepo, setEditingRepo] = useState(null);
  const { token, csrfToken } = useAuth();

  const [repoForm, setRepoForm] = useState({
    name: '',
    provider: 'github',
    repository_url: '',
    branch: 'main',
    access_token: '',
    auto_commit: false,
    auto_sync: false,
    sync_interval: 300,
    commit_message_template: 'CaddyManager: {{changes}}',
    enabled: true
  });

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      const response = await get('/git/repositories', token);

      if (!response.ok) {
        throw new Error('Failed to fetch repositories');
      }

      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      setError('Failed to load Git repositories. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await get('/git/history', token);

      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await response.json();
      setHistory(data.changes || []);
    } catch (error) {
      console.error('Error fetching history:', error);
      setError('Failed to load Git history. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'repositories') {
      fetchRepositories();
    } else {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeSection]);

  const handleSubmitRepo = async (e) => {
    e.preventDefault();

    try {
      setActionInProgress(true);
      setActionMessage(editingRepo ? 'Updating repository...' : 'Adding repository...');

      const endpoint = editingRepo ? `/git/repositories/${editingRepo}` : '/git/repositories';
      const method = editingRepo ? put : post;

      const response = await method(endpoint, repoForm, token, csrfToken);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save repository');
      }

      setActionMessage('Repository saved successfully');
      setShowRepoForm(false);
      setEditingRepo(null);
      setRepoForm({
        name: '',
        provider: 'github',
        repository_url: '',
        branch: 'main',
        access_token: '',
        auto_commit: false,
        auto_sync: false,
        sync_interval: 300,
        commit_message_template: 'CaddyManager: {{changes}}',
        enabled: true
      });
      fetchRepositories();
    } catch (error) {
      console.error('Error saving repository:', error);
      setError(error.message || 'Failed to save repository. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleEditRepo = async (repo) => {
    setEditingRepo(repo.id);
    setRepoForm({
      name: repo.name,
      provider: repo.provider,
      repository_url: repo.repository_url,
      branch: repo.branch,
      access_token: '', // Don't populate for security
      auto_commit: repo.auto_commit,
      auto_sync: repo.auto_sync,
      sync_interval: repo.sync_interval,
      commit_message_template: repo.commit_message_template,
      enabled: repo.enabled
    });
    setShowRepoForm(true);
  };

  const handleDeleteRepo = async (repoId) => {
    if (!window.confirm('Are you sure you want to remove this Git repository connection? This will not delete the remote repository.')) {
      return;
    }

    try {
      setActionInProgress(true);
      setActionMessage('Removing repository...');

      const response = await del(`/git/repositories/${repoId}`, token, csrfToken);

      if (!response.ok) {
        throw new Error('Failed to delete repository');
      }

      setActionMessage('Repository removed successfully');
      fetchRepositories();
    } catch (error) {
      console.error('Error deleting repository:', error);
      setError('Failed to delete repository. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleTestRepo = async (repoId) => {
    try {
      setActionInProgress(true);
      setActionMessage('Testing connection...');

      const response = await post(`/git/repositories/${repoId}/test`, {}, token, csrfToken);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Connection test failed');
      }

      setActionMessage('Connection test successful');
    } catch (error) {
      console.error('Error testing repository:', error);
      setError(error.message || 'Connection test failed. Please check your credentials.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleSyncRepo = async (repoId) => {
    if (!window.confirm('This will pull configuration from Git and replace all current proxies. Are you sure?')) {
      return;
    }

    try {
      setActionInProgress(true);
      setActionMessage('Syncing from Git...');

      const response = await post(`/git/repositories/${repoId}/sync`, {}, token, csrfToken);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Sync failed');
      }

      setActionMessage('Configuration synced successfully from Git');
    } catch (error) {
      console.error('Error syncing repository:', error);
      setError(error.message || 'Failed to sync from Git. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleExportRepo = async (repoId) => {
    try {
      setActionInProgress(true);
      setActionMessage('Exporting configuration...');

      const response = await post(`/git/repositories/${repoId}/export`, {}, token, csrfToken);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      setActionMessage('Configuration exported to Git successfully');
    } catch (error) {
      console.error('Error exporting:', error);
      setError('Failed to export configuration. Please try again later.');
    } finally {
      setActionInProgress(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getProviderBadgeColor = (provider) => {
    switch (provider) {
      case 'github':
        return 'bg-gray-100 text-gray-800';
      case 'gitlab':
        return 'bg-orange-100 text-orange-800';
      case 'gitea':
        return 'bg-green-100 text-green-800';
      case 'bitbucket':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getChangeTypeBadgeColor = (changeType) => {
    switch (changeType) {
      case 'proxy_create':
        return 'bg-green-100 text-green-800';
      case 'proxy_update':
        return 'bg-blue-100 text-blue-800';
      case 'proxy_delete':
        return 'bg-red-100 text-red-800';
      case 'template_apply':
        return 'bg-purple-100 text-purple-800';
      case 'backup_restore':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Git Integration & GitOps</h1>
        {activeSection === 'repositories' && (
          <button
            onClick={() => {
              setShowRepoForm(!showRepoForm);
              setEditingRepo(null);
              setRepoForm({
                name: '',
                provider: 'github',
                repository_url: '',
                branch: 'main',
                access_token: '',
                auto_commit: false,
                auto_sync: false,
                sync_interval: 300,
                commit_message_template: 'CaddyManager: {{changes}}',
                enabled: true
              });
            }}
            disabled={actionInProgress}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {showRepoForm ? 'Cancel' : 'Connect Repository'}
          </button>
        )}
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveSection('repositories')}
            className={`${
              activeSection === 'repositories'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
          >
            Repositories
          </button>
          <button
            onClick={() => setActiveSection('history')}
            className={`${
              activeSection === 'history'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
          >
            Commit History
          </button>
        </nav>
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

      {activeSection === 'repositories' && showRepoForm && (
        <div className="mb-6 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              {editingRepo ? 'Edit Repository' : 'Connect Git Repository'}
            </h3>
            <form onSubmit={handleSubmitRepo} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Repository Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={repoForm.name}
                    onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Production Config"
                  />
                </div>

                <div>
                  <label htmlFor="provider" className="block text-sm font-medium text-gray-700">
                    Git Provider *
                  </label>
                  <select
                    id="provider"
                    required
                    value={repoForm.provider}
                    onChange={(e) => setRepoForm({ ...repoForm, provider: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="gitea">Gitea</option>
                    <option value="bitbucket">Bitbucket</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="repository_url" className="block text-sm font-medium text-gray-700">
                    Repository URL *
                  </label>
                  <input
                    type="url"
                    id="repository_url"
                    required
                    value={repoForm.repository_url}
                    onChange={(e) => setRepoForm({ ...repoForm, repository_url: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="https://github.com/user/caddy-config"
                  />
                </div>

                <div>
                  <label htmlFor="branch" className="block text-sm font-medium text-gray-700">
                    Branch *
                  </label>
                  <input
                    type="text"
                    id="branch"
                    required
                    value={repoForm.branch}
                    onChange={(e) => setRepoForm({ ...repoForm, branch: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="main"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="access_token" className="block text-sm font-medium text-gray-700">
                    Access Token * {editingRepo && '(leave empty to keep current)'}
                  </label>
                  <input
                    type="password"
                    id="access_token"
                    required={!editingRepo}
                    value={repoForm.access_token}
                    onChange={(e) => setRepoForm({ ...repoForm, access_token: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="ghp_xxxxxxxxxxxx or glpat-xxxxxxxxxxxx"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Personal access token with repo scope. Will be encrypted at rest.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="commit_message_template" className="block text-sm font-medium text-gray-700">
                    Commit Message Template
                  </label>
                  <input
                    type="text"
                    id="commit_message_template"
                    value={repoForm.commit_message_template}
                    onChange={(e) => setRepoForm({ ...repoForm, commit_message_template: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="CaddyManager: {{changes}}"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use {'{{'}{'{'}changes{'}}'}{'}'} placeholder for auto-generated change summary
                  </p>
                </div>

                <div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="auto_commit"
                      checked={repoForm.auto_commit}
                      onChange={(e) => setRepoForm({ ...repoForm, auto_commit: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="auto_commit" className="ml-2 block text-sm text-gray-900">
                      Auto-commit on changes
                    </label>
                  </div>
                  <p className="ml-6 text-xs text-gray-500">
                    Automatically commit and push changes to Git
                  </p>
                </div>

                <div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="auto_sync"
                      checked={repoForm.auto_sync}
                      onChange={(e) => setRepoForm({ ...repoForm, auto_sync: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="auto_sync" className="ml-2 block text-sm text-gray-900">
                      Enable GitOps mode
                    </label>
                  </div>
                  <p className="ml-6 text-xs text-gray-500">
                    Pull configuration from Git at intervals (replaces all proxies)
                  </p>
                </div>

                {repoForm.auto_sync && (
                  <div>
                    <label htmlFor="sync_interval" className="block text-sm font-medium text-gray-700">
                      Sync Interval (seconds)
                    </label>
                    <input
                      type="number"
                      id="sync_interval"
                      min="60"
                      value={repoForm.sync_interval}
                      onChange={(e) => setRepoForm({ ...repoForm, sync_interval: parseInt(e.target.value) })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={repoForm.enabled}
                      onChange={(e) => setRepoForm({ ...repoForm, enabled: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900">
                      Enabled
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRepoForm(false);
                    setEditingRepo(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingRepo ? 'Update Repository' : 'Connect Repository'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeSection === 'repositories' && (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Connected Repositories
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Manage Git repository connections for configuration version control and GitOps.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500">Loading repositories...</div>
            </div>
          ) : (
            <div className="border-t border-gray-200">
              {repositories.length === 0 ? (
                <div className="px-6 py-4 text-center text-gray-500">
                  No repositories connected. Connect your first Git repository to enable version control.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Provider
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Branch
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mode
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Sync
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {repositories.map((repo) => (
                        <tr key={repo.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {repo.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getProviderBadgeColor(repo.provider)}`}>
                              {repo.provider}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {repo.branch}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex flex-col space-y-1">
                              {repo.auto_commit && (
                                <span className="text-xs text-green-600">Auto-Commit</span>
                              )}
                              {repo.auto_sync && (
                                <span className="text-xs text-blue-600">GitOps ({repo.sync_interval}s)</span>
                              )}
                              {!repo.auto_commit && !repo.auto_sync && (
                                <span className="text-xs text-gray-400">Manual</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {repo.last_sync ? formatDate(repo.last_sync) : 'Never'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              repo.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {repo.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => handleTestRepo(repo.id)}
                                disabled={actionInProgress}
                                className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Test connection"
                              >
                                Test
                              </button>
                              <button
                                onClick={() => handleExportRepo(repo.id)}
                                disabled={actionInProgress || !repo.enabled}
                                className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Export current configuration"
                              >
                                Export
                              </button>
                              <button
                                onClick={() => handleSyncRepo(repo.id)}
                                disabled={actionInProgress || !repo.enabled}
                                className="text-purple-600 hover:text-purple-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Pull configuration from Git (GitOps)"
                              >
                                Sync
                              </button>
                              <button
                                onClick={() => handleEditRepo(repo)}
                                disabled={actionInProgress}
                                className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Edit repository settings"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRepo(repo.id)}
                                disabled={actionInProgress}
                                className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Remove repository connection"
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
      )}

      {activeSection === 'history' && (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Commit History
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              View all configuration changes committed to Git repositories.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500">Loading commit history...</div>
            </div>
          ) : (
            <div className="border-t border-gray-200">
              {history.length === 0 ? (
                <div className="px-6 py-4 text-center text-gray-500">
                  No commit history found. Changes will appear here when auto-commit is enabled.
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {history.map((change) => (
                    <div key={change.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getChangeTypeBadgeColor(change.change_type)}`}>
                              {change.change_type.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {change.commit_sha ? change.commit_sha.substring(0, 7) : 'N/A'}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {change.commit_message?.split('\n')[0] || 'No message'}
                          </p>
                          <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                            <span>{formatDate(change.committed_at)}</span>
                            <span>Resource: {change.resource_type}</span>
                            {change.user && <span>By: {change.user.email}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'repositories' && repositories.length === 0 && !showRepoForm && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Git Integration Setup</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p className="mb-2">Connect a Git repository to enable version control for your proxy configurations.</p>
                <p className="mb-2"><strong>Features:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Auto-commit changes to Git (backup mode)</li>
                  <li>GitOps mode: Pull configuration from Git automatically</li>
                  <li>Commit history with audit trail</li>
                  <li>Rollback to previous configurations</li>
                  <li>Encrypted credential storage</li>
                </ul>
                <p className="mt-3"><strong>Important:</strong> Set GIT_SECRET_KEY environment variable for token encryption.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitIntegration;
