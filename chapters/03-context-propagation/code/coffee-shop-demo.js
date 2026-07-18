/**
 * Scratch example -- not part of the Chapter 3 exercise itself, just a
 * minimal, standalone script to see Resource / Provider / SpanProcessor /
 * active span in isolation, with nothing else going on.
 *
 * Uses the same dependencies already installed in this code/ folder, so no
 * extra `npm install` needed.
 *
 * Run:
 *   node coffee-shop-demo.js
 */
const { trace } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

// 1. Resource -- the name tag for this whole program.
const resource = new Resource({ "service.name": "coffee-shop" });

// 2. Provider -- the manager that owns the tracing setup.
const provider = new NodeTracerProvider({ resource });

// 3. addSpanProcessor -- "whenever a span finishes, hand it to this."
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

// 4. register -- the "turn it on" switch.
provider.register();

// 5. tracer -- the tool you actually call to create spans.
const tracer = trace.getTracer("coffee-shop-tracer");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function grindBeans() {
  // Started while "make-coffee" is still active below, so this
  // automatically becomes its child.
  return tracer.startActiveSpan("grind-beans", async (span) => {
    await sleep(50);
    span.end();
  });
}

async function main() {
  // 6. startActiveSpan / active span.
  await tracer.startActiveSpan("make-coffee", async (span) => {
    console.log("making coffee...");
    await grindBeans();
    await sleep(100);
    span.end();
  });
}

main();
