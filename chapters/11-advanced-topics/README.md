# Chapter 11: Advanced Topics — a Reference, Not a Straight Line

Status: ✅

Unlike Chapters 1-10, this one isn't a single linear story building on the last. It's a set
of things worth knowing exist, to pull in as they become relevant. Sampling gets the full
treatment, since it connects directly to everything built so far. The rest are defined
clearly enough to know what to look up later, without a full exercise for each.

## Sampling

Chapter 9 made cardinality concrete: too many unique label combinations makes metrics
expensive or unusable. The same cost problem shows up for traces, from a different angle —
not too many unique labels, just too many requests. A real system doing thousands of requests
a second, each producing a full trace tree, generates far more data than anyone will ever
look at. Sampling is the decision of which traces are actually worth keeping.

**Head sampling** decides at the very start, before a request even finishes — usually a
simple rule like "keep roughly 20% of traces, picked randomly based on the trace ID." Cheap:
nothing needs to be held in memory waiting for a whole trace to complete. The tradeoff: it's
blind. It might discard the one trace that had a real error in it, purely because the
randomness landed the wrong way, with no way to know that in advance.

**Tail sampling** waits until a trace is actually finished, looks at what happened — did it
error, was it unusually slow — and only then decides whether to keep it. Much smarter: a rule
like "always keep errors, always keep the slowest 1%, sample the rest at 5%" becomes
possible. The cost: something has to hold every span in memory until a whole trace completes
before deciding, which is exactly why Chapter 5 noted tail sampling needs a gateway-style
Collector — an agent sitting next to one service only ever sees part of a trace, never the
whole thing.

### The exercise

Code: [`code/sampling-demo.js`](code/sampling-demo.js) — `TraceIdRatioBasedSampler` wrapped
in `ParentBasedSampler` (the standard pattern: respect an existing decision from a remote
parent if there is one, otherwise apply the ratio), set to keep roughly 20% of traces.

```bash
cd chapters/11-advanced-topics/code
npm install
node sampling-demo.js
```

The script fires 20 independent `checkout` traces and prints one line per attempt showing
`sampled=true` or `sampled=false`, directly from `span.isRecording()` — this is checkable
regardless of what the exporter ends up doing.

### Real run

All 20 attempts printed a line — every trace gets a real ID no matter what the sampler
decides. Only 2 of them (`attempt 9` and `attempt 20`) showed `sampled=true`, and exactly
those two trace IDs are the ones that appeared as full span objects in the exporter output
below them. The other 18 existed as valid trace IDs for a moment and were then discarded
before any span processor or exporter ever saw them.

2 out of 20 is 10%, not the configured 20% — not a bug, just what randomness looks like at a
small sample size. `TraceIdRatioBasedSampler` hashes the trace ID and compares it against the
ratio; it doesn't mechanically pick exactly 1-in-5. At real traffic volumes (thousands or
millions of traces), the actual rate converges much closer to the configured ratio — the same
reason a coin flipped 20 times lands on 8 or 12 heads more often than exactly 10, but flipped
a million times lands very close to 500,000.

## The rest, briefly

**Span/attribute limits** — SDKs cap how many attributes, events, or links one span can
hold, so a runaway loop calling `span.setAttribute()` or `span.addEvent()` repeatedly can't
silently balloon a single span's memory usage without bound.

**Semantic convention stability** — attribute names like `http.status_code` are versioned.
Some are marked stable, some still experimental and can change between SDK versions. Worth
checking a convention's stability level before building a long-term dependency (a dashboard,
an alert rule) directly on its exact name.

**Multi-tenancy** — keeping different teams' or customers' telemetry properly isolated within
one shared Collector deployment, so one team's queries or dashboards can't see another's data,
and one team's traffic spike can't silently degrade another's pipeline.

**Cost control at scale** — sampling is the main lever, but it's not the only one. Filtering
out low-value spans in a Collector processor before they're ever exported, and enforcing
cardinality limits on metrics (Chapter 9) before export, are others. All of them are really
the same question asked at different layers: is this specific piece of telemetry worth what
it costs to keep?

## Where this leaves things

Chapters 1 through 10 built a complete, connected picture — traces, metrics, and logs, all
correlated to each other, starting from the concrete pain of two uncorrelated log files in
Chapter 1. This chapter is the start of a reference for the topics that come up once that
foundation is solid, filled in further as needed rather than worked through start to finish.
