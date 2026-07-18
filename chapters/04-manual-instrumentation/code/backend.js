/**
 * Chapter 4 exercise -- backend half. See gateway.js for context.
 * Also zero OpenTelemetry code.
 */
const http = require("http");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = http.createServer(async (req, res) => {
  if (req.url !== "/charge") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (Math.random() < 0.25) {
    await sleep(800);
  } else {
    await sleep(20 + Math.random() * 60);
  }

  res.writeHead(200);
  res.end("charged");
});

server.listen(9001, () => {
  console.log("backend listening on :9001");
});
