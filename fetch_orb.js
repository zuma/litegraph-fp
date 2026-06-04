const http = require('http');
const fs = require('fs');

console.log("Fetching http://orb.local/ ...");

http.get('http://orb.local/', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('/workspaces/litegraph-fp/orb_containers.html', data);
    console.log("Saved to orb_containers.html");
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
