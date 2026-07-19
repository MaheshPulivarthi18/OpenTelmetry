# Chapter 9: When You Need the Shape of Everything, Not One Request

Status: ✅

## Where we left off

Every span and every trace so far has needed you to already know which one to look at. Great
for "why was this one request slow." Useless for "what's my checkout error rate today" — you
can't open a million traces one at a time to answer that. That's what metrics are for: a
pre-aggregated number, continuously updated, instead of a record of one specific thing that
happened.

## Instrument types

- **Counter** — only ever goes up. "Total requests," "total errors." Call `add(1)` every time
  something happens.
- **UpDownCounter** — same idea, but can go up or down. "Requests currently in flight."
- **Gauge** — a snapshot of a value right now, not accumulated. "Current memory usage."
- **Histogram** — records a spread of values, not just a running total. "Request duration" is
  the classic case: instead of just an average, a histogram buckets measurements so
  percentiles (p50, p95, p99) can be computed later. This matters because an average hides
  outliers — a system where most requests take 20ms and one takes 8 seconds can have a
  perfectly normal-looking average while someone's having a terrible time.

## Cardinality, answered directly

A trace attribute can be anything — a specific order ID, unique per request — and that's
fine, because each trace gets looked at individually. A metric doesn't work that way: it's
aggregated by its labels, and the backend keeps a separate running counter for *every unique
combination of label values it's ever seen*. Attach something like `order.id` to a metric,
and instead of one counter, there's one counter per order — a **cardinality explosion**.
Metric labels need to stay small and bounded — `route`, `status_code`, `method` — never
anything that's practically unique per request.

## Exemplars

Can a slow number in an aggregate view point back to one specific trace, the way `parentId`
points to a specific span? Yes — an **exemplar** is a small extra bit of data attached to one
specific measurement inside a histogram bucket, recording a real trace ID that landed in that
bucket. A p99 latency spike becomes something you can click into and get an actual trace for,
instead of just a number with nowhere to go next.

## The exercise

Code: [`code/metrics-demo.js`](code/metrics-demo.js) — a `Counter` and a `Histogram` with
good, low-cardinality labels (`route` + `status_code`), plus a second counter deliberately
labeled by `order_id` to make the cardinality problem concrete instead of theoretical.

```bash
cd chapters/09-metrics/code
npm install
node metrics-demo.js
```

### Real run — 20 simulated checkout requests

`checkout.requests` (good labels — `route` + `status_code`) settled into **2 data points**:

```
{ status_code: 200 } -> 18
{ status_code: 500 } -> 2
```

`checkout.duration` (histogram, same 2 label combinations) showed real bucket shape instead
of one number — the 200-status requests mostly landed in the 100-250ms bucket (12 of 18),
with a few faster ones in 50-75ms and 75-100ms. That's percentile-friendly detail an average
alone would have erased.

`checkout.requests.bad_cardinality` (labeled by `order_id`) produced **20 separate data
points** — one per request, every one sitting at `value: 1`:

```
{ order_id: 'ord_1001' } -> 1
{ order_id: 'ord_1002' } -> 1
...
{ order_id: 'ord_1020' } -> 1
```

Same 20 requests, same underlying information, but 20 individual series instead of 2. Nothing
broke at this scale — the problem is what this pattern does at real volume. A system doing
millions of checkouts a day, with this label choice, would create millions of permanently
growing, essentially useless series, which is enough to make a real metrics backend expensive
or make it fall over entirely.

One more thing visible in the real output: metrics got exported twice during a single run,
on their own 2-second timer, not once per request — that's the "continuously updated" part
of what makes a metric different from a span. Both exports showed the same cumulative totals,
since nothing resets between export cycles by default.

## Where this connects to real tools

This whole chapter has been "how the data gets made." Tools like Grafana or SigNoz are the
consuming side — they store this same kind of data and draw it as dashboards and alerts.
Swap `ConsoleMetricExporter` for an OTLP exporter pointing at the Collector from Chapter 5,
and the exact same counters and histograms built here become the graphs you'd actually look
at in one of those tools. Every decision in this chapter — which labels to use, counter vs
histogram — directly determines whether that eventual graph is useful or a useless mess of
thousands of tiny series.

## Questions for Chapter 10

- Metrics answered "what's the shape of everything." Traces answered "what happened in one
  request." What's still missing is Chapter 1's original problem: the actual log lines
  themselves, from something like `console.log`, still don't connect to anything.
- How does a log line actually get a `trace_id` attached to it automatically, without manually
  passing the current trace ID into every single log call?
- Does fixing this make Chapter 1's original exercise (matching two log files by hand) fully
  obsolete, or is there still a reason to look at raw logs once trace correlation exists?
