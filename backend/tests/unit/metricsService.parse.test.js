jest.mock('axios');
jest.mock('../../src/models', () => ({ Metric: { create: jest.fn(), findAll: jest.fn(), destroy: jest.fn() } }));

const axios = require('axios');
const { Op } = require('sequelize');
const { Metric } = require('../../src/models');
const { MetricsService, metricsService } = require('../../src/services/metricsService');

const PROMETHEUS = [
  '# HELP caddy_http_requests_total Counter of HTTP requests.',
  '# TYPE caddy_http_requests_total counter',
  'caddy_http_requests_total{handler="reverse_proxy",server="srv0"} 10',
  'caddy_http_requests_total{handler="file_server",server="srv0"} 5',
  '',
  'caddy_http_response_status_count_total{status_code="200"} 7',
  'caddy_http_response_status_count_total{status_code="404"} 2',
  'caddy_http_response_status_count_total{status_code="502"} 1',
  'caddy_http_response_status_count_total{status_code="301"} 3',
  'caddy_http_request_duration_seconds_sum 1.5',
  'process_cpu_seconds_total 12.5 1700000000',
  'process_resident_memory_bytes 1.048576e+06',
  'go_goroutines 42',
  'caddy_tls_handshakes_total 4',
  'this line is not a metric',
].join('\n');

describe('MetricsService', () => {
  let service;

  beforeEach(() => {
    service = new MetricsService();
    jest.clearAllMocks();
  });

  describe('parseMetrics', () => {
    it('groups samples by name and parses labels and values', () => {
      const metrics = service.parseMetrics(PROMETHEUS);
      expect(metrics.caddy_http_requests_total).toEqual([
        { labels: { handler: 'reverse_proxy', server: 'srv0' }, value: 10 },
        { labels: { handler: 'file_server', server: 'srv0' }, value: 5 },
      ]);
      expect(metrics.process_cpu_seconds_total).toEqual([{ labels: {}, value: 12.5 }]);
      expect(metrics.process_resident_memory_bytes[0].value).toBe(1048576);
    });

    it('skips comments, blank lines and lines that are not metrics', () => {
      const metrics = service.parseMetrics(PROMETHEUS);
      expect(Object.keys(metrics)).not.toContain('this');
      expect(Object.keys(metrics).every((name) => !name.startsWith('#'))).toBe(true);
    });
  });

  describe('summaries', () => {
    it('sums, averages and takes the first value', () => {
      const points = [{ labels: {}, value: 2 }, { labels: {}, value: 4 }];
      expect(service.sumMetricValues(points)).toBe(6);
      expect(service.calculateAverage(points)).toBe(3);
      expect(service.getMetricValue(points)).toBe(2);
      expect(service.calculateAverage([])).toBe(0);
      expect(service.getMetricValue([])).toBe(0);
    });

    it('groups response counts by status class', () => {
      const metrics = service.parseMetrics(PROMETHEUS);
      expect(service.groupByStatusCode(metrics.caddy_http_response_status_count_total))
        .toEqual({ '2xx': 7, '3xx': 3, '4xx': 2, '5xx': 1 });
    });

    it('builds the summary from Caddy’s metrics', async () => {
      axios.get.mockResolvedValue({ data: PROMETHEUS });
      const summary = await service.getMetricsSummary();
      expect(axios.get).toHaveBeenCalledWith(`${service.apiUrl}/metrics`);
      expect(summary.http.requestsTotal).toBe(15);
      expect(summary.http.responseStatus['5xx']).toBe(1);
      expect(summary.system).toEqual({ cpuSeconds: 12.5, memoryBytes: 1048576, goroutines: 42 });
      expect(summary.tls).toEqual({ handshakesTotal: 4, certificatesTotal: 0 });
    });
  });

  describe('getRawMetrics', () => {
    it('caches the response for a short time', async () => {
      axios.get.mockResolvedValue({ data: 'a 1' });
      await service.getRawMetrics();
      await service.getRawMetrics();
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('reports a failure to reach Caddy', async () => {
      axios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      await expect(service.getRawMetrics()).rejects.toThrow('Failed to get metrics: connect ECONNREFUSED');
    });
  });

  describe('filters', () => {
    it('keeps http, tls and system metrics apart', async () => {
      axios.get.mockResolvedValue({ data: PROMETHEUS });
      expect(Object.keys(await service.getHttpMetrics())).toContain('caddy_http_requests_total');
      expect(Object.keys(await service.getTlsMetrics())).toEqual(['caddy_tls_handshakes_total']);
      expect(Object.keys(await service.getSystemMetrics()).sort())
        .toEqual(['go_goroutines', 'process_cpu_seconds_total', 'process_resident_memory_bytes']);
      expect(await service.getMetricByName('nope')).toEqual([]);
    });
  });

  describe('storage', () => {
    it('saves a snapshot with the parsed metrics and the summary', async () => {
      axios.get.mockResolvedValue({ data: PROMETHEUS });
      const timestamp = new Date();
      Metric.create.mockResolvedValue({ id: 3, timestamp });
      const result = await service.saveMetricsSnapshot();
      expect(result).toEqual({ success: true, id: 3, timestamp });
      expect(Metric.create).toHaveBeenCalledWith(expect.objectContaining({
        metrics_data: expect.objectContaining({ go_goroutines: expect.any(Array) }),
        summary: expect.objectContaining({ http: expect.any(Object) }),
      }));
    });

    it('deletes snapshots older than the retention period', async () => {
      Metric.destroy.mockResolvedValue(4);
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(service.cleanupOldMetrics(7)).resolves.toBe(4);
      const { where } = Metric.destroy.mock.calls[0][0];
      const cutoff = where.timestamp[Op.lt];
      expect(Date.now() - cutoff.getTime()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    });

    it('lists snapshots newest first under the requested limit', async () => {
      const row = { id: 1, timestamp: new Date(), metrics_data: { a: [] }, summary: null, createdAt: new Date() };
      Metric.findAll.mockResolvedValue([row]);
      const [first] = await service.getHistoricalMetrics(5);
      expect(Metric.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, order: [['timestamp', 'DESC']] }));
      expect(first).toEqual({ id: 1, timestamp: row.timestamp, metrics: row.metrics_data, summary: null, createdAt: row.createdAt });
    });
  });

  it('exports a shared instance', () => {
    expect(metricsService).toBeInstanceOf(MetricsService);
  });
});
