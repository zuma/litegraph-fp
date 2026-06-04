const net = require('net');
const fs = require('fs');

const hosts = ['192.168.138.10', '192.168.138.13'];
let results = [];

function log(msg) {
  console.log(msg);
  results.push(msg);
  fs.writeFileSync('/workspaces/litegraph-fp/fast_scan_results.txt', results.join('\n'));
}

log("Starting fast port scan...");

function scan(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(200);
    socket.on('connect', () => {
      log(`Found Open Port: ${host}:${port}`);
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function run() {
  for (const host of hosts) {
    log(`Scanning ${host}...`);
    const chunkSize = 500;
    for (let port = 1; port <= 65535; port += chunkSize) {
      const promises = [];
      const end = Math.min(port + chunkSize - 1, 65535);
      for (let p = port; p <= end; p++) {
        promises.push(scan(host, p));
      }
      await Promise.all(promises);
    }
  }
  log("Fast port scan complete.");
}

run();
