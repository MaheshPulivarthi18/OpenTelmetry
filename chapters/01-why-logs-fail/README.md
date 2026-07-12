# Chapter 1: Why Logs Alone Fail

Status: ✅

## The problem

Something breaks in production. You open the logs and find a line like
`Error: payment failed`. Now you want to know why. If everything runs in one process, you can
usually find the answer by scrolling up and reading nearby lines.

Once you have more than one service, this gets hard. Say a `gateway` service gets a request
and calls a `backend` service to handle it. Each service writes its own log file. Nothing
connects a line in one file to a line in the other. To figure out what happened, you have to
match lines by timestamp, by eye, and hope the clocks on both machines agree and that no
other request happened at the same time.

The real issue: a log line is just one fact, at one moment, in one process. It tells you
"this happened, here." It does not tell you what caused it, what happened next because of it,
or how long the whole thing took. In one process, you can work around this with effort. Once
there is more than one process, working around it stops being realistic. You end up manually
piecing together a story from separate files, and that's slow and easy to get wrong.

## Three things that go wrong

**You can't see cause and effect.** A log line can tell you an error happened. It can't tell
you the error happened because some other service retried too many times. You'd only notice
that by manually comparing several log files and getting lucky.

**You can't see how long things took.** A log line has one timestamp — one point in time.
"This was slow" needs two points: a start and an end. If the start and end are in different
files, you have to find both by hand and do the subtraction yourself.

**Adding more logs doesn't help.** When logs feel like they're not enough, the instinct is to
add more log lines. That just gives you more text to read through. It doesn't fix the real
problem, which is that the lines aren't connected to each other in any way.

## A few terms

- **Telemetry** — the data your application emits about itself (logs, metrics, traces).
- **Monitoring** — watching predefined metrics or conditions and alerting when they cross
  thresholds.
- **Observability** — using rich telemetry to investigate and answer new, unexpected
  questions about your system's behavior without changing the code.

The difference between monitoring and observability, in one picture:

```
Application
      │
      ▼
Telemetry (Logs + Metrics + Traces)
      │
      ├──► Monitoring
      │      "CPU > 80%?"
      │
      └──► Observability
             "Why did this specific request fail only after today's deployment?"
```

Same telemetry, two different jobs. Monitoring checks a question you already knew to ask.
Observability lets you ask a question you didn't know you'd need to ask, after the fact,
using data that was already being collected.

## The exercise: feel the problem yourself

Code: [`code/gateway.js`](code/gateway.js) and [`code/backend.js`](code/backend.js). Two
plain Node.js servers, no extra packages needed. Each one writes its own log file
(`gateway.log` and `backend.log`). The gateway gets a `/checkout` request, does a little
work, then calls the backend's `/charge`. The backend pretends to be slow about 1 in 4 times,
like a real payment provider sometimes is.

### How to run it

Open three terminals, all in this `code/` folder.

**Terminal 1 — start the backend:**

```bash
node backend.js
```

**Terminal 2 — start the gateway:**

```bash
node gateway.js
```

**Terminal 3 — send one request:**

```bash
curl localhost:9000/checkout
```

Send a few more one at a time, then check `gateway.log` and `backend.log` in this folder.
When you want to feel real concurrency (see "Try 2" below), send several at once instead:

```bash
for i in 1 2 3; do curl -s localhost:9000/checkout & done; wait
```

The question to answer, using only the two log files: **how long did one request take from
start to finish, and why?**

### Try 1 — one request at a time

When requests are sent one at a time, you can answer this, but only by manually lining up
timestamps across two files. Here's a real example from a run:

```
gateway: received checkout request        18:04:12.234
gateway: calling backend /charge          18:04:12.283   (49ms spent before calling)
backend: processing charge                18:04:12.284
backend: payment provider is slow this time
backend: charge processed                 18:04:13.085   (801ms — hit the slow case)
gateway: backend call succeeded           18:04:13.086
```

Total time: 852ms. You can only see why it was slow by opening both files and matching them
up by hand. That manual matching is the real cost this chapter is about.

While doing this across a full run, something else showed up: one run had 9 "received
checkout request" lines in `gateway.log`, but only 8 "calling backend /charge" lines. One
line that should have been there was missing — most likely lost when copying text, not an
actual bug. What matters here isn't the cause. What matters is that there was no way to
notice this was missing except by counting every line by hand. The log format itself gives
you no way to catch a gap like this.

### Try 2 — requests at the same time

One request at a time is slow to check but still possible. Real concurrency breaks it
completely. Sending three requests at once with the command above produced this:

```
gateway.log
18:12:23.224  received checkout request
18:12:23.225  received checkout request
18:12:23.225  received checkout request
18:12:23.236  calling backend /charge
18:12:23.253  calling backend /charge
18:12:23.273  calling backend /charge
18:12:23.298  backend call succeeded
18:12:24.057  backend call succeeded
18:12:24.077  backend call succeeded

backend.log
18:12:23.239  processing charge
18:12:23.254  processing charge
18:12:23.254  payment provider is slow this time
18:12:23.274  processing charge
18:12:23.274  payment provider is slow this time
18:12:23.298  charge processed
18:12:24.055  charge processed
18:12:24.076  charge processed
```

All three "received checkout request" lines happen within 1 millisecond of each other. Each
request then waits a random 10-50ms before calling the backend — and that wait time never
shows up in the log. So there's no way to tell which "received" line matches which "calling"
line. This isn't about reading more carefully. The information you'd need just isn't there.

Further down, you can still see the big picture (one request was fast, around 59ms; two hit
the slow 800ms case), but you cannot tell which of your three original `curl` calls got which
result. That information is gone.

That's the real lesson of Chapter 1. When requests happen one at a time, matching logs by
timestamp is slow and error-prone. When requests happen at the same time, matching by
timestamp doesn't work at all — timestamps alone don't carry enough information to tell
requests apart. The fix isn't "write more logs" or "write logs more carefully." The fix is
giving every log line from one request a shared ID, so finding them later is a simple filter
instead of a guess. That ID, and the extra structure built on top of it (a tree of steps with
clear parent-child links and start/end times), is what Chapter 2 is about.

## Questions for Chapter 2

- What does this shared ID actually look like, and where does it come from?
- Is an ID by itself the whole fix, or is there more structure needed (like durations, or
  which step caused which) that an ID alone doesn't give you?
- Does the gateway have to create this ID and hand it to the backend itself, or is there a
  standard way this is usually done?
