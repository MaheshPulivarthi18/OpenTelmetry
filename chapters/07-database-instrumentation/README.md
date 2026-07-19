# Chapter 7: What Does a Database Call Look Like as a Span?

Status: ✅

## Where we left off

Same decision rule as always: is this worth seeing on its own? A database query almost
always is. But there's a specific detail with DB calls that makes a single span not quite
enough.

## Connection pool wait vs the query itself

Code that talks to a database usually isn't opening a brand new connection every time — it
asks a **pool** of already-open connections for a free one. If one's free, that's instant. If
they're all busy, the code waits in line until one frees up. That waiting is real time, but
it's a completely different problem than a slow query. Lump both into one span and there's no
way to tell "was this slow because the query itself was slow, or because we were stuck
waiting for a free connection while the database sat idle the whole time?" Same lesson as
`complexTask` back in Chapter 3, just specific to databases — which is why connection
acquisition normally gets its own span, separate from the query span.

## What attributes matter on a DB span

By convention: `db.system` (which kind of database — postgresql, sqlite, redis, etc.),
`db.operation` (SELECT/INSERT/UPDATE/DELETE), and `db.statement` (the query text). One thing
worth being careful about with `db.statement`: if a query has real values spliced directly
into the string — `SELECT * FROM users WHERE ssn = '123-45-6789'` — that value now lives in
the tracing system too, which usually doesn't have the same access controls as the actual
database. That's why queries are normally captured in their **parameterized** form —
`SELECT * FROM users WHERE id = ?`, placeholders instead of real values — so the recorded
span attribute never leaks actual data.

## The exercise

Code: [`code/db-demo.js`](code/db-demo.js) — a real SQLite database on disk (via
`better-sqlite3`), plus a small fake connection pool sized to exactly 2 slots, on purpose, so
some requests genuinely have to wait for a connection. `getUserById(id)` wraps the whole
lookup in a root span, with `db.connection.acquire` and `db.query` as two separate child
spans underneath it.

```bash
cd chapters/07-database-instrumentation/code
npm install
node db-demo.js
```

The script fires 4 lookups at once via `Promise.all`, against a pool with only 2 slots.

### Real run

`db.connection.acquire` duration, for each of the 4 calls:

```
getUserById(1)  ->  294.958   microseconds  (~0.3ms  -- pool had a free slot)
getUserById(2)  ->  4241.792  microseconds  (~4.2ms  -- still basically instant)
getUserById(3)  ->  19227.417 microseconds  (~19.2ms -- had to wait)
getUserById(1)  ->  30012.333 microseconds  (~30ms   -- waited even longer)
```

The first two requests grabbed a connection immediately, since the pool had 2 free slots. The
last two genuinely sat there until one of the first two finished its query and released its
connection — real wait time, not simulated, now visible as its own number instead of buried
inside one bigger "how long did this whole thing take" span.

Compare that to the four `db.query` durations for the same calls — roughly 14-29ms each,
with no relationship to the acquire pattern above, since query time is governed by the
query's own (artificial, in this demo) delay, not by pool contention. One combined span
couldn't have told those two causes apart. Splitting them answers "was it the database or the
pool" directly, without guessing.

Each of the 4 calls produced its own trace (since nothing wrapped the whole `Promise.all` in
a shared parent), and inside each one, both `db.connection.acquire` and `db.query` correctly
show the matching `getUserById(N)` root span as their parent — same check as every earlier
chapter, just with three spans this time instead of two.

## Questions for Chapter 8

- Everything instrumented so far has been either app logic, an internal database, or a queue
  fully under this system's control. What changes when the thing being called is a
  third-party API that isn't instrumented at all?
- What's the right way to represent retries and backoff in a trace — separate spans, or
  events on one span?
- How do you avoid an API key or auth token ending up in a span attribute by accident?
