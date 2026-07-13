# Chapter 2: Spans, Traces, and How They Fix Chapter 1

Status: ✅

## Where we left off

Chapter 1 ended with a real problem: log lines have no shared ID, and no real duration —
just a single timestamp. When two requests happen at the same time, there's no way to tell
which lines belong together. This chapter is the fix for that.

## Trace: one ID for everything that happened for one request

A **trace** is just one ID, created the moment a request starts, and passed along to every
piece of work that happens because of it. If the gateway makes up a trace ID when it gets a
`/checkout` request, and hands that same ID to the backend when it calls `/charge`, then every
step on both sides can be tagged with it.

Think back to the concurrent test from Chapter 1 — three requests came in within 1
millisecond of each other, and there was no way to tell which "calling backend" line matched
which "received" line. If each of those three requests had carried its own trace ID from the
start, that problem goes away completely. You just filter by ID, and everything for that one
request shows up. No guessing.

## Span: one step, with a real start and end time

A **span** is one step inside a trace. This is the other half of the fix. A log line is one
point in time. A span has a start time *and* an end time — a real duration. So instead of two
separate log lines you have to subtract by hand, you get one number: "this step took 852ms,"
already computed for you.

## Parent-child: how spans record cause and effect

Spans can point to each other. If "checkout" is one span, and "charge" is a second span that
only happens because of "checkout," the "charge" span records "checkout" as its parent. Do
this for every step, and a trace becomes a tree: one root step, and everything it caused,
and everything that caused, and so on.

This is the fix for Chapter 1's other problem — cause and effect wasn't visible before,
because nothing recorded which step caused which. A parent link is exactly that record.

## Attributes and events: structured detail

A span can also carry small labeled facts, called **attributes** — like `order.id: 12345` or
`payment.provider: stripe`. These are structured, so you can search and filter on them later,
instead of grepping through free text and hoping the log format never changes.

An **event** is something that happened *during* a span, worth noting but not big enough to
be its own separate step — like "payment provider is slow this time." It's attached directly
to the span it happened in, instead of floating in a log file with no connection to anything.

## The exercise

Code: [`code/spans-demo.js`](code/spans-demo.js) — one Node.js process, no network calls yet
(sending a trace ID across a real network call is Chapter 3). It builds a `checkout` span and
a `charge` span, using the OpenTelemetry Node SDK, and prints both to the console so you can
see the actual shape of a trace.

```bash
cd chapters/02-traces-and-spans/code
npm install
node spans-demo.js
```

### A real bug I ran into, worth knowing about

The first version of this script used `BasicTracerProvider`, and it was broken in a subtle
way: every run produced two spans with two *different* trace IDs, and neither had a parent.
That's wrong — `charge` should always be a child of `checkout`, sharing one trace ID.

The reason: `BasicTracerProvider` is a generic provider. It doesn't know how to keep track of
"which span is currently active" across an `await`. Every time the code did `await
sleep(...)`, Node handed control back to the event loop, and the provider lost track of what
was active before that pause. So by the time the `charge` span was created, there was nothing
to attach it to, and it started a brand new trace instead of continuing the old one.

The fix: use `NodeTracerProvider` instead. It's the Node-specific version, and it hooks into
Node's own async tracking (`async_hooks`) so "what span is active" survives across `await`,
`setTimeout`, promises — anything async. This matters beyond just fixing a bug: it's a
preview of Chapter 3's real subject, which is how a trace stays connected across boundaries
(first across `await` inside one process, later across an actual network call between two
processes).

### Real output, after the fix

```
{
  traceId: 'da0edcf085107cdefe5e9f429df91dcd',
  parentId: '9239a7b2303fd4ed',
  name: 'charge',
  id: '1d0ed8dd98453ad6',
  duration: 25178.791,
  attributes: {
    'order.id': 'ord_12345',
    'payment.provider': 'stripe-sim',
    'charge.status': 'succeeded'
  },
  events: []
}
{
  traceId: 'da0edcf085107cdefe5e9f429df91dcd',
  parentId: undefined,
  name: 'checkout',
  id: '9239a7b2303fd4ed',
  duration: 78325.833,
  attributes: { 'order.id': 'ord_12345', 'http.route': '/checkout' },
  events: []
}
```

Three things to check in output like this:

1. Both spans have the **same `traceId`** — they belong to one request.
2. `charge`'s `parentId` (`9239a7b2...`) matches `checkout`'s `id` (`9239a7b2...`) exactly —
   that's the parent-child link.
3. `checkout` has no `parentId` — it's the root of the tree.

The durations are real too. `charge` took about 25ms here (the fast path — no `events` entry,
so the simulated slow payment provider wasn't hit this run). `checkout` took about 78ms
total: roughly 49ms of gateway-side work before `charge` even started, plus the 25ms for
`charge` itself. Nobody subtracted two timestamps by hand to get those numbers — the span
just knows its own duration.

Run it a few times and you'll eventually see a run where `charge`'s `events` array has an
entry like `payment provider is slow this time` — that's the same information as the log
line from Chapter 1, except now it's attached directly to the exact step it happened in,
instead of sitting in a separate file with nothing connecting it back.

## Questions for Chapter 3

- Chapter 2 kept everything in one process, connected across `await` by `NodeTracerProvider`.
  How does the same trace ID and parent span ID actually survive a real network call, from
  one service to another?
- What does that look like on the wire — is it a header, and if so, what's actually inside
  it?
- What happens if the service on the other end doesn't understand it at all?
