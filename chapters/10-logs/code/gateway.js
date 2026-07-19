/**
 * Chapter 10 exercise -- gateway half.
 *
 * Same job as Chapter 1's gateway.js (log to a file, one line per event)
 * combined with Chapter 3's gateway-sdk.js (real trace propagation over
 * HTTP). The difference: every log line now automatically carries the
 * CURRENT trace_id/span_id, read from whatever span happens to be active
 * at the moment log() is called -- nothing is passed in manually.
 *
 * Setup:
 *   cd chapters/10-logs/code
 *   npm install
 *
 * Run (two terminals):
 *   node backend.js
 *   node gateway.js
 *   curl localhost:9000/checkout   (a few times, third terminal)
 *
 * Then, instead of manually pairing lines by timestamp like Chapter 1:
 *   grep "trace_id=<one of the ids printed>" gateway.log backend.log
 */
const http = require("http");
const fs = require("fs");
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
provider.register();

const tracer = trace.getTracer("chapter10.gateway");

const LOG_FILE = "gateway.log";

// The whole trick: read whatever span is active RIGHT NOW, and stamp its
// trace_id/span_id onto the log line. No trace ID is ever passed into
// log() manually -- it's read from context, same mechanism that lets a
// child span find its parent automatically.
function log(level, message) {
  const span = trace.getSpan(context.active());
  const ids = span
    ? `trace_id=${span.spanContext().traceId} span_id=${span.spanContext().spanId}`
    : "trace_id=none span_id=none";
  const line = `${new Date().toISOString()} ${level} [${ids}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

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
    log("INFO", "received checkout request");

    await sleep(10 + Math.random() * 40);

    const headers = {};
    propagation.inject(context.active(), headers);

    log("INFO", "calling backend /charge");
    const backendReq = http.request(
      { hostname: "localhost", port: 9001, path: "/charge", method: "GET", headers },
      (backendRes) => {
        backendRes.on("data", () => {});
        backendRes.on("end", () => {
          log("INFO", "backend call succeeded");
          span.end();
          res.writeHead(200);
          res.end("ok");
        });
      }
    );
    backendReq.on("error", (err) => {
      log("ERROR", `backend call failed: ${err.message}`);
      span.end();
      res.writeHead(502);
      res.end();
    });
    backendReq.end();
  });
});

server.listen(9000, () => {
  console.log("gateway listening on :9000, logging to gateway.log");
});
