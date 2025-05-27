import { useProxies, useToggleProxy, useDeleteProxy, Proxy } from '../../services/proxyService';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import Spinner from '../../components/ui/Spinner';
import AlertDialog from '../../components/ui/AlertDialog';
import { useToast } from '../../components/ui/Toast';

export default function ProxyListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [proxyToDelete, setProxyToDelete] = useState<Proxy | null>(null);
  const limit = 10;
  const { toast } = useToast();
  const shortcuts = [
    { key: 'n', action: () => navigate('/proxies/new'), options: { ctrl: true } },
    {
      key: 'f',
      action: () => document.querySelector<HTMLInputElement>('[name="search"]')?.focus(),
      options: { ctrl: true },
    },
    { key: 'ArrowLeft', action: () => setPage(p => Math.max(0, p - 1)), options: { alt: true } },
    { key: 'ArrowRight', action: () => setPage(p => p + 1), options: { alt: true } },
  ];

  shortcuts.forEach(({ key, action, options }) => {
    useKeyboardShortcut(key, action, options);
  });

  const { data, isLoading, error } = useProxies({
    limit,
    offset: page * limit,
  });

  const toggleProxy = useToggleProxy();
  const deleteProxy = useDeleteProxy();

  const handleToggle = async (proxy: Proxy) => {
    try {
      await toggleProxy.mutateAsync(proxy.id);
      toast(
        `Successfully ${proxy.isActive ? 'disabled' : 'enabled'} proxy "${proxy.name}"`,
        'success',
      );
    } catch (error) {
      toast(
        `Failed to ${proxy.isActive ? 'disable' : 'enable'} proxy: ${
          error instanceof Error ? error.message : 'Unknown error occurred'
        }`,
        'error',
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProxy.mutateAsync(id);
      toast('Proxy deleted successfully', 'success');
      setProxyToDelete(null);
    } catch (error) {
      toast(
        `Failed to delete proxy: ${
          error instanceof Error ? error.message : 'Unknown error occurred'
        }`,
        'error',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (error) {
    return <div>Error loading proxies</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Proxy Configurations</h1>
          <Link
            to="/proxies/new"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md inline-flex items-center gap-2"
          >
            Add New Proxy
            <span className="text-xs opacity-75">(Ctrl+N)</span>
          </Link>
        </div>
        <div className="relative">
          <input
            type="search"
            name="search"
            placeholder="Search proxies... (Ctrl+F)"
            className="w-full px-4 py-2 text-sm rounded-md border border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Domains</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.rows.map((proxy: Proxy) => (
                <tr key={proxy.id}>
                  <td className="px-6 py-4">
                    <Link to={`/proxies/${proxy.id}`} className="text-primary hover:underline">
                      {proxy.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {proxy.config.domains.map(domain => (
                        <span key={domain.name} className="text-sm">
                          {domain.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 items-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          proxy.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {proxy.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {proxy.status === 'error' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Error
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Link 
                        to={`/proxies/${proxy.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleToggle(proxy)}
                        className="text-sm text-primary hover:underline"
                      >
                        {proxy.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => setProxyToDelete(proxy)}
                        className="text-sm text-destructive hover:underline"
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

        {/* Pagination */}
        {data && data.count > limit && (
          <div className="flex justify-between items-center px-6 py-3 border-t">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {Math.ceil(data.count / limit)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(data.count / limit) - 1}
              className="text-sm text-muted-foreground hover:text-primary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={!!proxyToDelete}
        onClose={() => setProxyToDelete(null)}
        onConfirm={() => {
          if (proxyToDelete) {
            handleDelete(proxyToDelete.id);
          }
        }}
        title="Delete Proxy"
        description={`Are you sure you want to delete the proxy "${proxyToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </div>
  );
}
