const net = require('net');
const dns = require('dns');
const fs = require('fs');

dns.setServers(['0.250.250.200']);

const commonPorts = [80, 443, 3000, 4000, 5000, 5001, 8000, 8080, 8081, 9090];
const subnet = '192.168.215';

let results = [];
function log(msg) {
  console.log(msg);
  results.push(msg);
  fs.writeFileSync('/workspaces/litegraph-fp/scan_results.txt', results.join('\n'));
}

log("Starting network and DNS scan...");

// DNS scan
const hostnamesToTry = [
  'github.orb.local',
  'mcp.orb.local',
  'mcp-github.orb.local',
  'github-mcp.orb.local',
  'github-mcp-server.orb.local',
  'server-github.orb.local',
  'host.orb.local',
  'orb.local'
];

hostnamesToTry.forEach(host => {
  dns.lookup(host, (err, address, family) => {
    if (!err) {
      log(`DNS: Resolved ${host} to ${address}`);
      scanHost(address);
    }
  });
});

// Port scan host
function scanHost(host) {
  commonPorts.forEach(port => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      log(`Port Open: ${host}:${port}`);
      socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
      socket.on('data', (data) => {
        log(`Response from ${host}:${port}:\n${data.toString().substring(0, 300)}`);
        socket.destroy();
      });
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.connect(port, host);
  });
}

// Subnet scan
for (let i = 1; i <= 254; i++) {
  const host = `${subnet}.${i}`;
  if (host === '192.168.215.3') continue; // Skip self
  scanHost(host);
}
setTimeout(() => {
  log("Scan complete.");
}, 4500);
