# Storefront observability operations

## Runtime architecture

The Storefront emits structured JSON logs to stdout and optionally exports traces through OTLP/HTTP JSON.

```text
Browser or upstream proxy
  -> Storefront server span
      -> Storefront-to-API client spans
  -> local or cluster OpenTelemetry Collector
      -> trace backend
```

Keep backend credentials in the collector whenever possible. The Storefront exporter is disabled when no OTLP endpoint is configured.

## Required production variables

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json
OTEL_SERVICE_NAME=booking-storefront
OTEL_RESOURCE_ATTRIBUTES=service.version=<release>,deployment.environment.name=production
STOREFRONT_TRACE_SAMPLE_RATE=1
```

Optional authentication headers use the W3C baggage-style `key=value,key2=value2` syntax. Percent-encode spaces and commas in values.

```bash
OTEL_EXPORTER_OTLP_TRACES_HEADERS=authorization=Bearer%20<token>
```

The Storefront rejects attempts to override transport and correlation headers such as `content-type`, `traceparent`, `tracestate`, `host` and `x-request-id`.

## Batch processor defaults

| Variable | Default | Purpose |
| --- | ---: | --- |
| `OTEL_BSP_SCHEDULE_DELAY` | `5000` ms | Maximum delay before a queued batch is sent |
| `OTEL_BSP_EXPORT_TIMEOUT` | `30000` ms | Upper bound applied to an export operation |
| `OTEL_BSP_MAX_QUEUE_SIZE` | `2048` spans | Bounded in-process queue |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | `512` spans | Maximum spans in one OTLP request |
| `OTEL_EXPORTER_OTLP_TRACES_TIMEOUT` | `10000` ms | HTTP request timeout |

Only one export request runs at a time. Temporary network failures and HTTP `408`, `429`, `502`, `503` and `504` responses are retried with bounded exponential backoff and jitter. Customer requests never wait for an export attempt.

## Sampling policy

Sampling is parent-based and deterministic by trace ID.

- Preserve the upstream sampled flag when a valid remote parent exists.
- For a new root trace, apply `STOREFRONT_TRACE_SAMPLE_RATE` in the range `0` to `1`.
- Use the same trace-ID decision for Storefront server and API client spans.
- Do not attempt outcome-based sampling inside the application because the decision occurs before the final response status is known.

Recommended production deployment:

1. Set `STOREFRONT_TRACE_SAMPLE_RATE=1` when exporting to a collector in the same network.
2. Apply tail sampling in the collector: keep errors and slow traces at 100%, then sample ordinary successful traces according to traffic and cost.
3. If no tail-sampling collector is available, start with `0.1`, review trace volume, and understand that some errors may be excluded by head sampling.

## Initial retention policy

These are operational defaults and should be adjusted to traffic, incident frequency and storage cost.

| Data | Hot searchable retention | Archive retention |
| --- | ---: | ---: |
| Normal traces | 7 days | none |
| Error or slow traces | 30 days | 90 days when required for incident review |
| Application logs | 30 days | 90 days for security and audit events |

Never attach cookies, tokens, request bodies, response bodies, payment credentials, email addresses or phone numbers to spans.

## Initial alerts

Create alerts in the log or telemetry platform, not in application source.

| Signal | Suggested trigger |
| --- | --- |
| `trace.queue_full` | any occurrence in 5 minutes |
| `trace.batch_export_failed` | 3 occurrences in 5 minutes |
| Storefront HTTP 5xx rate | above 2% for 5 minutes with at least 50 requests |
| Storefront p95 duration | above 2 seconds for 10 minutes |
| API client failure rate | above 5% for 5 minutes by backend route |
| `auth.session_refresh_failed` | any sustained increase above baseline |
| `http.response_stream_failed` | more than 3 occurrences in 10 minutes |

Use both `requestId` and `traceId` in incident tickets. `X-Request-Id` and `traceparent` are returned to the caller, while vendor-specific `tracestate` remains server-to-server.

## Rollout

1. Deploy a collector and verify its `/v1/traces` receiver before enabling the Storefront endpoint.
2. Enable the exporter in one environment with `STOREFRONT_TRACE_SAMPLE_RATE=1`.
3. Confirm `trace.runtime_initialized` appears once per process.
4. Confirm a Storefront request and its API calls share one trace ID.
5. Watch `trace.queue_full`, `trace.batch_export_attempt_failed` and `trace.batch_export_failed` during load.
6. Apply collector-side tail sampling and retention after baseline traffic is known.
7. Use `OTEL_SDK_DISABLED=true` as the emergency off switch without changing application code.
