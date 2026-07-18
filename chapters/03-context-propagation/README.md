# Chapter 3: Getting a Trace to Survive a Real Network Call

Status: ✅

## Where we left off

Chapter 2's trick — `NodeTracerProvider` keeping track of "which span is active" across an
`await` — only works inside one process. It's using Node's own internal bookkeeping
(`async_hooks`), which lives in that process's memory. The moment the gateway makes a real
HTTP call to a completely separate program (the backend, its own process), that bookkeeping
can't follow. The backend has no idea a trace was already in progress — as far as it knows, a
brand new request just arrived out of nowhere.

So the real question: if the gateway already has a trace ID and a span, how does it hand that
to the backend, given the only thing they share is one HTTP request?

## The answer: put it in a header

The gateway takes its current trace ID and its own span ID, writes them as plain text into a
header on the outgoing request, and sends it like any other header. The backend reads that
header when the request arrives, and instead of starting a new trace, continues the existing
one — making its own span a child of whatever span ID was in that header.

The header is called `traceparent`, and it's a real, existing standard (W3C Trace Context) —
not something OpenTelemetry invented, which is why any tracing tool can read it, not just
OTel. It looks like this:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

Four parts, separated by dashes:

- `00` — version number, basically always `00` today.
- `4bf92f3577b34da6a3ce929d0e0e4736` — the trace ID. Same one for every span in this request.
- `00f067aa0ba902b7` — the span ID of whoever sent this request. The receiver uses this as
  the parent ID for its own new span.
- `01` — a flag, usually just "yes, record this trace."

That's the whole mechanism. No hidden binary format, just a text header carrying the two IDs
from Chapter 2 across the wire.

## Part 1: building the header by hand

Code: [`code/gateway.js`](code/gateway.js) and [`code/backend.js`](code/backend.js). No OTel
SDK here on purpose — the point was to see the raw mechanism before letting a library hide
it. The gateway makes up a trace ID and its own span ID using `crypto.randomBytes`, builds the
`traceparent` string itself, and sends it as a header. The backend parses that header by
splitting on `-`.

```bash
cd chapters/03-context-propagation/code
node backend.js     # terminal 1
node gateway.js     # terminal 2
curl localhost:9000/checkout   # terminal 3
```

Real run:

```
gateway: received checkout request (trace=354a25b0499400ae31b40416227be652 span=7b92f6ed8e996cc2)
gateway: calling backend /charge, sending traceparent: 00-354a25b0499400ae31b40416227be652-7b92f6ed8e996cc2-01

backend: processing charge (trace=354a25b0499400ae31b40416227be652 my_span=025121b0d0930f74 parent=7b92f6ed8e996cc2)
```

Line up the pieces: the backend's `trace` matches the gateway's `trace` exactly. The backend's
`parent` matches the gateway's own `span` exactly. The backend made up its own separate
`my_span` for itself. That's a trace ID and a parent-child link surviving a real process
boundary, built with nothing but a string template and a header.

## Part 2: letting the SDK do it

Code: [`code/gateway-sdk.js`](code/gateway-sdk.js) and
[`code/backend-sdk.js`](code/backend-sdk.js). Same job, done by the library.
`propagation.inject(context.active(), headers)` reads the currently active span's context and
writes it into a plain object as headers — exactly what part 1 did by hand.
`propagation.extract(context.active(), req.headers)` is the reverse: it reads the header and
hands back a context with the sender's span recorded as parent. Running
`tracer.startActiveSpan(...)` inside that extracted context (via `context.with(...)`) is what
makes the new span a real child instead of a new root.

```bash
cd chapters/03-context-propagation/code
npm install
node backend-sdk.js     # terminal 1
node gateway-sdk.js     # terminal 2
curl localhost:9000/checkout   # terminal 3
```

Real run:

```
SDK-generated headers: { traceparent: '00-ced23ff01c96566e1332f182be401363-d3fa0dfbe523aeaa-01' }

checkout span:  traceId: ced23ff01c96566e1332f182be401363   id: d3fa0dfbe523aeaa   parentId: undefined
charge   span:  traceId: ced23ff01c96566e1332f182be401363   id: db8fd5858fe016c5   parentId: d3fa0dfbe523aeaa
```

Same result as part 1 — matching trace ID, `charge`'s `parentId` equal to `checkout`'s `id` —
except this time nobody wrote a template string. `register()` on the provider installs a
default propagator (W3C Trace Context, plus Baggage) globally, and `inject`/`extract` use it
automatically.

## A deeper question that came up: does everything need its own span?

While testing part 2, a slow helper function (`complexTask`, a 1-2 second delay) got added
inside the backend's charge handling. First pass, it just ran inline inside the `charge`
span — which meant its time was real, but invisible as its own thing. `charge`'s total
duration included it, but there was no way to tell how much of that total was `complexTask`
versus anything else. That's the exact same "duration is invisible" problem from Chapter 1,
just one layer further down — inside a span instead of inside a whole log line.

The fix is the same shape as `checkout` → `charge`: call `startActiveSpan` again, wherever
`complexTask` runs, while `charge`'s span is still active. That makes `complexTask` a child
of `charge`, automatically, with its own duration you can see on its own.

```js
async function complexTask() {
  return tracer.startActiveSpan("complexTask", async (span) => {
    await sleep(1000 + Math.random() * 1000);
    span.end();
  });
}
```

The rule of thumb that came out of this: give something its own child span when you'd
actually want to know its duration separately, or want to attach its own attributes/events to
it. A 20ms sleep isn't worth a span. Something that regularly takes over a second — like a
real database query would — almost always is.

## Scratch example: the plumbing on its own

[`code/coffee-shop-demo.js`](code/coffee-shop-demo.js) — not part of the exercise above, just
a minimal standalone script isolating the setup pieces that show up in every file in this
chapter: `Resource` (the name tag for the whole program), `NodeTracerProvider` (the manager
that owns the tracing setup), `addSpanProcessor` (what happens to a span once it ends),
`register()` (the "turn it on" switch), `tracer` (the tool used to actually create spans),
and `startActiveSpan` / the active span (whichever span is currently running is the one any
new span attaches to as a parent, automatically). Worth running once on its own, with
nothing else going on, if any of those pieces still feel fuzzy:

```bash
cd chapters/03-context-propagation/code
node coffee-shop-demo.js
```

## Manual instrumentation, for now

Every span in this chapter — `checkout`, `charge`, `complexTask` — was created by hand, by
calling `startActiveSpan` ourselves. That's fine for logic that's specific to this app, since
no library could know what `complexTask` means. But it raises an obvious question: does
*everything* have to be instrumented this way, one `startActiveSpan` call at a time, even for
ordinary things like a real database query or an HTTP call through a well-known library?

The answer is no — for common, well-known operations (a query through `pg`, an HTTP call, an
Express route), there's usually a pre-built package that wraps them automatically, so spans
show up without writing any `startActiveSpan` calls at all. That's auto-instrumentation, and
it's Chapter 4.

## Questions for Chapter 4

- What is auto-instrumentation actually doing to a library like `pg` or `express` to make
  spans appear with no code changes?
- If auto-instrumentation exists, is manual instrumentation (what this whole chapter did)
  ever still necessary? When?
- Can manual spans (like `complexTask`) and auto-instrumented spans (a real DB call) live in
  the same trace, correctly nested? What does that actually look like?
