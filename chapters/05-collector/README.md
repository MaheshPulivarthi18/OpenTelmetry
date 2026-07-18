# Chapter 5: Where Do All These Spans Actually Go?

Status: ✅

## Where we left off

Every span in every chapter so far just printed to that one process's own console. Fine for
two services in three terminals. Falls apart the moment there's a real system — many
services, and one place you actually want to look at a whole trace, not a dozen scattered
terminals.

The obvious fix — have every service export directly to a real backend — has real problems:
changing where telemetry goes means redeploying every service; every service needs its own
batching and retry logic; every service needs direct network access to that backend.

## The fix: put one thing in between

The **Collector** is a separate, standalone program. Instead of every service talking
directly to a real backend, every service sends its spans to the Collector instead, and the
Collector deals with batching, retrying, and forwarding data onward.

A Collector pipeline always has three jobs, in this order:

- **Receiver** — how it accepts incoming telemetry. Almost always **OTLP** (OpenTelemetry
  Protocol) — this is what replaces `ConsoleSpanExporter` from every earlier chapter.
- **Processor** — what happens to the data while it passes through. Batching spans together
  before sending them onward is the most common one.
- **Exporter** — where it finally sends the data. Could be one destination, or several at
  once, without any service knowing more than one exists.

Change the Collector's config, and every service's telemetry destination changes — zero code
changes anywhere. That's the actual advantage over exporting directly from each service.

## The exercise

Code: [`code/otel-collector-config.yaml`](code/otel-collector-config.yaml) and
[`code/spans-demo.js`](code/spans-demo.js). Same `checkout` → `charge` span tree as Chapter
2, but this time exported over OTLP to a real Collector instead of printed straight to the
console.

The config file has one pipeline: accept spans over OTLP (`receivers: [otlp]`), batch them
(`processors: [batch]`), and print whatever arrives (`exporters: [debug]`) — the `debug`
exporter stands in for a real backend here, just so the result is visible.

```bash
# terminal 1 -- the Collector itself, running in Docker
cd chapters/05-collector/code
docker run --rm -p 4317:4317 -p 4318:4318 \
  -v "$(pwd)/otel-collector-config.yaml:/etc/otel-collector-config.yaml" \
  otel/opentelemetry-collector:latest \
  --config=/etc/otel-collector-config.yaml

# terminal 2 -- the app
cd chapters/05-collector/code
npm install
node spans-demo.js
```

`spans-demo.js` itself prints nothing — all the output shows up in the Collector's terminal
instead, which is the actual point: the spans left the Node process entirely.

### Real output, from the Collector's terminal

```
Traces  {"resource spans": 1, "spans": 2}

Span #0
    Trace ID  : d7b79a44e19145610497786569b0b319
    Parent ID : 737240608697f9f8
    ID        : 18df1e3da686e5a3
    Name      : charge
    Kind      : Internal
    Attributes: order.id=ord_12345, payment.provider=stripe-sim, charge.status=succeeded

Span #1
    Trace ID  : d7b79a44e19145610497786569b0b319
    Parent ID : (empty)
    ID        : 737240608697f9f8
    Name      : checkout
    Kind      : Internal
    Attributes: order.id=ord_12345, http.route=/checkout
```

`resource spans: 1, spans: 2` confirms one batch containing exactly the two spans the app
created. Both share one `Trace ID`. `charge`'s `Parent ID` matches `checkout`'s `ID` exactly,
and `checkout` has no parent — the same checks from every earlier chapter, except this time
the spans crossed from the Node process into a completely separate program running in Docker,
over the network, before anything got printed.

`BatchSpanProcessor` (instead of `SimpleSpanProcessor`, used in every earlier chapter) is
what actually answers Chapter 4's leftover question about whether exporting one-at-a-time
scales: once spans are going over a real network call instead of just printing locally,
batching them up before sending is the normal thing to do — fewer network round trips for the
same amount of data. The Collector then batches *again* on its own side before its exporter
sends things onward, since it's receiving from potentially many services at once.

## Two deployment shapes, briefly

Not built here, but worth knowing the names: an **agent** deployment runs one Collector
close to each service (same host, low latency) — that's effectively what this exercise did,
one Collector, one app, both on localhost. A **gateway** deployment is a smaller number of
centralized Collectors that many agents (or many services directly) all forward to. Real
systems often layer both — agents doing lightweight local batching, forwarding to a gateway
that does heavier processing (like sampling decisions across a whole system) before the data
leaves the network entirely. This distinction matters more once Chapter 11 covers sampling.

## Questions for Chapter 6

- Every trace so far has been two services, one synchronous HTTP call between them. What does
  a trace look like once a service hands work off through a queue instead of a direct call?
- Span kind showed up in Chapter 4 as `SERVER`/`CLIENT`/`INTERNAL`. What are the other kinds,
  and when do they show up?
- Can a single trace still make sense if part of it happens synchronously and part of it
  happens much later, asynchronously?
