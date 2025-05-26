import { useParams } from 'react-router-dom';
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

  return <ProxyForm proxy={proxy} />;
}
