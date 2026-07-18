/**
 * Chapter 3 exercise, part 1 -- backend half. See gateway.js for context.
 *
 * Reads the traceparent header off the incoming request, splits it into
 * its 4 parts by hand (no SDK), and logs what it found -- plus makes up
 * its own span id, so you can see it recorded the gateway's span as its
 * parent.
 */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");

const LOG_FILE = "backend.log";

function log(level, message) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newSpanId() {
  return crypto.randomBytes(8).toString("hex");
}

// Split "00-<traceid>-<parentid>-<flags>" into its named parts.
function parseTraceparent(header) {
  if (!header) return null;
  const parts = header.split("-");
  if (parts.length !== 4) return null;
  const [version, traceId, parentId, flags] = parts;
  return { version, traceId, parentId, flags };
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/charge") {
    const incoming = parseTraceparent(req.headers["traceparent"]);
    const mySpanId = newSpanId(); // this request's own span id, on the backend side

    if (incoming) {
      log(
        "INFO",
        `processing charge (trace=${incoming.traceId} my_span=${mySpanId} parent=${incoming.parentId})`
      );
    } else {
      log("WARN", `processing charge with NO traceparent header (my_span=${mySpanId})`);
    }

    if (Math.random() < 0.25) {
      log("INFO", "payment provider is slow this time");
      await sleep(800);
    } else {
      await sleep(20 + Math.random() * 60);
    }

    log("INFO", "charge processed");
    res.writeHead(200);
    res.end("charged");
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(9001, () => {
  console.log("backend listening on :9001, logging to backend.log");
});
