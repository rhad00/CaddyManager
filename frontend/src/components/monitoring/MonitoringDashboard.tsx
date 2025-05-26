import React, { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { HealthStatus } from "./HealthStatus";
import { MetricsChart } from "./MetricsChart";
import { SSLCertificates } from "./SSLCertificates";
import { LiveUpdates } from "./LiveUpdates";
import { AlertsPanel } from "./AlertsPanel";
import {
  MonitoringUpdate,
  ProxyHealth,
  ProxyMetrics,
  ProxySSLCertificates,
  MetricType,
  Metric,
  HealthCheck,
  SSLCertificate,
} from "@/types/monitoring";
import { AlertInstance, AlertThreshold } from "@/types/alerts";

export const MonitoringDashboard: React.FC = () => {
  // State for each monitoring aspect
  const [proxyHealth, setProxyHealth] = useState<ProxyHealth>({});
  const [proxyMetrics, setProxyMetrics] = useState<ProxyMetrics>({});
  const [certificates, setCertificates] = useState<ProxySSLCertificates>({});
  const [updates, setUpdates] = useState<MonitoringUpdate[]>([]);
  const [selectedMetricType, setSelectedMetricType] = useState<MetricType>(
    MetricType.REQUEST_TIME
  );
  const [alerts, setAlerts] = useState<AlertInstance[]>([]);
  const [thresholds, setThresholds] = useState<AlertThreshold[]>([]);

  // Fetch alerts and thresholds on mount
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/monitoring/alerts');
        if (response.ok) {
          const data = await response.json();
          setAlerts(data.alerts);
          setThresholds(data.thresholds);
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };
    
    fetchAlerts();
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: MonitoringUpdate) => {
    switch (message.type) {
      case "health": {
        const healthData = message.data as HealthCheck;
        setProxyHealth((prev) => ({
          ...prev,
          [healthData.proxyId]: healthData,
        }));
        break;
      }
      case "metric": {
        const metricData = message.data as Metric;
        setProxyMetrics((prev) => {
          const proxyMetrics = prev[metricData.proxyId] || {};
          const metricHistory = proxyMetrics[metricData.metricType] || {
            values: [],
            timestamps: [],
          };

          // Keep last 100 data points
          const values = [...metricHistory.values.slice(-99), metricData.value];
          const timestamps = [
            ...metricHistory.timestamps.slice(-99),
            metricData.timestamp,
          ];

          return {
            ...prev,
            [metricData.proxyId]: {
              ...proxyMetrics,
              [metricData.metricType]: { values, timestamps },
            },
          };
        });
        break;
      }
      case "ssl": {
        const certData = message.data as SSLCertificate;
        setCertificates((prev) => {
          const proxyCerts = [...(prev[certData.proxyId] || [])];
          const certIndex = proxyCerts.findIndex((c) => c.id === certData.id);

          if (certIndex >= 0) {
            proxyCerts[certIndex] = certData;
          } else {
            proxyCerts.push(certData);
          }

          return {
            ...prev,
            [certData.proxyId]: proxyCerts,
          };
        });
        break;
      }
    }

    // Add to updates list
    setUpdates((prev) => [...prev.slice(-99), message]);
  }, []);

  // Connect to WebSocket
  const { isConnected } = useWebSocket({
    url: "ws://localhost:3000/api/monitoring/ws",
    onMessage: handleMessage,
  });

  return (
    <div className="space-y-6 p-6">
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
        <LiveUpdates updates={updates} />
        <AlertsPanel alerts={alerts} thresholds={thresholds} />
      </div>

      {!isConnected && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg shadow-lg">
          WebSocket Disconnected - Attempting to reconnect...
        </div>
      )}
    </div>
  );
};
