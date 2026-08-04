#!/usr/bin/env node
/**
 * wait-for-port.js — Wait until a TCP port on localhost accepts connections.
 * Usage: node wait-for-port.js <port> [timeoutMs]
 * Exits 0 on success, 1 on timeout/error.
 */
const net = require('net');

const port = parseInt(process.argv[2], 10);
const timeoutMs = parseInt(process.argv[3] || '180000', 10);

if (!port) {
  console.error('Usage: node wait-for-port.js <port> [timeoutMs]');
  process.exit(1);
}

const deadline = Date.now() + timeoutMs;

function tryConnect() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function main() {
  while (Date.now() < deadline) {
    const ok = await tryConnect();
    if (ok) {
      console.log(`Port ${port} is ready`);
      process.exit(0);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error(`Timed out waiting for port ${port}`);
  process.exit(1);
}

main();