/**
 * Chapter 6 exercise -- backend half.
 *
 * Same charge logic as earlier chapters, but after charging, instead of
 * calling notifications directly, it drops a "send-receipt" message onto
 * the queue and does NOT wait for it to be processed. That's the defining
 * feature of a PRODUCER span: fire, and move on.
 *
 * The trace context gets injected into the message body itself -- same
 * propagation.inject() from Chapter 3, just writing into a JSON object
 * instead of an HTTP header.
 */
const http = require("http");
const { trace, context, propagation, SpanKind } = require("@opentelemetry/api");
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

const tracer = trace.getTracer("chapter06.backend");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueReceipt(orderId) {
  // A PRODUCER span: sending a message onto a queue, not waiting for a
  // direct reply, same idea as CLIENT/SERVER from Chapter 4 but for
  // fire-and-forget messaging instead of request/response.
  return tracer.startActiveSpan("send-receipt", { kind: SpanKind.PRODUCER }, (producerSpan) => {
    return new Promise((resolve) => {
      const message = { orderId };
      // Inject while the PRODUCER span is active, so whoever reads this
      // message later becomes ITS child, not "charge"'s child directly.
      propagation.inject(context.active(), message);

      const body = JSON.stringify(message);
      const req = http.request(
        {
          hostname: "localhost",
          port: 9002,
          path: "/enqueue",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => {
            producerSpan.end();
            resolve();
          });
        }
      );
      req.end(body);
    });
  });
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
      if (Math.random() < 0.25) {
        span.addEvent("payment provider is slow this time");
        await sleep(800);
      } else {
        await sleep(20 + Math.random() * 60);
      }

      await enqueueReceipt("ord_12345");

      span.end();
      res.writeHead(200);
      res.end("charged");
    });
  });
});

server.listen(9001, () => {
  console.log("backend listening on :9001");
});
