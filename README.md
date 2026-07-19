# OpenTelemetry — Learning Notes

My own notes on observability and OpenTelemetry, built one chapter at a time. Each chapter
has a short write-up and a small hands-on exercise in Node.js — the goal isn't just "how do
I configure this," it's "why does this piece exist in the first place."

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- No other packages required unless a chapter's own README says otherwise

## Table of Contents

| # | Chapter | Status |
|---|---|---|
| 1 | [Why logs alone fail](chapters/01-why-logs-fail/) | ✅ Done |
| 2 | [Spans, traces, and how they fix Chapter 1](chapters/02-traces-and-spans/) | ✅ Done |
| 3 | [Getting a trace to survive a real network call](chapters/03-context-propagation/) | ✅ Done |
| 4 | [Instrumenting things without writing the span code yourself](chapters/04-manual-instrumentation/) | ✅ Done |
| 5 | [Where do all these spans actually go?](chapters/05-collector/) | ✅ Done |
| 6 | [What happens when a service doesn't wait for a reply](chapters/06-distributed-tracing/) | ✅ Done |

Each chapter's own `README.md` has the full write-up, the exercise, and the commands to run
it.
