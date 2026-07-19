/**
 * Chapter 7 exercise: real SQLite queries, each as its own span, with
 * connection-pool wait time captured as a SEPARATE span from the query
 * itself. See the README for why that split matters.
 *
 * Setup:
 *   cd chapters/07-database-instrumentation/code
 *   npm install
 *
 * Run:
 *   node db-demo.js
 *
 * What to look for: this fires 4 lookups at once against a pool that only
 * has 2 slots. 2 of them should get a connection instantly (their
 * "db.connection.acquire" span duration near 0), and 2 should show real
 * wait time on that same span, because they had to wait for one of the
 * first two to finish and release its connection.
 */
const path = require("path");
const Database = require("better-sqlite3");
const { trace } = require("@opentelemetry/api");
const { Resource } = require("@opentelemetry/resources");
const {
  NodeTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require("@opentelemetry/sdk-trace-node");

const resource = new Resource({ "service.name": "db-demo" });
const provider = new NodeTracerProvider({ resource });
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer("chapter07.db-demo");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- a real SQLite database, on disk, set up once ---
const db = new Database(path.join(__dirname, "demo.sqlite"));
db.exec(`
  DROP TABLE IF EXISTS users;
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
  INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
  INSERT INTO users (name, email) VALUES ('Carol', 'carol@example.com');
`);

// --- a small fake connection pool: only POOL_SIZE "connections" available
// at once, on purpose, so some requests genuinely have to wait for one.
// A real pool (pg-pool, etc.) does this job for real network connections;
// this is a stand-in so the concept is visible without a real DB server.
const POOL_SIZE = 2;
let inUse = 0;
const waiters = [];

function acquireConnection() {
  if (inUse < POOL_SIZE) {
    inUse++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseConnection() {
  if (waiters.length > 0) {
    const next = waiters.shift();
    next();
  } else {
    inUse--;
  }
}

async function getUserById(id) {
  return tracer.startActiveSpan(`getUserById(${id})`, async (rootSpan) => {
    // Span 1: waiting for a free connection. If the pool has room, this
    // is near-instant. If not, its duration IS the real wait time --
    // separate from how long the query itself takes.
    await tracer.startActiveSpan("db.connection.acquire", async (acquireSpan) => {
      await acquireConnection();
      acquireSpan.end();
    });

    // Span 2: the actual query, as its own step, with standard attributes.
    const row = await tracer.startActiveSpan("db.query", async (span) => {
      span.setAttribute("db.system", "sqlite");
      span.setAttribute("db.operation", "SELECT");
      // Parameterized -- "?" placeholder, not the real id spliced into
      // the string. See the README for why that distinction matters.
      span.setAttribute("db.statement", "SELECT * FROM users WHERE id = ?");

      await sleep(10 + Math.random() * 40); // pretend this query is a bit slow
      const result = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

      span.end();
      return result;
    });

    releaseConnection();
    rootSpan.end();
    return row;
  });
}

async function main() {
  const results = await Promise.all([
    getUserById(1),
    getUserById(2),
    getUserById(3),
    getUserById(1),
  ]);
  console.log("results:", results);
}

main();
