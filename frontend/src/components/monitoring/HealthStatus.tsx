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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Health Status
          <Badge variant="outline" className="ml-2">
            {Object.keys(proxyHealth).length} Proxies
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
