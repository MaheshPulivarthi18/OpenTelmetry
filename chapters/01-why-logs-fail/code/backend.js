/**
 * Chapter 1 exercise: the "backend" half. See gateway.js for the point of this.
 * Independent log file, independent clock reference, no shared request ID.
 * Occasionally slow, to make the "why was it slow" question non-trivial.
 */
const http = require("http");
const fs = require("fs");

const LOG_FILE = "backend.log";

function log(level, message) {
  const line = `${new Date().toISOString()} ${level} ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/charge") {
    log("INFO", "processing charge");

    // simulate a slow downstream dependency (e.g. a payment provider)
    // on roughly 1 in 4 requests, so the slowness is intermittent
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
