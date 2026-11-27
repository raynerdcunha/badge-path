'use strict';
// Starts the API (port 3001) and the web page (port 5173) together. Run: node run-all.js
const { spawn } = require('node:child_process');
const path = require('node:path');

const procs = [
  { name: 'server', color: '\x1b[36m', file: path.join(__dirname, 'server', 'server.js') },
  { name: 'web   ', color: '\x1b[32m', file: path.join(__dirname, 'web-server.js') },
];

const children = procs.map((p) => {
  const child = spawn(process.execPath, [p.file], { cwd: path.dirname(p.file), env: process.env });
  const tag = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream) => stream.on('data', (d) =>
    String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(tag + l)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}stopped (exit ${code})`);
    shutdown();
  });
  return child;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  children.forEach((c) => c.kill());
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

setTimeout(() => console.log('\nOpen http://localhost:5173 in your browser. Press Ctrl+C here to stop both.\n'), 600);
