# Chapter 10: Closing the Loop Back to Chapter 1

Status: ✅

## Where we left off

Chapter 1's actual pain was concrete: two log files, no shared ID between them, and once
requests overlapped, no way to correctly pair their lines at all — not just slow, genuinely
impossible. Chapters 2 through 9 built traces and metrics, but the plain log lines from
Chapter 1 never got touched. This chapter is the fix.

## The mechanism: read what's already active

Because of the "active span" tracking `NodeTracerProvider` sets up — the same thing that lets
a child span find its parent automatically across an `await`, since Chapter 2 — code can ask,
at any point, "what trace and span are active right now?" No trace ID needs to be threaded
manually through every function call. A logging function just needs to check what's currently
active at the moment it's called, and stamp that onto the line before writing it out.

```js
function log(level, message) {
  const span = trace.getSpan(context.active());
  const ids = span
    ? `trace_id=${span.spanContext().traceId} span_id=${span.spanContext().spanId}`
    : "trace_id=none span_id=none";
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} [${ids}] ${message}\n`);
}
```

Nothing about how spans get created changes. This is purely reading what's already there.

One honest note: OpenTelemetry's Logs signal is newer and less settled than Traces or
Metrics. Every language already has an established logging library, so OTel's approach here
leans toward "correlate with whatever's already being used," rather than "replace your
logger."

## The exercise

Code: [`code/gateway.js`](code/gateway.js) and [`code/backend.js`](code/backend.js) —
Chapter 1's exact scenario (same log messages, same two-file setup) combined with Chapter 3's
real trace propagation over HTTP. The only change from Chapter 1: `log()` now reads the
active span and stamps `trace_id`/`span_id` onto every line automatically.

```bash
cd chapters/10-logs/code
npm install
node backend.js     # terminal 1
node gateway.js      # terminal 2
curl localhost:9000/checkout   # terminal 3, a few times
```

Or `bash run-demo.sh` to run all of it in one shot, including the final `grep`.

### Real run — 3 requests, then the actual Chapter 1 exercise redone

```
gateway.log
received checkout request   [trace_id=8a29999389ca3fb45e38e8bb2db7f3f4 span_id=9a18c200d9c4aaf4]
calling backend /charge     [trace_id=8a29999389ca3fb45e38e8bb2db7f3f4 span_id=9a18c200d9c4aaf4]
backend call succeeded      [trace_id=8a29999389ca3fb45e38e8bb2db7f3f4 span_id=9a18c200d9c4aaf4]
received checkout request   [trace_id=ff7adc63d167b69ff98a53afc2ff6fd4 span_id=af77b7b56186012d]
...
```

Three requests, three separate trace IDs, each one showing up consistently across every log
line it touched. Picking one trace ID and running:

```bash
grep "trace_id=8a29999389ca3fb45e38e8bb2db7f3f4" gateway.log backend.log
```

returned exactly the 5 lines that belong to that one request — 3 from `gateway.log`, 2 from
`backend.log` — with nothing else mixed in:

```
gateway.log: received checkout request
gateway.log: calling backend /charge
gateway.log: backend call succeeded
backend.log: processing charge
backend.log: charge processed
```

That's Chapter 1's exact original exercise — "given these two log files, find everything that
belongs to one request" — done in one `grep` command instead of manually matching timestamps.
It also would have worked identically if these three requests had fired concurrently and
their lines were completely interleaved across both files, since matching is now by ID, not
by position or proximity in time — the specific thing that made Chapter 1's concurrent test
genuinely unsolvable. The slow-path detail from that same chapter carried through too: the
second request's `payment provider is slow this time` line in `backend.log` shares the exact
same `trace_id` as its neighboring lines, so even that's trivially traceable to the right
request now.

## Does this make raw logs pointless?

No — traces and metrics don't replace logs, they give logs a way to be found. A trace tells
you *that* something happened and roughly what shape the request took. A log line often still
has detail a span attribute wouldn't — a full stack trace, a raw request body, a specific
error message with context that wasn't worth turning into a span attribute. Correlation means
you can jump from "this trace looks wrong" straight to the exact log lines for it, instead of
either tool replacing the other.

## What's left

Chapters 1 through 10 are the core, linear roadmap. Chapter 11 (advanced topics) is the last
one — but it's a reference to pull from as needed, not something with its own single story
the way 1-10 built on each other.
