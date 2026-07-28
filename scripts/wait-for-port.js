/**
 * HOW THIS FILE WORKS
 *   1. Read a port (and optional timeout) from argv.
 *   2. Try to open a TCP connection to it once a second.
 *   3. Exit 0 as soon as one succeeds; exit 1 if the timeout passes first.
 *
 * Used by dev.ps1 to hold the BullMQ workers back until the API is listening.
 *
 * Why that ordering matters: backend/nest-cli.json sets "deleteOutDir": true, so
 * `nest start --watch` DELETES dist/ and rebuilds it at startup — and the four workers
 * run from dist/. Starting them together is a race the workers lose, with
 * "Cannot find module './scheduler-worker.module'". The API listening on its port means
 * its compile finished, so dist/ is complete and the workers can safely load from it.
 *
 * A socket cannot tell WHOSE server answered, so this only proves "the API of this run started"
 * because dev.ps1 refuses to start at all while something else is already listening on 3000.
 * If that preflight abort is ever downgraded back to a warning, this guard goes silently dead.
 *
 * Plain Node with no dependencies, so it works before anything is installed at the repo root.
 *
 *   node scripts/wait-for-port.js 3000 [timeoutSeconds]
 */
const net = require('node:net');

const port = Number(process.argv[2]);
// 180s is generous: a cold tsc build on a loaded machine can take well over a minute.
const timeoutSec = Number(process.argv[3] ?? 180);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('wait-for-port: expected a port number, got:', process.argv[2]);
  process.exit(1);
}

const deadline = Date.now() + timeoutSec * 1000;

function attempt() {
  const socket = new net.Socket();

  // Bound each individual attempt too, so a black-holed port cannot stall the loop.
  socket.setTimeout(1000);

  const retry = () => {
    socket.destroy();
    if (Date.now() > deadline) {
      console.error(`wait-for-port: port ${port} not open after ${timeoutSec}s`);
      process.exit(1);
    }
    setTimeout(attempt, 1000);
  };

  socket.once('connect', () => {
    socket.destroy();
    console.log(`wait-for-port: ${port} is open — continuing`);
    process.exit(0);
  });
  socket.once('error', retry);
  socket.once('timeout', retry);

  socket.connect(port, '127.0.0.1');
}

console.log(`wait-for-port: waiting for ${port} (up to ${timeoutSec}s)...`);
attempt();
