import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProxyMetrics, MetricType } from "@/types/monitoring";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface MetricsChartProps {
  proxyMetrics: ProxyMetrics;
  selectedMetricType: MetricType;
  selectedProxyId?: string;
}

const METRIC_LABELS: Record<MetricType, string> = {
  [MetricType.REQUEST_TIME]: "Request Time (ms)",
  [MetricType.ERROR_RATE]: "Error Rate (%)",
  [MetricType.BANDWIDTH_IN]: "Bandwidth In (MB/s)",
  [MetricType.BANDWIDTH_OUT]: "Bandwidth Out (MB/s)",
  [MetricType.CPU_USAGE]: "CPU Usage (%)",
  [MetricType.MEMORY_USAGE]: "Memory Usage (MB)",
  [MetricType.CONNECTION_COUNT]: "Active Connections",
};

export const MetricsChart: React.FC<MetricsChartProps> = ({
  proxyMetrics,
  selectedMetricType,
  selectedProxyId,
}) => {
  const chartData = useMemo(() => {
    const datasets = Object.entries(proxyMetrics)
      .filter(([proxyId]) => !selectedProxyId || proxyId === selectedProxyId)
      .map(([proxyId, metrics]) => {
        const metricData = metrics[selectedMetricType];
        if (!metricData) return null;

        return {
          label: `Proxy ${proxyId.slice(0, 8)}`,
          data: metricData.values,
          borderColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
          backgroundColor: `hsla(${Math.random() * 360}, 70%, 50%, 0.5)`,
          tension: 0.4,
        };
      })
      .filter((dataset): dataset is NonNullable<typeof dataset> => dataset !== null);

    const timestamps =
      datasets.length > 0 &&
      proxyMetrics[Object.keys(proxyMetrics)[0]][selectedMetricType]?.timestamps;

    return {
      labels: timestamps || [],
      datasets,
    };
  }, [proxyMetrics, selectedMetricType, selectedProxyId]);

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: METRIC_LABELS[selectedMetricType],
        },
      },
      x: {
        title: {
          display: true,
          text: "Time",
        },
        ticks: {
          maxTicksLimit: 8,
        },
      },
    },
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{METRIC_LABELS[selectedMetricType]}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <Line options={options} data={chartData} />
        </div>
        {Object.keys(proxyMetrics).length === 0 && (
          <div className="text-center text-muted-foreground py-4">
            No metric data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
