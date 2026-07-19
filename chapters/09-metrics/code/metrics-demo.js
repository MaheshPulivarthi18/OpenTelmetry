/**
 * Chapter 9 exercise: a Counter and a Histogram, with good (low-cardinality)
 * labels, PLUS a deliberate demonstration of what a bad, high-cardinality
 * label does to the same kind of metric.
 *
 * Setup:
 *   cd chapters/09-metrics/code
 *   npm install
 *
 * Run:
 *   node metrics-demo.js
 *
 * What to look for in the printed output: "checkout.requests" (the GOOD
 * counter, labeled by route + status_code) should print just a couple of
 * data points -- one per unique combination of those two labels, which is
 * a small, bounded set. "checkout.requests.bad_cardinality" (labeled by
 * order_id, which is different on every call) should print one data point
 * PER REQUEST -- 20 separate series carrying the exact same information
 * the good counter captured in 2-3.
 */
const { metrics } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  MeterProvider,
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} = require("@opentelemetry/sdk-metrics");

const resource = new Resource({ "service.name": "checkout-metrics-demo" });

const reader = new PeriodicExportingMetricReader({
  exporter: new ConsoleMetricExporter(),
  exportIntervalMillis: 2000,
});

const meterProvider = new MeterProvider({ resource, readers: [reader] });
metrics.setGlobalMeterProvider(meterProvider);

const meter = metrics.getMeter("chapter09.metrics-demo");

// GOOD: route + status_code. Both are small, bounded sets of possible
// values -- there's one route here, and only ever a couple of status
// codes. No matter how many requests come in, the number of distinct
// label combinations stays tiny.
const requestCounter = meter.createCounter("checkout.requests", {
  description: "total checkout requests, labeled by route + status_code",
});

// A Histogram for duration -- lets percentiles get computed later,
// instead of just an average that hides outliers.
const requestDuration = meter.createHistogram("checkout.duration", {
  description: "checkout request duration",
  unit: "ms",
});

// BAD: labeled by order_id on purpose, to show what happens. Do not do
// this in a real system -- see the README for why.
const badRequestCounter = meter.createCounter("checkout.requests.bad_cardinality", {
  description: "same information as checkout.requests, but labeled by order_id -- do not do this",
});

function simulateCheckout(orderId) {
  const statusCode = Math.random() < 0.9 ? 200 : 500;
  const durationMs = 20 + Math.random() * 200;

  requestCounter.add(1, { route: "/checkout", status_code: statusCode });
  requestDuration.record(durationMs, { route: "/checkout", status_code: statusCode });

  // order_id is different on every single call -- watch what this does
  // to the printed output below, compared to the counter above.
  badRequestCounter.add(1, { route: "/checkout", order_id: orderId });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("simulating 20 checkout requests...");
  for (let i = 1; i <= 20; i++) {
    simulateCheckout(`ord_${1000 + i}`);
  }

  console.log("waiting for the metrics export cycle...");
  await sleep(2500);

  await meterProvider.shutdown();
}

main();
