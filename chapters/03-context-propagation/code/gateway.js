/**
 * Chapter 3 exercise, part 1: hand-roll a traceparent header.
 *
 * No OpenTelemetry SDK here on purpose. The point is to see the actual
 * mechanism -- a plain text header -- before a library hides it from you.
 *
 * This is the gateway/backend pair from Chapter 1, but now the gateway
 * makes up a trace ID and its own span ID, packs them into a `traceparent`
 * header exactly like the W3C Trace Context spec describes, and sends it
 * on the outgoing request to the backend.
 *
 * Run (two terminals, both in this code/ folder):
 *   node backend.js
 *   node gateway.js
 *   curl localhost:9000/checkout
 *
 * Then check gateway.log and backend.log:
 *   - gateway logs the traceparent it SENT
 *   - backend logs the traceparent it RECEIVED, split into its 4 parts
 *   - the trace ID should match in both files
 *   - the "parent" the backend sees should match the span id the gateway
 *     logged for itself
 */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");

const LOG_FILE = "gateway.log";

function log(level, message) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A trace ID is 16 random bytes, written out as 32 hex characters.
function newTraceId() {
  return crypto.randomBytes(16).toString("hex");
}

// A span ID is 8 random bytes, written out as 16 hex characters.
function newSpanId() {
  return crypto.randomBytes(8).toString("hex");
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/checkout") {
    const traceId = newTraceId();
    const spanId = newSpanId(); // this request's own span id, on the gateway side
    log("INFO", `received checkout request (trace=${traceId} span=${spanId})`);

    await sleep(10 + Math.random() * 40);

    // Build the traceparent header by hand: version-traceid-spanid-flags
    const traceparent = `00-${traceId}-${spanId}-01`;
    log("INFO", `calling backend /charge, sending traceparent: ${traceparent}`);

    const backendReq = http.request(
      {
        hostname: "localhost",
        port: 9001,
        path: "/charge",
        method: "GET",
        headers: { traceparent },
      },
      (backendRes) => {
        backendRes.on("data", () => {});
        backendRes.on("end", () => {
          log("INFO", "backend call succeeded");
          res.writeHead(200);
          res.end("ok");
        });
      }
    );
    backendReq.on("error", (err) => {
      log("ERROR", `backend call failed: ${err.message}`);
      res.writeHead(502);
      res.end();
    });
    backendReq.end();
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(9000, () => {
  console.log("gateway listening on :9000, logging to gateway.log");
});
