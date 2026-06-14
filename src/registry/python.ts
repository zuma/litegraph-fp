import { NodeDefinition } from './types.js';

// Detect if running in Node.js backend vs. Browser environment
const isNode = typeof process !== 'undefined' && process.release?.name === 'node';

/**
 * Executes Python script code locally by spawning a python3 subprocess.
 * Communicates with the subprocess using JSON over stdin/stdout.
 * 
 * @param spawn Child process spawning utility
 * @param code User-written python code containing the 'execute' function
 * @param inputs Map of inputs to feed into the 'execute' function
 */
function runPythonLocally(spawn: any, code: string, inputs: any): Promise<any> {
    return new Promise((resolve, reject) => {
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

        py.stdout.on('data', (data: any) => { stdout += data; });
        py.stderr.on('data', (data: any) => { stderr += data; });

        py.on('close', (exitCode: number) => {
            if (exitCode !== 0 && !stdout) {
                reject(new Error(stderr || 'Python execution failed.'));
                return;
            }
            try {
                const res = JSON.parse(stdout);
                if (res.success) {
                    resolve(res.result);
                } else {
                    reject(new Error(res.error || stderr));
                }
            } catch (e) {
                reject(new Error(stderr || 'Invalid output format from Python execution.'));
            }
        });

        py.stdin.write(JSON.stringify({ code, inputs }));
        py.stdin.end();
    });
}

/**
 * Dynamic Python script node definition.
 * 
 * ============================================================================
 * PYTHON CODE NODE RULES (AI & HUMAN NOTES)
 * ============================================================================
 * 1. Structure: The user code MUST define a function:
 *    `def execute(inputs):`
 *    which accepts a dictionary of inputs and returns a dictionary of output values.
 * 2. Execution environment:
 *    - In Node.js (e.g. backend / CLI testing): runs locally via `runPythonLocally`.
 *    - In the browser: proxy requests to the dev server via `/api/execute-python`.
 * 3. Dynamic pins: Supports arbitrary runtime input/output definitions.
 * ============================================================================
 */
export const pythonScript: NodeDefinition = {
    namespace: 'core',
    category: 'python',
    name: 'script',
    requires: { a: 'any', b: 'any', code: 'string' },
    provides: { out: 'any' },
    dynamicInputs: true,
    dynamicOutputs: true,
    execute: async (inputs, params) => {
        const code = (inputs.code as string) || (params.code as string) || '';
        
        if (isNode) {
            try {
                const { spawn } = await import('child_process');
                return await runPythonLocally(spawn, code, inputs);
            } catch (e: any) {
                throw new Error(`Failed to load child_process or execute locally: ${e.message}`);
            }
        } else {
            // Browser: request to local dev server execution API
            const response = await fetch('/api/execute-python', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, inputs })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                return data.result;
            } else {
                throw new Error(data.error || 'Python execution failed.');
            }
        }
    }
};
