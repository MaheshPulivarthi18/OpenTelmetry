/**
 * Chapter 4 exercise -- gateway half.
 *
 * Zero OpenTelemetry code in this file, on purpose. Every span that shows
 * up when this runs (via `node --require ./tracing.js gateway.js`) comes
 * entirely from auto-instrumentation patching Node's http module before
 * this file ever loaded. Compare this file to Chapter 3's gateway.js /
 * gateway-sdk.js -- same job, no tracer, no startActiveSpan, no manual
 * traceparent header.
 */
const http = require("http");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer(async (req, res) => {
  if (req.url !== "/checkout") {
    res.writeHead(404);
    res.end();
    return;
  }

  await sleep(10 + Math.random() * 40);

  http
    .get("http://localhost:9001/charge", (backendRes) => {
      backendRes.on("data", () => {});
      backendRes.on("end", () => {
        res.writeHead(200);
        res.end("ok");
      });
    })
    .on("error", (err) => {
      res.writeHead(502);
      res.end();
    });
});

server.listen(9000, () => {
  console.log("gateway listening on :9000");
});
