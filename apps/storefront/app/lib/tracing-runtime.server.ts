import { storefrontEnv } from './env.server';
import { OtlpHttpTraceExporter } from './otlp-trace-exporter.server';
import {
  configureStorefrontTraceSampling,
  forceFlushStorefrontTraceExporter,
  registerStorefrontTraceExporter,
} from './tracing.server';

let initialized = false;

function runtimeLog(event: string, details: Record<string, unknown> = {}): void {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'storefront',
      event,
      ...details,
    }),
  );
}

/** Initialize the process-wide trace sampler and optional OTLP exporter once. */
export function initializeStorefrontTracing(): void {
  if (initialized) return;
  initialized = true;

  const config = storefrontEnv.tracing;
  configureStorefrontTraceSampling(config.enabled ? config.sampleRate : 0);

  if (!config.enabled || !config.endpoint) {
    registerStorefrontTraceExporter(null);
    return;
  }

  const exporter = new OtlpHttpTraceExporter({
    endpoint: config.endpoint,
    headers: config.headers,
    compression: config.compression,
    timeoutMs: Math.min(config.timeoutMs, config.exportTimeoutMs),
    scheduledDelayMs: config.scheduledDelayMs,
    maxQueueSize: config.maxQueueSize,
    maxExportBatchSize: config.maxExportBatchSize,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    resourceAttributes: config.resourceAttributes,
  });
  registerStorefrontTraceExporter(exporter);

  process.once('beforeExit', () => {
    void forceFlushStorefrontTraceExporter();
  });

  runtimeLog('trace.runtime_initialized', {
    protocol: config.protocol,
    endpointOrigin: config.endpoint.origin,
    endpointPath: config.endpoint.pathname,
    compression: config.compression,
    sampleRate: config.sampleRate,
    maxQueueSize: config.maxQueueSize,
    maxExportBatchSize: config.maxExportBatchSize,
    scheduledDelayMs: config.scheduledDelayMs,
  });
}
