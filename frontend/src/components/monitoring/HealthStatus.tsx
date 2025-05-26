import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProxyHealth, HealthStatus as HealthStatusType } from "@/types/monitoring";

interface HealthStatusProps {
  proxyHealth: ProxyHealth;
}

export const HealthStatus: React.FC<HealthStatusProps> = ({ proxyHealth }) => {
  const getStatusColor = (status: HealthStatusType) => {
    switch (status) {
      case HealthStatusType.HEALTHY:
        return "bg-green-500";
      case HealthStatusType.DEGRADED:
        return "bg-yellow-500";
      case HealthStatusType.UNHEALTHY:
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatResponseTime = (time?: number) => {
    if (!time) return "N/A";
    return `${time}ms`;
  };

  const getStatusStats = () => {
    const stats = {
      total: Object.keys(proxyHealth).length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0
    };

    Object.values(proxyHealth).forEach(health => {
      switch (health.status) {
        case HealthStatusType.HEALTHY:
          stats.healthy++;
          break;
        case HealthStatusType.DEGRADED:
          stats.degraded++;
          break;
        case HealthStatusType.UNHEALTHY:
          stats.unhealthy++;
          break;
      }
    });

    return stats;
  };

  const stats = getStatusStats();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Health Status
          <Badge variant="outline" className="ml-2">
            {stats.total} Proxies
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-green-500/10 rounded-lg">
            <div className="text-2xl font-bold text-green-500">{stats.healthy}</div>
            <div className="text-sm text-muted-foreground">Healthy</div>
          </div>
          <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
            <div className="text-2xl font-bold text-yellow-500">{stats.degraded}</div>
            <div className="text-sm text-muted-foreground">Degraded</div>
          </div>
          <div className="text-center p-4 bg-red-500/10 rounded-lg">
            <div className="text-2xl font-bold text-red-500">{stats.unhealthy}</div>
            <div className="text-sm text-muted-foreground">Unhealthy</div>
          </div>
        </div>
        <div className="space-y-4">
          {Object.entries(proxyHealth).map(([proxyId, health]) => (
            <div
              key={proxyId}
              className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-3 h-3 rounded-full ${getStatusColor(
                    health.status
                  )}`}
                />
                <div>
                  <div className="font-medium">Proxy {proxyId.slice(0, 8)}</div>
                  <div className="text-sm text-muted-foreground">
                    Response Time: {formatResponseTime(health.responseTime)}
                  </div>
                </div>
              </div>
              {health.errorMessage && (
                <Badge variant="destructive" className="ml-2">
                  {health.errorMessage}
                </Badge>
              )}
            </div>
          ))}
          {Object.keys(proxyHealth).length === 0 && (
            <div className="text-center text-muted-foreground py-4">
              No health data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
