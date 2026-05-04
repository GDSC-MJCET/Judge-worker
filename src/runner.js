const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const LANGUAGES = require('./languages');

const TIMEOUT_MS = 10_000;
const TEMP_BASE = '/tmp/judge';

/**
 * Run a single test case.
 * Each test case gets its own subdirectory inside workDir so that compiled
 * languages (C++, Java) don't clobber each other's binary when running in
 * parallel.  The source file is hard-linked (or copied) into that subdir,
 * and the container mounts only that subdir.
 */
async function runTestCase(lang, submissionId, caseDir, input, index) {
  const { image, runCmd } = lang;
  console.log(`[${submissionId}] Docker run[${index}] image=${image} cmd="${runCmd}" input=${JSON.stringify((input || '').slice(0, 100))}`);

  return new Promise((resolve) => {
    const args = [
      'run', '--rm',
      '-i',                   // keep stdin open so we can pipe input
      '--network', 'none',
      '--memory', '128m',
      '--cpus', '0.5',
      '--ulimit', 'nproc=50:50',
      '-v', `${caseDir}:/code`,
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
    }, TIMEOUT_MS);

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      console.log(`[${submissionId}] Docker done[${index}] exitCode=${exitCode ?? 1} timedOut=${timedOut} stdout_len=${stdout.length} stderr_len=${stderr.length}`);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1, timedOut });
    });

    if (input != null) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });
}

/**
 * For Java the filename must match the public class name.
 * Extract it from the source; fall back to "Main" if not found.
 */
function resolveJavaLang(code) {
  const match = code.match(/public\s+class\s+(\w+)/);
  const className = match ? match[1] : 'Main';
  return {
    image: LANGUAGES.java.image,
    filename: `${className}.java`,
    runCmd: `javac ${className}.java && java ${className}`,
  };
}

async function run({ submissionId, code, language, testCases }) {
  if (!LANGUAGES[language]) {
    throw new Error(`Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGES).join(', ')}`);
  }

  // For Java resolve filename/runCmd from the actual class name in the source
  const lang = language === 'java' ? resolveJavaLang(code) : LANGUAGES[language];

  // Base dir for this submission
  const baseDir = path.join(TEMP_BASE, submissionId);
  await fs.mkdir(baseDir, { recursive: true });

  console.log(`[${submissionId}] Runner starting — baseDir=${baseDir} file=${lang.filename}`);

  // Create one isolated subdirectory per test case and copy the source file
  // into each.  This prevents compiled languages from racing on a.out / *.class.
  const caseDirs = await Promise.all(
    testCases.map(async (_, index) => {
      const dir = path.join(baseDir, String(index));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, lang.filename), code);
      return dir;
    })
  );

  const results = await Promise.all(
    testCases.map(async ({ input, expectedOutput }, index) => {
      const { stdout, stderr, exitCode, timedOut } =
        await runTestCase(lang, submissionId, caseDirs[index], input, index);
      const passed =
        !timedOut && exitCode === 0 && stdout.trimEnd() === expectedOutput.trimEnd();
      console.log(`[${submissionId}] Result[${index}] passed=${passed} exitCode=${exitCode} timedOut=${timedOut} stdout=${JSON.stringify(stdout.slice(0, 80))} stderr=${JSON.stringify(stderr.slice(0, 80))}`);
      return { index, passed, stdout, stderr, exitCode, timedOut };
    })
  );

  // Clean up the whole base dir once all test cases are done
  await fs.rm(baseDir, { recursive: true, force: true });

  return results;
}

module.exports = { run };
