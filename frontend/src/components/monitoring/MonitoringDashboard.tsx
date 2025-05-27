import React, { useState, useEffect } from "react";
import { HealthStatus } from "./HealthStatus";
import { MetricsChart } from "./MetricsChart";
import { SSLCertificates } from "./SSLCertificates";
import { LiveUpdates } from "./LiveUpdates";
import { AlertsPanel } from "./AlertsPanel";
import { api } from "@/services/api";
import { useWebSocketContext } from "@/context/WebSocketContext";
import {
  ProxyHealth,
  ProxyMetrics,
  ProxySSLCertificates,
  MetricType,
  Metric,
  HealthCheck,
  SSLCertificate,
  MonitoringUpdate,
  SystemStatus,
} from "@/types/monitoring";
import { AlertInstance, AlertThreshold } from "@/types/alerts";

// Type guards
const isHealthCheck = (data: any): data is HealthCheck => {
  return 'proxyId' in data && 'status' in data;
};

const isMetric = (data: any): data is Metric => {
  return 'proxyId' in data && 'metricType' in data && 'value' in data;
};

const isSSLCertificate = (data: any): data is SSLCertificate => {
  return 'proxyId' in data && 'domain' in data;
};

const isSystemStatus = (data: any): data is SystemStatus => {
  return 'status' in data && 'message' in data;
};

export const MonitoringDashboard: React.FC = () => {
  // State for each monitoring aspect
  const [proxyHealth, setProxyHealth] = useState<ProxyHealth>({});
  const [proxyMetrics, setProxyMetrics] = useState<ProxyMetrics>({});
  const [certificates, setCertificates] = useState<ProxySSLCertificates>({});
  const [selectedMetricType, setSelectedMetricType] = useState<MetricType>(
    MetricType.REQUEST_TIME
  );
  const [alerts, setAlerts] = useState<AlertInstance[]>([]);
  const [thresholds, setThresholds] = useState<AlertThreshold[]>([]);

  // Get WebSocket connection state and updates
  const { isConnected, isConnecting, isDisabled, lastUpdate, error } = useWebSocketContext();

  // Fetch alerts and thresholds on mount
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const [alertsRes, thresholdsRes] = await Promise.all([
          api.get('/monitoring/alerts'),
          api.get('/monitoring/alerts/thresholds')
        ]);
        setAlerts(alertsRes.data.data);
        setThresholds(thresholdsRes.data.data);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };
    
    fetchAlerts();
  }, []);

  // Update state based on WebSocket messages
  useEffect(() => {
    if (!lastUpdate?.data || !lastUpdate.type) return;
    const { data } = lastUpdate;

    try {
      switch (lastUpdate.type) {
        case "health":
          if (isHealthCheck(data)) {
            setProxyHealth(prev => ({
              ...prev,
              [data.proxyId]: data,
            }));
          }
          break;

        case "metric":
          if (isMetric(data)) {
            setProxyMetrics(prev => {
              const proxyMetrics = prev[data.proxyId] || {};
              const metricHistory = proxyMetrics[data.metricType] || {
                values: [],
                timestamps: [],
              };

              return {
                ...prev,
                [data.proxyId]: {
                  ...proxyMetrics,
                  [data.metricType]: {
                    values: [...metricHistory.values.slice(-99), data.value],
                    timestamps: [...metricHistory.timestamps.slice(-99), data.timestamp],
                  },
                },
              };
            });
          }
          break;

        case "ssl":
          if (isSSLCertificate(data)) {
            setCertificates(prev => {
              const proxyCerts = [...(prev[data.proxyId] || [])];
              const certIndex = proxyCerts.findIndex(c => c.id === data.id);

              if (certIndex >= 0) {
                proxyCerts[certIndex] = data;
              } else {
                proxyCerts.push(data);
              }

              return {
                ...prev,
                [data.proxyId]: proxyCerts,
              };
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error processing update:', error);
    }
  }, [lastUpdate]);

  // Show appropriate system state
  const renderContent = () => {
    if (lastUpdate?.type === 'system' && isSystemStatus(lastUpdate.data)) {
      if (lastUpdate.data.status === 'no_proxies') {
        return (
          <div className="p-6 bg-secondary rounded-lg text-center">
            <h2 className="text-xl font-semibold mb-2">No Proxies Configured</h2>
            <p className="text-muted-foreground">
              Configure proxies to start monitoring metrics and health status.
            </p>
          </div>
        );
      }
    }

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <HealthStatus proxyHealth={proxyHealth} />
          <SSLCertificates certificates={certificates} />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <MetricsChart
            proxyMetrics={proxyMetrics}
            selectedMetricType={selectedMetricType}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="flex space-x-4 overflow-x-auto py-2">
            {Object.values(MetricType).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedMetricType(type)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                  selectedMetricType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-secondary-foreground"
                }`}
              >
                {type
                  .split("_")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LiveUpdates updates={lastUpdate ? [lastUpdate] : []} />
          <AlertsPanel alerts={alerts} thresholds={thresholds} />
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6 p-6 relative">
      {renderContent()}

      {/* Connection Status */}
      {/* Connection Status */}
      {(!isConnected || error || isDisabled) && (
        <div className="fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg bg-destructive text-destructive-foreground">
          {isConnecting ? (
            "Connecting to monitoring service..."
          ) : isDisabled ? (
            "Another monitoring session is active in another tab or window"
          ) : error ? (
            `Error: ${error}`
          ) : (
            "Disconnected - Attempting to reconnect..."
          )}
        </div>
      )}
    </div>
  );
};
