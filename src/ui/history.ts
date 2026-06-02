import { GraphState } from '../core/ast.js';
import { appState, syncContextState } from './state.js';
import { updateInspector } from './inspector.js';
import { runExecutionPipeline, logToTerminal } from './execution.js';

// ============================================================================
// UNDO/REDO HISTORY STACKS
// ============================================================================

export const undoStack: GraphState[] = [];
export const redoStack: GraphState[] = [];

export function pushToHistory() {
    // Fix #13: Use structuredClone instead of JSON.parse(JSON.stringify) for performance and safety
    const cloned = structuredClone(appState.currentGraph);
    undoStack.push(cloned);
    
    // Enforce history threshold size
    if (undoStack.length > 50) {
        undoStack.shift();
    }
    
    // Clear redo history when a new structural action occurs
    redoStack.length = 0;
    updateUndoRedoButtons();
}

export function undo() {
    if (undoStack.length === 0) return;
    
    const currentCloned = structuredClone(appState.currentGraph);
    redoStack.push(currentCloned);

    const prev = undoStack.pop()!;
    appState.currentGraph = prev;

    // Deselect if node no longer exists in history
    if (appState.selectedNodeId && !appState.currentGraph.nodes[appState.selectedNodeId]) {
        appState.selectedNodeId = null;
    }
    syncContextState();

    logToTerminal(`Undo action performed`, 'system-msg');
    updateUndoRedoButtons();
    updateInspector();
    runExecutionPipeline().catch(console.error);
}

export function redo() {
    if (redoStack.length === 0) return;

    const currentCloned = structuredClone(appState.currentGraph);
    undoStack.push(currentCloned);

    const next = redoStack.pop()!;
    appState.currentGraph = next;

    // Deselect if node no longer exists in history
    if (appState.selectedNodeId && !appState.currentGraph.nodes[appState.selectedNodeId]) {
        appState.selectedNodeId = null;
    }
    syncContextState();

    logToTerminal(`Redo action performed`, 'system-msg');
    updateUndoRedoButtons();
    updateInspector();
    runExecutionPipeline().catch(console.error);
}

export function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
    const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}
