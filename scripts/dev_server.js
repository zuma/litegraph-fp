import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve root directory of workspace and ensure a trailing separator to prevent partial matching bypasses
const WORKSPACE_ROOT = path.resolve(__dirname, '..') + path.sep;
// TODO(security): Binding to 0.0.0.0 is required for Docker/Orbstack dev container port-forwarding to macOS.
// In a non-containerized testing environment, this should bind strictly to '127.0.0.1'.
const HOST = '0.0.0.0'; 
const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/execute-python') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            try {
                const payload = JSON.parse(body);
                const { code, inputs } = payload;
                
                if (typeof code !== 'string' || !inputs || typeof inputs !== 'object') {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ success: false, error: 'Invalid payload parameters' }));
                    return;
                }

                executePythonCode(code, inputs, (err, result) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    } else {
                        res.end(JSON.stringify({ success: true, result }));
                    }
                });
            } catch (err) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON request body' }));
            }
        });
        return;
    }

    // 1. Sanitize request URL path to prevent directory traversal
    let safePath = req.url || '/';
    // Remove query params
    const qIndex = safePath.indexOf('?');
    if (qIndex !== -1) {
        safePath = safePath.substring(0, qIndex);
    }
    
    // Default to index.html for root requests
    if (safePath === '/') {
        safePath = '/index.html';
    }

    // Resolve absolute path and enforce that it lies strictly inside the workspace boundary
    const resolvedPath = path.resolve(path.join(WORKSPACE_ROOT, safePath));

    if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Forbidden: Path traversal blocked.');
        return;
    }

    // 2. Read and serve the file
    fs.stat(resolvedPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // 3. Apply secure HTTP response headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'sha256-S14+EZlRBnmL9SqhQ2zECnGpOzkQVg1+HHiL8SJ9L8g=' 'sha256-chfApzb7BD0tN3ELSGpRhGx/h/P7joyUVv2lagHf738='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");

        const stream = fs.createReadStream(resolvedPath);
        stream.on('error', () => {
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('500 Internal Server Error');
            }
        });
        stream.pipe(res);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`🚀 Litegraph-FP dev server running at http://${HOST}:${PORT}/`);
    console.log(`📂 Serving workspace root: ${WORKSPACE_ROOT}`);
});

function executePythonCode(code, inputs, callback) {
    const pythonCode = `
import sys, json
try:
    payload = json.loads(sys.stdin.read())
    code = payload['code']
    inputs = payload['inputs']
    
    namespace = {}
    exec(code, namespace)
    if 'execute' not in namespace:
        raise ValueError("Missing 'execute' function in Python code")
    
    result = namespace['execute'](inputs)
    print(json.dumps({"success": True, "result": result}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
    sys.exit(1)
`;

    const py = spawn('python3', ['-c', pythonCode]);
    let stdout = '';
    let stderr = '';

    py.stdout.on('data', data => { stdout += data; });
    py.stderr.on('data', data => { stderr += data; });

    py.on('close', exitCode => {
        if (exitCode !== 0 && !stdout) {
            callback(new Error(stderr || 'Python execution failed.'));
            return;
        }
        try {
            const res = JSON.parse(stdout);
            if (res.success) {
                callback(null, res.result);
            } else {
                callback(new Error(res.error || stderr));
            }
        } catch (e) {
            callback(new Error(stderr || 'Invalid output format from Python execution.'));
        }
    });

    py.stdin.write(JSON.stringify({ code, inputs }));
    py.stdin.end();
}
