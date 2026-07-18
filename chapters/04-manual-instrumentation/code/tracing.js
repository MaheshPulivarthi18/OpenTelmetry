/**
 * Chapter 4 exercise: the auto-instrumentation setup.
 *
 * This file's only job is to set up tracing BEFORE the actual app code
 * runs, and then get out of the way. It has to be loaded first, with
 * --require, so it can patch Node's http module before gateway.js or
 * backend.js ever call require("http") themselves.
 *
 * Run (two terminals, both in this code/ folder):
 *   OTEL_SERVICE_NAME=backend node --require ./tracing.js backend.js
 *   OTEL_SERVICE_NAME=gateway node --require ./tracing.js gateway.js
 *   curl localhost:9000/checkout   (third terminal)
 *
 * gateway.js and backend.js have ZERO OpenTelemetry code in them -- no
 * tracer, no startActiveSpan, no manual traceparent header. Every span
 * and the trace-context propagation between them both come entirely from
 * this one file.
 */
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

// OTEL_SERVICE_NAME lets the same tracing.js be reused for both gateway
// and backend, just with a different name tag each time.
const serviceName = process.env.OTEL_SERVICE_NAME || "unknown-service";

const resource = new Resource({ "service.name": serviceName });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

// This is the actual auto-instrumentation step: it patches known
// libraries (Node's own http module included) so every call through them
// automatically gets wrapped in a span, with no code changes needed in
// the files that use them.
registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations()],
});

console.log(`[tracing] auto-instrumentation active, service.name=${serviceName}`);
