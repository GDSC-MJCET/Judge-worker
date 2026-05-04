const LANGUAGES = {
  python: {
    image: 'python:3.11-alpine',
    filename: 'solution.py',
    runCmd: 'python solution.py',
  },
  javascript: {
    image: 'node:18-alpine',
    filename: 'solution.js',
    runCmd: 'node solution.js',
  },
  cpp: {
    image: 'gcc:13',
    filename: 'solution.cpp',
    runCmd: 'g++ solution.cpp -o a.out && ./a.out',
  },
  java: {
    image: 'openjdk:17.0.1-slim',
    filename: 'Main.java',          // default; runner overrides with actual public class name
    runCmd: 'javac Main.java && java Main',
  },
};

module.exports = LANGUAGES;
