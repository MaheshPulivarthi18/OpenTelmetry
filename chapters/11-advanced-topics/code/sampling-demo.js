/**
 * Chapter 11 exercise: head sampling.
 *
 * A TraceIdRatioBasedSampler decides, right when a trace starts, whether
 * to keep it -- roughly SAMPLE_RATIO of all traces, decided from the
 * trace ID itself, so the decision needs nothing remembered between
 * calls.
 *
 * Setup:
 *   cd chapters/11-advanced-topics/code
 *   npm install
 *
 * Run:
 *   node sampling-demo.js
 *
 * What to look for: this fires 20 independent "checkout" traces. Compare
 * the "attempt N" lines this script prints directly (every attempt shows
 * up, sampled or not) against how many FULL SPAN OBJECTS the console
 * exporter prints below them -- only the sampled ones get that far. With
 * SAMPLE_RATIO = 0.2, roughly 4 out of 20 should actually be exported.
 */
const { trace } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");
const {
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
} = require("@opentelemetry/sdk-trace-base");

const SAMPLE_RATIO = 0.2; // keep roughly 20% of traces

const resource = new Resource({ "service.name": "sampling-demo" });

// ParentBasedSampler wraps the ratio sampler: if a span already has a
// remote parent, respect whatever decision was already made upstream so
// a trace doesn't end up half-sampled across services. If it's a new
// root -- every trace in this demo -- fall back to the ratio sampler.
const sampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(SAMPLE_RATIO),
});

const provider = new NodeTracerProvider({ resource, sampler });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter11.sampling-demo");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateCheckout(attempt) {
  return tracer.startActiveSpan("checkout", async (span) => {
    // isRecording() is false the moment the sampler decides to drop this
    // trace. The span object still exists and has a real trace ID (IDs
    // are generated regardless of the sampling decision) -- it just
    // never gets handed to the span processor/exporter below.
    console.log(
      `attempt ${attempt}: trace_id=${span.spanContext().traceId} sampled=${span.isRecording()}`
    );

    await sleep(5);
    span.end();
  });
}

async function main() {
  for (let i = 1; i <= 20; i++) {
    await simulateCheckout(i);
  }
}

main();
