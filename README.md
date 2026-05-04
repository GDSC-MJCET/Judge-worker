# Judge Worker

A BullMQ worker that pulls code-execution jobs from a Redis queue, runs each submission inside an isolated Docker container, and returns per-test-case results (pass/fail, stdout, stderr, TLE).

## How it works

```
Backend  ──► Redis (BullMQ queue: "judge")  ──► Judge Worker  ──► Docker container
                                                                        │
                                                          stdout / stderr / exitCode
                                                                        │
                                                          Job returnvalue ◄──────────
```

Each job carries `{ submissionId, code, language, testCases }`.  
The worker writes the code to `/tmp/judge/<submissionId>/`, spawns one container per test case, pipes stdin, compares stdout, and returns results.

**Supported languages:** `python`, `javascript`, `cpp`, `java`

---

## Option 1 — Run normally (Node.js on your machine)

### Prerequisites
- Node.js 18+
- Docker (daemon running)
- Redis 7+

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start Redis (skip if you already have one running)
docker compose up -d redis

# 3. Copy env and configure
cp .env.example .env
# Edit .env if your Redis is not on localhost:6379

# 4. Start the worker
npm start
```

The worker logs:
```
Judge worker started — listening on queue "judge"
```

### Run the test script

In a second terminal:
```bash
node test.js
```

---

## Option 2 — Run fully in Docker

> **How this works:** The worker container mounts the host's Docker socket (`/var/run/docker.sock`) so it can spawn sibling containers on the host daemon — this is called Docker-out-of-Docker (DooD). The `/tmp/judge` directory is also shared so the host daemon can mount code files into execution containers.

### Prerequisites
- Docker with Compose v2

### Steps

```bash
# 1. Build and start everything (Redis + worker)
docker compose up --build

# Or run in the background
docker compose up --build -d

# 2. View worker logs
docker compose logs -f worker
```

### Run the test script against the Dockerised worker

The worker connects to Redis internally. To enqueue test jobs from your host machine, Redis port `6379` is still exposed, so:

```bash
# Make sure Node deps are installed locally (only needed for test.js)
npm install
node test.js
```

### Stop everything

```bash
docker compose down
```

---

## Job payload reference

```json
{
  "submissionId": "unique-id",
  "language": "python",
  "code": "a, b = map(int, input().split())\nprint(a + b)",
  "testCases": [
    { "input": "5 3", "expectedOutput": "8" },
    { "input": "1 2", "expectedOutput": "3" }
  ]
}
```

## Job result reference

```json
{
  "submissionId": "unique-id",
  "verdict": "accepted",
  "allPassed": true,
  "results": [
    { "index": 0, "passed": true,  "stdout": "8\n",  "stderr": "", "exitCode": 0, "timedOut": false },
    { "index": 1, "passed": false, "stdout": "99\n", "stderr": "", "exitCode": 0, "timedOut": false }
  ]
}
```

| field     | meaning                                      |
|-----------|----------------------------------------------|
| `verdict` | `accepted` / `wrong_answer` / `time_limit_exceeded` / `runtime_error` |
| `passed`  | stdout matches expectedOutput (trimmed)      |
| `timedOut`| wall-clock limit (10 s) exceeded             |
| `exitCode`| process exit code from inside the container  |

## MongoDB Submission document

After each job the worker upserts a document in the `submissions` collection:

```json
{
  "submissionId": "unique-id",
  "language": "python",
  "verdict": "accepted",
  "allPassed": true,
  "results": [ ... ],
  "completedAt": "2026-05-01T10:00:00.000Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`findOneAndUpdate` with `upsert: true` is used, so the backend can pre-create the document with `verdict: "pending"` and the worker will fill it in when done.

## Environment variables

| variable     | default     | description                    |
|--------------|-------------|--------------------------------|
| `REDIS_HOST` | `localhost` | Redis hostname                 |
| `REDIS_PORT` | `6379`      | Redis port                     |
| `MONGO_URI`  | —           | MongoDB connection string (required) |
