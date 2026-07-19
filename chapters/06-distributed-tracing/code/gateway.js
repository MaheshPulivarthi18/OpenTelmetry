/**
 * Chapter 6 exercise -- gateway half. Same shape as Chapter 3's
 * gateway-sdk.js: calls backend synchronously over HTTP, injecting trace
 * context into the header, same as every earlier chapter.
 *
 * Run (four terminals, in order):
 *   node queue.js
 *   node notifications.js
 *   node backend.js
 *   node gateway.js
 *   curl localhost:9000/checkout   (fifth terminal)
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
provider.register();

const tracer = trace.getTracer("chapter06.gateway");

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

    const headers = {};
    propagation.inject(context.active(), headers);

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
    backendReq.on("error", () => {
      span.end();
      res.writeHead(502);
      res.end();
    });
    backendReq.end();
  });
});

server.listen(9000, () => {
  console.log("gateway listening on :9000");
});
