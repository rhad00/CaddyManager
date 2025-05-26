import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MonitoringUpdate,
  HealthStatus,
  CertificateStatus,
  HealthCheck,
  SSLCertificate,
  Metric,
} from "@/types/monitoring";

interface LiveUpdatesProps {
  updates: MonitoringUpdate[];
  maxUpdates?: number;
}

interface UpdateMessage {
  title: string;
  message: string;
  time: string;
}

export const LiveUpdates: React.FC<LiveUpdatesProps> = ({
  updates,
  maxUpdates = 10,
}) => {
  const getUpdateBadgeVariant = (update: MonitoringUpdate): "outline" | "destructive" | "secondary" | "default" => {
    try {
      if (update.type === "health") {
        const healthData = update.data as HealthCheck;
        return healthData?.status === HealthStatus.HEALTHY
          ? "outline"
          : "destructive";
      }
      if (update.type === "ssl") {
        const sslData = update.data as SSLCertificate;
        return sslData?.status === CertificateStatus.VALID
          ? "outline"
          : "destructive";
      }
    } catch (error) {
      console.error('Error determining badge variant:', error);
    }
    return "secondary";
  };

  const formatUpdateMessage = (update: MonitoringUpdate): UpdateMessage => {
    try {
      const timestamp = new Date().toLocaleTimeString();

      if (!update?.type || !update?.data) {
        return {
          title: "Invalid Update",
          message: "Received invalid monitoring data",
          time: timestamp,
        };
      }

      switch (update.type) {
        case "health": {
          const healthData = update.data as HealthCheck;
          return {
            title: "Health Status Change",
            message: `Proxy ${healthData.proxyId.slice(0, 8)} is ${
              healthData.status
            }`,
            time: timestamp,
          };
        }
        case "ssl": {
          const cert = update.data as SSLCertificate;
          return {
            title: "SSL Certificate Update",
            message: `${cert.domain} certificate is ${cert.status}`,
            time: timestamp,
          };
        }
        case "metric": {
          const metric = update.data as Metric;
          const metricName = metric.metricType.split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          return {
            title: "Metric Alert",
            message: `${metricName}: ${metric.value}`,
            time: timestamp,
          };
        }
        default:
          return {
            title: "System Update",
            message: `Unknown update type: ${update.type}`,
            time: timestamp,
          };
      }
    } catch (error) {
      console.error('Error formatting update message:', error);
      return {
        title: "Error",
        message: "Failed to format update message",
        time: new Date().toLocaleTimeString(),
      };
    }
  };

  const recentUpdates = updates.slice(-maxUpdates);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Live Updates
          <Badge variant="outline" className="ml-2">
            Last {maxUpdates} Events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentUpdates.map((update, index) => {
            const { title, message, time } = formatUpdateMessage(update);
            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg"
              >
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-muted-foreground">{message}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={getUpdateBadgeVariant(update)}>{time}</Badge>
                </div>
              </div>
            );
          })}
          {recentUpdates.length === 0 && (
            <div className="text-center text-muted-foreground py-4">
              No recent updates
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
