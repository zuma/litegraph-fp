import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve root directory of workspace and ensure a trailing separator to prevent partial matching bypasses
const WORKSPACE_ROOT = path.resolve(__dirname, '..') + path.sep;
// TODO(security): Binding to 0.0.0.0 is required for Docker/Orbstack dev container port-forwarding to macOS.
// In a non-containerized testing environment, this should bind strictly to '127.0.0.1'.
const HOST = '0.0.0.0'; 
const PORT = 3000;

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
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'sha256-YwFlYxkPxuBJxjACWjzWRNXUgyijAQonlKkGmGSjpKg=' 'sha256-chfApzb7BD0tN3ELSGpRhGx/h/P7joyUVv2lagHf738='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");

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
