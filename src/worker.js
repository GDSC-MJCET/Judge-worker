require('dotenv').config();
const { Worker } = require('bullmq');
const runner = require('./runner');
const { connect } = require('./db');
const Submission = require('./models/Submission');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

function deriveVerdict(results) {
  if (results.some((r) => r.timedOut))  return 'time_limit_exceeded';
  if (results.some((r) => r.exitCode !== 0)) return 'runtime_error';
  if (results.every((r) => r.passed))   return 'accepted';
  return 'wrong_answer';
}

async function startWorker() {
  await connect();

  const worker = new Worker(
    'judge',
    async (job) => {
      const { submissionId, language, testCases } = job.data;
      console.log(`[${submissionId}] Running ${testCases.length} test case(s) — language: ${language}`);

      const results = await runner.run(job.data);
      const allPassed = results.every((r) => r.passed);
      const verdict = deriveVerdict(results);

      await Submission.findOneAndUpdate(
        { submissionId },
        {
          submissionId,
          language,
          verdict,
          allPassed,
          results,
          completedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`[${submissionId}] Done — verdict: ${verdict} (${results.filter((r) => r.passed).length}/${results.length} passed)`);

      return { submissionId, verdict, allPassed, results };
    },
    { connection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[${job?.data?.submissionId}] Job ${job?.id} failed:`, err.message);
  });

  console.log('Judge worker started — listening on queue "judge"');
}

startWorker().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
