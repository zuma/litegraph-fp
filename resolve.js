const dns = require('dns');
const net = require('net');
const http = require('http');
const fs = require('fs');

dns.setServers(['0.250.250.200']);

const domains = ['sweet-panini.orb.local', 'sweet-swirles.orb.local'];
const commonPorts = [80, 443, 3000, 4000, 5000, 5001, 8000, 8080, 8081, 9090];

let output = [];
function log(msg) {
  console.log(msg);
  output.push(msg);
  fs.writeFileSync('/workspaces/litegraph-fp/resolve_results.txt', output.join('\n'));
}

log("Starting resolve and scan...");

domains.forEach(domain => {
  dns.lookup(domain, (err, address) => {
    if (err) {
      log(`Error resolving ${domain}: ${err.message}`);
      return;
    }
    log(`Resolved ${domain} to ${address}`);
    
    // Scan ports
    commonPorts.forEach(port => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        log(`[${domain}] Port Open: ${port}`);
        // Send a test HTTP request
        socket.write("GET / HTTP/1.1\r\nHost: " + domain + "\r\n\r\n");
        socket.on('data', (data) => {
          log(`[${domain}:${port}] Response:\n${data.toString().substring(0, 300)}`);
          socket.destroy();
        });
      });
      socket.on('timeout', () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.connect(port, address);
    });
  });
});

setTimeout(() => {
  log("Resolve and scan complete.");
}, 4500);
