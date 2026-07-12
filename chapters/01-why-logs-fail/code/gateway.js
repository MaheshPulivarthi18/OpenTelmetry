/**
 * Chapter 1 exercise: a tiny "gateway" service that calls a "backend" service.
 * Deliberately has NO tracing, NO request IDs, NO correlation between its logs
 * and the backend's logs. The point is to feel how hard it is to reconstruct
 * "what happened for this one request" from independent log streams.
 *
 * Run (two separate terminals):
 *   node backend.js    -> starts backend on :9001
 *   node gateway.js    -> starts gateway on :9000
 *
 * Then hit it a few times:
 *   curl localhost:9000/checkout
 *
 * Then, using ONLY gateway.log and backend.log, answer:
 *   "How long did this one /checkout request take, end to end
 *    (including the backend call), and why was it slow?"
 */
const http = require("http");
const fs = require("fs");

const LOG_FILE = "gateway.log";

function log(level, message) {
  const line = `${new Date().toISOString()} ${level} ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/checkout") {
    log("INFO", "received checkout request");

    // simulate some gateway-side work before calling the backend
    await sleep(10 + Math.random() * 40);

    log("INFO", "calling backend /charge");
    http
      .get("http://localhost:9001/charge", (backendRes) => {
        backendRes.on("data", () => {});
        backendRes.on("end", () => {
          log("INFO", "backend call succeeded");
          res.writeHead(200);
          res.end("ok");
        });
      })
      .on("error", (err) => {
        log("ERROR", `backend call failed: ${err.message}`);
        res.writeHead(502);
        res.end();
      });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(9000, () => {
  console.log("gateway listening on :9000, logging to gateway.log");
});
