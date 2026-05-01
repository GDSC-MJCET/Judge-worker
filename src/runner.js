const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const LANGUAGES = require('./languages');

const TIMEOUT_MS = 10_000;
const TEMP_BASE = '/tmp/judge';

async function runTestCase(lang, submissionId, input) {
  const { image, runCmd } = lang;
  const workDir = path.join(TEMP_BASE, submissionId);

  return new Promise((resolve) => {
    const args = [
      'run', '--rm',
      '--network', 'none',
      '--memory', '128m',
      '--cpus', '0.5',
      '--ulimit', 'nproc=50:50',
      '-v', `${workDir}:/code`,
      '-w', '/code',
      image,
      'sh', '-c', runCmd,
    ];

    const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      // also kill the container by name if needed — rm flag handles cleanup
    }, TIMEOUT_MS);

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1, timedOut });
    });

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });
}

async function run({ submissionId, code, language, testCases }) {
  const lang = LANGUAGES[language];
  if (!lang) {
    throw new Error(`Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGES).join(', ')}`);
  }

  const workDir = path.join(TEMP_BASE, submissionId);
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(path.join(workDir, lang.filename), code);

  const results = await Promise.all(
    testCases.map(async ({ input, expectedOutput }, index) => {
      const { stdout, stderr, exitCode, timedOut } = await runTestCase(lang, submissionId, input);
      const passed = !timedOut && exitCode === 0 && stdout.trimEnd() === expectedOutput.trimEnd();
      return { index, passed, stdout, stderr, exitCode, timedOut };
    })
  );

  await fs.rm(workDir, { recursive: true, force: true });

  return results;
}

module.exports = { run };
