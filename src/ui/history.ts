import { GraphState } from '../core/ast.js';
import { appState, syncContextState } from './state.js';
import { updateInspector } from './inspector.js';
import { runExecutionPipeline, logToTerminal } from './execution.js';

// ============================================================================
// UNDO/REDO HISTORY STACKS
// ============================================================================
// The engine tracks history state via simple immutable snapshots of the graph state.
// Since all GraphStates are frozen, pushing to history clones the current state, 
// ensuring canvas modifications do not mutate past points in time.
// ============================================================================

export const undoStack: GraphState[] = [];
export const redoStack: GraphState[] = [];

/**
 * Pushes the current active graph state onto the undo stack.
 * Bounded to a maximum size of 50 to conserve memory.
 * Clears the redo stack on any new canvas interactions.
 */
export function pushToHistory() {
    // Clone via structuredClone to ensure complete independence of history nodes
    const cloned = structuredClone(appState.currentGraph);
    undoStack.push(cloned);
    
    // Bounding threshold constraint: shift old history snapshots out of memory
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
