/**
 * Chapter 5 exercise: send spans to a real OpenTelemetry Collector over
 * OTLP, instead of printing them to this process's own console.
 *
 * Same checkout -> charge span tree as Chapter 2. Nothing about how spans
 * are created changes here -- only where they get exported to.
 *
 * Before running this, start the Collector (see ../otel-collector-config.yaml
 * and the chapter README for the docker command). This script sends spans
 * to http://localhost:4318/v1/traces -- the Collector's OTLP HTTP receiver.
 *
 * Setup:
 *   cd chapters/05-collector/code
 *   npm install
 *
 * Run (Collector must already be running):
 *   node spans-demo.js
 *
 * Then look at the TERMINAL RUNNING THE COLLECTOR, not this one -- this
 * script won't print any spans itself anymore. The Collector's "debug"
 * exporter is what prints them, proving the spans actually left this
 * process and arrived somewhere else.
 */
const { trace } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const { NodeTracerProvider, BatchSpanProcessor } = require("@opentelemetry/sdk-trace-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

const resource = new Resource({ "service.name": "checkout-demo" });

const provider = new NodeTracerProvider({ resource });
const exporter = new OTLPTraceExporter({ url: "http://localhost:4318/v1/traces" });

// BatchSpanProcessor, not SimpleSpanProcessor this time -- it collects
// finished spans and sends them to the Collector in batches instead of one
// network call per span. This is Chapter 4's leftover question, answered
// directly: yes, batching is the normal thing to do once spans are going
// over the network instead of just to a local console.
provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer("chapter05.spans-demo");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function charge(orderId) {
  return tracer.startActiveSpan("charge", async (span) => {
    span.setAttribute("order.id", orderId);
    span.setAttribute("payment.provider", "stripe-sim");

    if (Math.random() < 0.25) {
      span.addEvent("payment provider is slow this time");
      await sleep(800);
    } else {
      await sleep(20 + Math.random() * 60);
    }

    span.setAttribute("charge.status", "succeeded");
    span.end();
  });
}

async function main() {
  const orderId = "ord_12345";

  await tracer.startActiveSpan("checkout", async (root) => {
    root.setAttribute("order.id", orderId);
    root.setAttribute("http.route", "/checkout");

    await sleep(10 + Math.random() * 40);
    await charge(orderId);

    root.end();
  });

  // Force the batch processor to flush now -- this script exits right
  // after main() finishes, and batching normally waits a bit before
  // sending, so without this the process could exit before the spans
  // are actually sent.
  await provider.shutdown();
  console.log("done -- check the Collector's terminal for the spans");
}

main();
