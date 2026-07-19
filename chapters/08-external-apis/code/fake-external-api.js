/**
 * Chapter 8 exercise: a stand-in for a real third-party API.
 *
 * This deliberately has ZERO OpenTelemetry code, doesn't understand
 * traceparent, and will never show up in any trace itself -- exactly
 * like a real external payment provider or weather API you don't
 * control. It also fails on purpose sometimes, and requires an API key,
 * so the client side has something real to retry against and something
 * real to accidentally leak if it isn't careful.
 *
 * Run:
 *   node fake-external-api.js
 */
const http = require("http");

const API_KEY = "sk_live_super_secret_do_not_leak_12345";

const server = http.createServer((req, res) => {
  if (req.url !== "/v1/payment" || req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  const providedAuth = req.headers["authorization"];
  if (providedAuth !== `Bearer ${API_KEY}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid api key" }));
    return;
  }

  // Fail about 40% of the time, on purpose, so the client has something
  // real to retry.
  if (Math.random() < 0.4) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "service temporarily unavailable" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "approved", confirmation: "conf_98765" }));
});

server.listen(9003, () => {
  console.log("fake external API listening on :9003 (this is NOT instrumented)");
});
