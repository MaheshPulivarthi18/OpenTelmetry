/**
 * Chapter 6 exercise: a tiny in-memory queue, standing in for a real
 * message broker (RabbitMQ, SQS, Kafka, etc). It doesn't know or care
 * about tracing -- it just stores whatever JSON it's given and hands it
 * back out later, in order. The trace context travels inside the message
 * body itself, the same way it traveled inside an HTTP header in
 * Chapter 3.
 *
 * POST /enqueue  body: { ...whatever }   -> stores it, responds immediately
 * GET  /dequeue                          -> returns oldest message and
 *                                           removes it, or 204 if empty
 *
 * Run:
 *   node queue.js
 */
const http = require("http");

const messages = [];

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/enqueue") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      messages.push(JSON.parse(body));
      console.log(`[queue] enqueued, ${messages.length} message(s) waiting`);
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }

  if (req.method === "GET" && req.url === "/dequeue") {
    if (messages.length === 0) {
      res.writeHead(204);
      res.end();
      return;
    }
    const message = messages.shift();
    console.log(`[queue] dequeued, ${messages.length} message(s) left`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(message));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(9002, () => {
  console.log("queue listening on :9002");
});
