import { evaluateGraph } from '../engine/evaluate.js';
import { StandardNodes } from '../registry/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { appState, syncContextState } from './state.js';
import { updateInspector } from './inspector.js';

// ============================================================================
// MODULE-SCOPED DISPATCHER (created once, handlers persist across executions)
// ============================================================================
export const dispatcher = createDispatcher();
dispatcher.on('CONSOLE_LOG', async (cmd, sourceNodeId) => {
    logToTerminal(`[Node ${sourceNodeId} CONSOLE_LOG]: ${cmd.payload.message}`, 'log-output');
});

// ============================================================================
// CORE EVALUATION CONTROLLER
// ============================================================================

export async function runExecutionPipeline() {
    const statusDot = document.getElementById('engine-status-dot');
    const drawerStatusDot = document.getElementById('bottom-drawer-status-dot');
    const statusText = document.getElementById('engine-status-text');
    const timeValue = document.getElementById('execution-time-value');
    
    if (statusText) {
        statusText.textContent = 'Engine: Running...';
    }
    if (statusDot) {
        statusDot.className = 'status-dot running';
    }
    if (drawerStatusDot) {
        drawerStatusDot.className = 'status-dot running';
    }

    const tStart = performance.now();
    const globalInputs = {
        // Optional globally injected starting states could go here
    };

    // Evaluate purely functional graph
    const result = await evaluateGraph(
        appState.currentGraph,
        globalInputs,
        StandardNodes,
        { executionMode: 'parallel', nodeTimeoutMs: 1500 }
    );

    const tEnd = performance.now();
    
    // Save state
    appState.latestExecutionState = result.state;
    appState.nodeErrors = { ...result.errors };
    if (appState.renderingContext) {
        appState.renderingContext.lastExecutionTime = Date.now();
        appState.renderingContext.needsRedraw = true;
    }
    syncContextState();

    // Update controls UI
    if (timeValue) {
        timeValue.textContent = `${Math.round(tEnd - tStart)}ms`;
    }

    if (statusText) {
        const errorCount = Object.keys(result.errors).length;
        if (errorCount > 0) {
            statusText.textContent = `Engine: Error (${errorCount} culled)`;
            if (statusDot) statusDot.className = 'status-dot error';
            if (drawerStatusDot) drawerStatusDot.className = 'status-dot error';
        } else {
            statusText.textContent = 'Engine: Success';
            if (statusDot) statusDot.className = 'status-dot idle';
            if (drawerStatusDot) drawerStatusDot.className = 'status-dot idle';
        }
    }

    // Dispatch side effects via the module-scoped dispatcher
    await dispatcher.dispatchFromExecution(result);
    logToTerminal(`Execution completed.`, 'system-msg');

    // Update inspector contents
    updateInspector();

    // Render AST Preview
    const astJson = document.getElementById('ast-json-preview');
    if (astJson) {
        astJson.textContent = JSON.stringify(appState.currentGraph, null, 2);
    }
}

export function triggerAutoRun() {
    const chkAuto = document.getElementById('chk-auto-run') as HTMLInputElement;
    if (chkAuto && chkAuto.checked) {
        runExecutionPipeline().catch(console.error);
    }
}

// ============================================================================
// CONSOLE LOGGER UTILITY
// ============================================================================

export function logToTerminal(message: string, className: string = '') {
    const consoleView = document.getElementById('terminal-console');
    if (!consoleView) return;

    const line = document.createElement('div');
    line.className = `terminal-line ${className}`;
    line.textContent = `> ${message}`;

    consoleView.appendChild(line);

    // Fix #12: Cap the terminal to 200 lines to prevent memory leaks and layout thrashing
    while (consoleView.children.length > 200) {
        consoleView.removeChild(consoleView.firstChild!);
    }

    consoleView.scrollTop = consoleView.scrollHeight;
}
