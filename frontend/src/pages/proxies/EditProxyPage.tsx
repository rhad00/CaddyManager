import { useParams, Link } from 'react-router-dom';
import { useProxy } from '../../services/proxyService';
import ProxyForm from './ProxyForm';
import Spinner from '../../components/ui/Spinner';

export default function EditProxyPage() {
  const { id } = useParams<{ id: string }>();
  const { data: proxy, isLoading, error } = useProxy(id!);

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (error || !proxy) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-destructive">
          <h2 className="text-lg font-semibold">Error Loading Proxy</h2>
          <p className="text-sm">The proxy configuration could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProxyForm proxy={proxy} />
      <div className="container mx-auto">
        <div className="bg-card rounded-lg p-6 shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Alerts & Monitoring</h2>
            <Link 
              to={`/proxies/${proxy.id}/alerts`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md"
            >
              Configure Alerts
            </Link>
          </div>
          <p className="text-muted-foreground">
            Configure alerts for metrics, SSL expiry, error rates, response times, and health checks.
            Set up notifications via email or Slack when issues are detected.
          </p>
        </div>
      </div>
    </div>
  );
}
