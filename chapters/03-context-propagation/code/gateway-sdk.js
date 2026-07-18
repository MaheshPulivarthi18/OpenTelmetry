/**
 * Chapter 3 exercise, part 2: let the OpenTelemetry SDK build the
 * traceparent header for you, instead of hand-rolling it like part 1
 * (gateway.js / backend.js).
 *
 * Same job as part 1, done by the library: `propagation.inject()` reads
 * the currently active span's context and writes it into a plain object
 * as headers. Compare the header it prints to the one you built by hand --
 * same shape, same idea, just generated instead of typed out.
 *
 * Setup:
 *   cd chapters/03-context-propagation/code
 *   npm install
 *
 * Run (two terminals):
 *   node backend-sdk.js
 *   node gateway-sdk.js
 *   curl localhost:9000/checkout
 */
const http = require("http");
const { trace, context, propagation } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "gateway" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
// register() also installs the default propagator (W3C Trace Context +
// Baggage) globally -- that's what propagation.inject() below uses.
provider.register();

const tracer = trace.getTracer("chapter03.gateway");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer((req, res) => {
  if (req.url !== "/checkout") {
    res.writeHead(404);
    res.end();
    return;
  }

  tracer.startActiveSpan("checkout", async (span) => {
    await sleep(10 + Math.random() * 40);

    // This is the SDK doing exactly what you did by hand in part 1: take
    // the current span's trace ID + span ID and write them into headers.
    const headers = {};
    propagation.inject(context.active(), headers);
    console.log("SDK-generated headers:", headers);

    const backendReq = http.request(
      { hostname: "localhost", port: 9001, path: "/charge", method: "GET", headers },
      (backendRes) => {
        backendRes.on("data", () => {});
        backendRes.on("end", () => {
          span.end();
          res.writeHead(200);
          res.end("ok");
        });
      }
    );
    backendReq.on("error", (err) => {
      span.end();
      res.writeHead(502);
      res.end();
    });
    backendReq.end();
  });
});

server.listen(9000, () => {
  console.log("gateway (SDK version) listening on :9000");
});
