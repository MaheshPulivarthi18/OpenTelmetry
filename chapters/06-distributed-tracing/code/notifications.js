/**
 * Chapter 6 exercise -- the notifications worker.
 *
 * Polls the queue on its own schedule, completely decoupled in time from
 * whoever enqueued a message. When it finds one, it extracts whatever
 * trace context was packed into the message body (Chapter 3's extract(),
 * just reading from a message instead of an HTTP header) and continues
 * that same trace with a CONSUMER span -- even though in a real system
 * this could be running seconds or minutes after the message was sent.
 *
 * Run:
 *   node notifications.js
 */
const http = require("http");
const { trace, context, propagation, SpanKind } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "notifications" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter06.notifications");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dequeue() {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "localhost", port: 9002, path: "/dequeue" }, (res) => {
        if (res.statusCode === 204) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(JSON.parse(body)));
      })
      .on("error", reject);
  });
}

async function poll() {
  const message = await dequeue();

  if (message) {
    // Extract whatever trace context was packed into the message body,
    // then make it the active context -- same as Chapter 3's HTTP
    // version, just reading from a message instead of a header.
    const extractedContext = propagation.extract(context.active(), message);

    await new Promise((resolve) => {
      context.with(extractedContext, () => {
        tracer.startActiveSpan(
          "send-email-receipt",
          { kind: SpanKind.CONSUMER },
          async (span) => {
            span.setAttribute("order.id", message.orderId);
            console.log(`[notifications] sending receipt for order ${message.orderId}`);
            await sleep(50 + Math.random() * 100);
            span.end();
            resolve();
          }
        );
      });
    });
  }

  // Poll again in 2 seconds either way -- this delay is what makes the
  // time gap between backend enqueueing and notifications actually
  // processing it visible and real, not simulated.
  setTimeout(poll, 2000);
}

console.log("notifications worker started, polling every 2s");
poll();
