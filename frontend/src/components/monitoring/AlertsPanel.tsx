import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertInstance, AlertThreshold } from '@/types/alerts';

interface AlertsPanelProps {
  alerts: AlertInstance[];
  thresholds: AlertThreshold[];
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, thresholds }) => {
  const getAlertSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'text-red-500 bg-red-500/10';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'info':
        return 'text-blue-500 bg-blue-500/10';
      default:
        return 'text-gray-500 bg-gray-500/10';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Active Alerts
          <Badge variant="outline" className="ml-2">
            {alerts.length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Active Alerts */}
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg ${getAlertSeverityColor(alert.severity)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{alert.name}</h3>
                  <Badge variant="outline">{alert.severity}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                <div className="text-xs text-muted-foreground mt-2">
                  Triggered at: {new Date(alert.triggeredAt).toLocaleString()}
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="text-center text-muted-foreground py-4">
                No active alerts
              </div>
            )}
          </div>

          {/* Alert Thresholds */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-3">Configured Thresholds</h3>
            <div className="space-y-2">
              {thresholds.map((threshold) => (
                <div
                  key={threshold.id}
                  className="flex items-center justify-between p-3 bg-secondary/10 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{threshold.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {threshold.condition} {threshold.value}
                    </div>
                  </div>
                  <Badge variant="outline">{threshold.severity}</Badge>
                </div>
              ))}
              {thresholds.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  No thresholds configured
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
