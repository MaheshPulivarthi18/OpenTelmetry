# Chapter 8: Calling Something You Don't Control

Status: ✅

## Where we left off

Every call so far has been between our own services — all instrumented, all understanding
`traceparent`, all cooperating to build one connected trace. A third-party API breaks that.
It doesn't run our code, has no idea what a `traceparent` header is, and will never send
anything back that lets a trace continue into its side.

## What happens to the trace at that boundary

The call still deserves a span — still worth knowing how long it took, whether it succeeded,
what came back — but that span becomes a dead end. Still `CLIENT` kind (Chapter 4: "I'm
making a request to someone else"), just with nothing on the other side ever showing up as
its child, since there's no cooperating system there to continue it. Sending the
`traceparent` header anyway is still fine — some APIs log it even without acting on it,
occasionally useful for manual correlation later — but it won't change what shows up in this
trace.

## Retries: separate spans, on purpose

Real external calls fail more than internal ones — rate limits, brief outages — so retry
logic shows up here in a way it hasn't before. Each attempt got its own child span in this
exercise, rather than folding all the attempts into events on one span, specifically so each
attempt's own duration and status code stays individually visible. The tradeoff: more spans
per call. Worth it here, since knowing *which* attempt failed and *why* is usually the whole
reason to look at this trace in the first place.

## Not leaking the API key

A lot of API clients send a key or token as part of the request — often literally in a
header. It's easy to accidentally copy that whole header object onto a span attribute without
thinking about it, and now a live secret is sitting in the tracing system, usually with far
weaker access control than wherever the request itself lives. Same lesson as Chapter 7's
parameterized queries, just for HTTP: be deliberate about exactly which fields go onto a
span — an allowlist, not a copy of everything available.

## The exercise

Code: [`code/fake-external-api.js`](code/fake-external-api.js) (a stand-in for a real
third-party API — zero OpenTelemetry code, fails about 40% of the time on purpose, requires a
fake API key) and [`code/client.js`](code/client.js) (retries with backoff, wraps each
attempt in its own `CLIENT` span, all children of one `call-payment-api` span).

```bash
cd chapters/08-external-apis/code
npm install
```

```bash
node fake-external-api.js   # terminal 1
node client.js              # terminal 2
```

Or `bash run-demo.sh` to run both in one shot.

### Real run (3 attempts, from an actual run)

| Attempt | `retry.attempt` | `http.status_code` | Span status |
|---|---|---|---|
| 1 | 1 | 503 | ERROR |
| 2 | 2 | 503 | ERROR |
| 3 | 3 | 200 | OK |

All three `POST /v1/payment` spans shared one `traceId`, and each one's `parentId` matched
the wrapping `call-payment-api` span's `id` exactly — one trace, three attempts, each with
its own visible outcome, and the parent recording `retry.total_attempts: 3`. That's the
actual payoff of per-attempt spans: this specific call needed 3 tries, and it's clear exactly
which ones failed and which one succeeded, not just "it eventually worked."

Checked across every attempt in every run: none of the span attributes contain
`Authorization`, the API key, or anything resembling it — even though the real request sent
`Bearer sk_live_super_secret_do_not_leak_12345` over the wire every single time. Only
`http.method`, `http.url`, `retry.attempt`, and `http.status_code` ever get set on a span —
an explicit allowlist, not a copy of the request.

## Questions for Chapter 9

- Every span so far has needed a trace open to see anything. What's the equivalent for "how
  slow is checkout across every request today," not just one request at a time?
- Chapter 1 mentioned cardinality as a term to define later. Why do aggregated numbers like
  this need far fewer unique label combinations than a trace attribute does?
- Can a specific slow number in an aggregate view point back to one specific trace, the way
  `parentId` points back to a specific span?
