/**
 * Chapter 3 exercise, part 2 -- backend half. See gateway-sdk.js for
 * context.
 *
 * `propagation.extract()` is the reverse of `propagation.inject()`: it
 * reads the traceparent header (if present) and hands back a context that
 * has the gateway's span recorded as the parent. Running startActiveSpan()
 * inside that context is what makes the "charge" span here a real child of
 * the gateway's "checkout" span, sharing one trace ID, instead of starting
 * a brand new unrelated trace.
 */
const http = require("http");
const { trace, context, propagation } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "backend" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter03.backend");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function complexTask() {
  // Its own child span: "charge" is already the active span wherever this
  // runs, so startActiveSpan here automatically makes "complexTask" a
  // child of it -- same mechanism as checkout -> charge in Chapter 2.
  return tracer.startActiveSpan("complexTask", async (span) => {
    console.log("complexTask started");
    await sleep(1000 + Math.random() * 1000);
    console.log("complexTask ended");
    span.end();
  });
}
const server = http.createServer((req, res) => {
  if (req.url !== "/charge") {
    res.writeHead(404);
    res.end();
    return;
  }

  // Read whatever trace context was in the incoming headers (if any), and
  // make it the active context for everything inside this callback.
  const extractedContext = propagation.extract(context.active(), req.headers);

  context.with(extractedContext, () => {
    tracer.startActiveSpan("charge", async (span) => {
      if (Math.random() < 0.25) {

        span.addEvent("payment provider is slow this time");
        await sleep(800);
      } else {
        await complexTask();
        await sleep(20 + Math.random() * 60);
      }
      span.end();
      res.writeHead(200);
      res.end("charged");
    });
  });
});

server.listen(9001, () => {
  console.log("backend (SDK version) listening on :9001");
});
