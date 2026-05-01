require('dotenv').config();
const { Worker } = require('bullmq');
const runner = require('./runner');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

const worker = new Worker(
  'judge',
  async (job) => {
    const { submissionId, language, testCases } = job.data;
    console.log(`[${submissionId}] Running ${testCases.length} test case(s) — language: ${language}`);

    const results = await runner.run(job.data);
    const allPassed = results.every((r) => r.passed);

    console.log(`[${submissionId}] Done — ${results.filter((r) => r.passed).length}/${results.length} passed`);

    return { submissionId, results, allPassed };
  },
  { connection, concurrency: 5 }
);

worker.on('completed', (job) => {
  console.log(`[${job.data.submissionId}] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[${job?.data?.submissionId}] Job ${job?.id} failed:`, err.message);
});

console.log('Judge worker started — listening on queue "judge"');
