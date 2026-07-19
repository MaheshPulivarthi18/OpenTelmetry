/**
 * Chapter 8 exercise: calling a third-party API, with retries, without
 * leaking the API key into any span attribute.
 *
 * Two things to check in the output:
 *  1. Each retry attempt gets its own CLIENT span, all children of one
 *     wrapping "call-payment-api" span -- so you can see exactly how
 *     many attempts happened and each one's own status code.
 *  2. NONE of those spans' attributes contain the real API key, even
 *     though the actual HTTP request DOES send it (in the Authorization
 *     header) -- because the code is deliberate about which fields get
 *     copied onto a span and which don't.
 *
 * Setup:
 *   cd chapters/08-external-apis/code
 *   npm install
 *
 * Run (two terminals):
 *   node fake-external-api.js
 *   node client.js
 */
const http = require("http");
const { trace, SpanKind, SpanStatusCode } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "payment-client" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter08.client");

const API_KEY = "sk_live_super_secret_do_not_leak_12345";
const MAX_ATTEMPTS = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function callPaymentApiOnce(attempt) {
  return new Promise((resolve) => {
    tracer.startActiveSpan("POST /v1/payment", { kind: SpanKind.CLIENT }, (span) => {
      // Deliberate allowlist: only safe, non-secret fields go on the
      // span. The real API key IS sent on the actual request below --
      // it just never gets copied onto anything that gets exported.
      span.setAttribute("http.method", "POST");
      span.setAttribute("http.url", "http://localhost:9003/v1/payment");
      span.setAttribute("retry.attempt", attempt);

      const req = http.request(
        {
          hostname: "localhost",
          port: 9003,
          path: "/v1/payment",
          method: "POST",
          headers: {
            // The real secret goes out over the wire, same as any real
            // API call -- it just never touches span.setAttribute.
            Authorization: `Bearer ${API_KEY}`,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            span.setAttribute("http.status_code", res.statusCode);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              span.setStatus({ code: SpanStatusCode.OK });
            } else {
              span.setStatus({ code: SpanStatusCode.ERROR });
            }
            span.end();
            resolve({ statusCode: res.statusCode, body });
          });
        }
      );
      req.end();
    });
  });
}

async function callPaymentApiWithRetries() {
  return tracer.startActiveSpan("call-payment-api", async (parentSpan) => {
    let lastResult;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      attemptsMade = attempt;
      lastResult = await callPaymentApiOnce(attempt);

      if (lastResult.statusCode < 500) break; // success, or a non-retryable error

      if (attempt < MAX_ATTEMPTS) {
        await sleep(100 * attempt); // simple linear backoff
      }
    }

    parentSpan.setAttribute("retry.total_attempts", attemptsMade);
    parentSpan.end();
    return lastResult;
  });
}

async function main() {
  const result = await callPaymentApiWithRetries();
  console.log("final result:", result);
}

main();
