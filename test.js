require('dotenv').config();
const { Queue, QueueEvents } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const queue = new Queue('judge', { connection });
const queueEvents = new QueueEvents('judge', { connection });

const submissions = [
  {
    submissionId: 'python-pass',
    language: 'python',
    code: `a, b = map(int, input().split())
print(a + b)`,
    testCases: [
      { input: '5 3', expectedOutput: '8' },
      { input: '10 20', expectedOutput: '30' },
      { input: '0 0', expectedOutput: '0' },
      { input: "53564632534 32534654234", expectedOutput: "8590119778" }
    ],
  },
  {
    submissionId: 'python-wrong-answer',
    language: 'python',
    code: `print(42)`,
    testCases: [
      { input: '1 2', expectedOutput: '3' },
    ],
  },
  {
    submissionId: 'javascript-pass',
    language: 'javascript',
    code: `const [a, b] = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split(' ').map(Number);
console.log(a + b);`,
    testCases: [
      { input: '7 8', expectedOutput: '15' },
    ],
  },
  {
    submissionId: 'python-timeout',
    language: 'python',
    code: `import time
time.sleep(20)
print("done")`,
    testCases: [
      { input: '', expectedOutput: 'done' },
    ],
  },
  {
    submissionId: 'python-runtime-error',
    language: 'python',
    code: `print(1 / 0)`,
    testCases: [
      { input: '', expectedOutput: '0' },
    ],
  },
];

async function main() {
  console.log(`Submitting ${submissions.length} jobs to queue "judge"...\n`);

  const jobs = await Promise.all(
    submissions.map((data) => queue.add('run', data))
  );

  console.log('Jobs enqueued:');
  jobs.forEach((job, i) => {
    console.log(`  [${job.id}] ${submissions[i].submissionId}`);
  });
  console.log();

  let done = 0;
  const total = jobs.length;

  await Promise.all(
    jobs.map((job) =>
      new Promise((resolve) => {
        queueEvents.on('completed', ({ jobId, returnvalue }) => {
          if (jobId !== job.id) return;
          const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
          printResult(result);
          if (++done === total) resolve();
          else resolve();
        });

        queueEvents.on('failed', ({ jobId, failedReason }) => {
          if (jobId !== job.id) return;
          console.log(`\n❌ Job ${jobId} FAILED: ${failedReason}`);
          if (++done === total) resolve();
          else resolve();
        });
      })
    )
  );

  await queue.close();
  await queueEvents.close();
}

function printResult({ submissionId, results, allPassed }) {
  const icon = allPassed ? '✅' : '❌';
  console.log(`${icon} ${submissionId} — ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  results.forEach(({ index, passed, stdout, stderr, exitCode, timedOut }) => {
    const status = timedOut ? 'TLE' : passed ? 'PASS' : 'FAIL';
    const tag = status === 'PASS' ? '✓' : status === 'TLE' ? '⏱' : '✗';
    console.log(`  [${index}] ${tag} ${status}  stdout: ${JSON.stringify(stdout.trim())}  exit: ${exitCode}${stderr ? `  stderr: ${JSON.stringify(stderr.trim().slice(0, 80))}` : ''}`);
  });
  console.log();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
