# Chapter 6: What Happens When a Service Doesn't Wait for a Reply

Status: ✅

## Where we left off

Every trace so far has been the same shape: one service calls another and waits right there
for the response — `gateway` calls `backend`, gets an answer, moves on. That's a
**synchronous** call, and it's why a `traceparent` header worked so cleanly: the two services
are talking to each other in the same moment.

A queue breaks that. Instead of calling another service directly, a service drops a message
into a queue — like a mailbox — and immediately moves on without waiting for anyone to read
it. Some other service picks it up whenever it gets around to it, seconds or minutes later,
with no idea it's even happening from the sender's side.

## Does propagation still work with no direct connection?

Yes. Propagation was never really about HTTP specifically — it's about attaching the trace ID
and span ID to whatever carries the work forward. With HTTP that was a header. With a queue,
it's a field on the message itself, since most queues let you attach metadata to a message the
same way HTTP lets you attach headers. The sender calls `propagation.inject()` (same function
from Chapter 3) and writes the trace context into the message body instead of a header.
Whenever the receiver eventually picks the message up, it calls `propagation.extract()` on
that same data and continues the exact same trace — same mechanism, different carrier.

## Two new span kinds

Chapter 4 introduced `SERVER` (this process received a request) and `CLIENT` (this process
made a request and is waiting for a reply). Two more show up here:

- **PRODUCER** — this process sent a message and is *not* waiting for a reply. Fire, and
  move on.
- **CONSUMER** — this process picked a message up and is now processing it, with no
  relationship to when it was actually sent.

The distinction matters because of what it implies about timing. With CLIENT/SERVER, a gap
between the two spans usually means something is wrong — the server was slow. With
PRODUCER/CONSUMER, a gap is completely normal — the whole point is that the two sides aren't
having a live conversation.

## The exercise

Code: [`code/queue.js`](code/queue.js) (a tiny in-memory queue standing in for a real broker),
[`code/gateway.js`](code/gateway.js), [`code/backend.js`](code/backend.js) (now enqueues a
`send-receipt` message instead of calling notifications directly), and
[`code/notifications.js`](code/notifications.js) (a worker polling the queue every 2 seconds,
completely decoupled in time from whoever enqueued anything).

```bash
cd chapters/06-distributed-tracing/code
npm install
```

Four services, four terminals, in order:

```bash
node queue.js            # terminal 1
node notifications.js    # terminal 2 -- starts polling immediately, every 2s
node backend.js          # terminal 3
node gateway.js          # terminal 4
curl localhost:9000/checkout   # terminal 5
```

Or run `bash run-demo.sh` from `code/` to do all of that in one shot, print everything, and
shut it all down again — useful if juggling five terminals gets old.

### Real run

One `curl` produced four spans, all sharing one trace ID
(`334a48c851370517cb8fdd53892ef027`):

| Span | Service | Kind | Parent |
|---|---|---|---|
| `checkout` | gateway | INTERNAL | *(root)* |
| `charge` | backend | INTERNAL | `checkout` |
| `send-receipt` | backend | **PRODUCER** | `charge` |
| `send-email-receipt` | notifications | **CONSUMER** | `send-receipt` |

The last link is the interesting one: `send-email-receipt`'s parent is `send-receipt` (the
PRODUCER span itself), not `charge` directly — because `propagation.inject()` ran while the
PRODUCER span was the active one, so whatever picks the message up later correctly attaches
to *that* span, not to whatever was active further up the chain.

Timing backs up the concept directly: `checkout` → `charge` → `send-receipt` all happened
within about 93ms of each other — the normal synchronous chain. But `send-email-receipt`
started roughly **1.1 seconds after** `send-receipt` ended, because `notifications` was off
running its own 2-second poll loop and only happened to check the queue again after that
delay. One trace, correctly linked end to end, with a real gap in the middle that isn't a bug
— it's just what fire-and-forget messaging actually looks like.

## Questions for Chapter 7

- Every span so far has represented either app logic or a network call. What does a database
  call look like as a span — what attributes actually matter for one?
- Should time spent waiting for a free database connection be part of the query's span, or
  its own separate span?
- Is it ever unsafe to put the real query (with real data in it) into a span attribute?
