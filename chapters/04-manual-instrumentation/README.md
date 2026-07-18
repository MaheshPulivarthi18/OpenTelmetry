# Chapter 4: Instrumenting Things Without Writing the Span Code Yourself

Status: ✅

## Where we left off

Every span so far — `checkout`, `charge`, `complexTask`, `grind-beans` — was created by hand,
calling `startActiveSpan` ourselves. That's fine for logic that's specific to an app, since no
library could know what `complexTask` means. But it raises an obvious question: does a real
app really need someone to add that call everywhere, even for totally ordinary things like an
HTTP call?

No. That's auto-instrumentation.

## How it actually works

Someone has already written a package that knows the internals of common libraries — Node's
own `http` module, `express`, `pg`, and many others. When your app starts, before your own
code runs, that package reaches into those libraries and swaps in a modified version — one
that automatically creates a span around every call, before your code even touches it. Your
code calls the library exactly the same way it always did; it has no idea anything changed.
Spans just start appearing.

The specific mechanism in Node: it hooks into `require()` itself. Every time any code does
`require('http')`, the auto-instrumentation package intercepts that and hands back its patched
version instead of the real one. This is why timing matters — the setup has to run **before**
the app requires anything it wants to patch. In practice, that means starting Node with a flag
that loads the tracing setup first, before the actual app code runs at all:

```bash
node --require ./tracing.js gateway.js
```

What auto-instrumentation can't do: it has no idea what `complexTask` is, or what "checkout"
means in your app. It only knows about the specific libraries it was written for. In a real
app, both live together — auto-instrumentation covers the common stuff (HTTP, DB, routing)
for free, and manual spans still cover the business logic that's actually yours.

## The exercise

Code: [`code/tracing.js`](code/tracing.js), [`code/gateway.js`](code/gateway.js),
[`code/backend.js`](code/backend.js). `gateway.js` and `backend.js` are the plain HTTP
services from Chapter 1 again — **zero OpenTelemetry code in either file.** All of the tracing
setup lives in `tracing.js`, loaded separately via `--require` so it patches Node's `http`
module before `gateway.js`/`backend.js` ever call `require("http")` themselves.

```bash
cd chapters/04-manual-instrumentation/code
npm install

# terminal 1
OTEL_SERVICE_NAME=backend node --require ./tracing.js backend.js

# terminal 2
OTEL_SERVICE_NAME=gateway node --require ./tracing.js gateway.js

# terminal 3
curl localhost:9000/checkout
```

### Real output

Three spans came out of one `curl` call, all sharing one `traceId` (`31a35dc0e32649d7a39954e22000b8c1`):

```
curl -> gateway         id: e8fbdebf...   parentId: undefined     kind: 1 (SERVER)
gateway -> backend      id: afc77f0f...   parentId: e8fbdebf...   kind: 2 (CLIENT)
backend receives call   id: 7410147...    parentId: afc77f0f...   kind: 1 (SERVER)
```

The root span (`e8fbdebf...`) has no parent because `curl` never sends a `traceparent` header
— the trace genuinely starts there. The gateway's outgoing call to the backend became its own
span, `kind: 2` (CLIENT — this process is calling someone else), correctly parented to the
root. The backend's incoming request became a third span, `kind: 1` (SERVER — this process
received a request), correctly parented to the gateway's CLIENT span. Real attributes came
along too, without being set by hand anywhere: `http.method`, `http.status_code`,
`net.peer.port`, `http.url`, and more.

That's Chapter 3's entire manual result — matching trace ID, correct parent-child link across
a real network call — reproduced with no `tracer`, no `startActiveSpan`, no manual
`traceparent` string, in either service file. Auto-instrumentation even went further than the
manual version: it split each hop into a separate CLIENT span (the call going out) and SERVER
span (the call arriving), which nothing in Chapter 3 bothered to do.

**Span kind**, seen here for the first time, is worth naming: it's a label on a span saying
what role it played — `SERVER` (received a request), `CLIENT` (made a request to someone
else), plus others not seen yet (`PRODUCER`, `CONSUMER`, `INTERNAL` — Chapter 6 covers when
those show up). Every manually-created span so far (`checkout`, `charge`, `complexTask`) was
`kind: 0`, INTERNAL, since none of them represented a network call.

## What auto-instrumentation still won't cover

This run didn't hit it directly, but it's worth stating plainly: nothing in
`@opentelemetry/auto-instrumentations-node` could ever produce a `complexTask` span like
Chapter 3's. It only recognizes the specific libraries it was written for — `http` here. Any
app-specific logic, no matter how slow or important, still needs a manual span, exactly the
way `complexTask` got one. Real apps end up as a mix: auto-instrumentation for the
infrastructure-level calls, manual spans layered on top for anything that's actually
business logic.

## Questions for Chapter 5

- Right now every span just prints to this process's own console. Once there's more than a
  couple of services, where do all of these spans actually need to go so they can be viewed
  together as one system, instead of scattered across a dozen terminals?
- Is there a way to collect spans from many services in one place before they go to wherever
  they're stored long-term?
- `SimpleSpanProcessor` exports every span the instant it ends. Does that scale, or is there
  a reason to batch spans up instead?
