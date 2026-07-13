/**
 * Chapter 2 exercise.
 *
 * This redoes the checkout -> charge flow from Chapter 1, but instead of two
 * plain log lines, it creates two SPANS: a "checkout" span (the parent) and
 * a "charge" span (the child). Both spans share one trace ID. The charge
 * span records its parent's ID directly. Both spans have a real start time
 * and end time, so duration is a fact you get for free, not something you
 * compute by hand from two separate log lines.
 *
 * This is one process only, no network calls, on purpose -- the point right
 * now is just to see the shape of a trace: one trace ID, a root span, a
 * child span, and how they connect. Sending a trace ID across a real network
 * call (gateway -> backend) is Chapter 3.
 *
 * Setup:
 *   cd chapters/02-traces-and-spans/code
 *   npm install
 *
 * Run:
 *   node spans-demo.js
 *
 * What to look for in the printed output (there will be two blocks, one per
 * span):
 *   - both spans have the same "trace_id"
 *   - the "charge" span's "parent_id" matches the "checkout" span's "span_id"
 *   - each span has its own "duration" -- no manual subtraction needed
 *   - the "charge" span sometimes has an "events" entry for the slow case,
 *     same as the "payment provider is slow this time" log line from
 *     Chapter 1, but now attached directly to the span it happened in
 */
const { trace } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "checkout-demo" });

// NodeTracerProvider (not the generic BasicTracerProvider) is what wires up
// Node's async_hooks so the "currently active span" survives across
// `await` boundaries. Without it, startActiveSpan() loses track of the
// parent every time an `await` runs, and each span ends up as its own
// unrelated root -- which is exactly the bug you just saw.
const provider = new NodeTracerProvider({ resource });
// SimpleSpanProcessor exports each span the moment it ends -- easier to
// read step by step than the batching processor we'll use from Chapter 5
// onward, once there's a real collector to batch spans up for.
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter02.spans-demo");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function charge(orderId) {
  // Because this runs inside "checkout"'s active span (see startActiveSpan
  // below), the SDK sets this span's parent automatically. Nothing here
  // sets a parent ID by hand.
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

  // The root span -- it has no parent, because nothing is "active" yet
  // when it starts.
  await tracer.startActiveSpan("checkout", async (root) => {
    root.setAttribute("order.id", orderId);
    root.setAttribute("http.route", "/checkout");

    await sleep(10 + Math.random() * 40); // gateway-side work
    await charge(orderId);

    root.end();
  });
}

main();
