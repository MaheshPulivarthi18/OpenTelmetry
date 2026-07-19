/**
 * Chapter 10 exercise -- backend half. See gateway.js for context.
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

const resource = new Resource({ "service.name": "backend" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter10.backend");

const LOG_FILE = "backend.log";

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
  if (req.url !== "/charge") {
    res.writeHead(404);
    res.end();
    return;
  }

  const extractedContext = propagation.extract(context.active(), req.headers);

  context.with(extractedContext, () => {
    tracer.startActiveSpan("charge", async (span) => {
      log("INFO", "processing charge");

      if (Math.random() < 0.25) {
        log("INFO", "payment provider is slow this time");
        await sleep(800);
      } else {
        await sleep(20 + Math.random() * 60);
      }

      log("INFO", "charge processed");
      span.end();
      res.writeHead(200);
      res.end("charged");
    });
  });
});

server.listen(9001, () => {
  console.log("backend listening on :9001, logging to backend.log");
});
