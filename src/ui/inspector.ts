import { StandardNodes } from '../registry/index.js';
import { appState } from './state.js';
import { pushToHistory, undoStack, redoStack, updateUndoRedoButtons } from './history.js';
import { triggerAutoRun } from './execution.js';

// ============================================================================
// DYNAMIC INSPECTOR BUILDER
// ============================================================================

export function updateInspector() {
    const placeholder = document.getElementById('inspector-placeholder');
    const content = document.getElementById('inspector-content');
    
    if (!content || !placeholder) return;

    const chkPinSidebar = document.getElementById('chk-pin-sidebar') as HTMLInputElement | null;
    const isPinned = chkPinSidebar ? chkPinSidebar.checked : false;
    const shouldAutoCollapse = !isPinned;

    if (!appState.selectedNodeId || !appState.currentGraph.nodes[appState.selectedNodeId]) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        if (shouldAutoCollapse && typeof (window as any).setSidebarCollapsed === 'function') {
            (window as any).setSidebarCollapsed(true);
        }
        return;
    }

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');
    if (shouldAutoCollapse && typeof (window as any).setSidebarCollapsed === 'function') {
        (window as any).setSidebarCollapsed(false);
    }

    const node = appState.currentGraph.nodes[appState.selectedNodeId];
    const nodeDef = StandardNodes[node.type];

    // Node details textContent insertion
    const nodeIdText = document.getElementById('inspect-node-id');
    const nodeTypeText = document.getElementById('inspect-node-type');
    
    if (nodeIdText) nodeIdText.textContent = node.id;
    if (nodeTypeText) {
        nodeTypeText.textContent = node.type;
        nodeTypeText.className = `inspector-value badge`;
    }

    // 1. Rebuild Parameter Editor Container
    const paramsContainer = document.getElementById('inspect-parameters-container');
    if (paramsContainer && nodeDef) {
        paramsContainer.replaceChildren();

        // Parameter inputs: Draw form input fields for requires pins that are NOT connected
        const requires = Object.entries(nodeDef.requires);
        const incomingEdges = appState.currentGraph.edges.filter(e => e.targetNodeId === node.id);

        requires.forEach(([pinId, pinType]) => {
            const isConnected = incomingEdges.some(e => e.targetPinId === pinId);
            const row = document.createElement('div');
            row.className = 'param-input-row';

            const label = document.createElement('label');
            label.textContent = `${pinId} (${pinType})`;
            row.appendChild(label);

            if (isConnected) {
                const badgeText = document.createElement('span');
                badgeText.className = 'badge';
                badgeText.style.alignSelf = 'flex-start';
                badgeText.style.borderColor = 'rgba(255,255,255,0.05)';
                badgeText.style.background = 'rgba(255,255,255,0.02)';
                badgeText.style.color = 'var(--text-muted)';
                badgeText.textContent = '🔌 Wired Link';
                row.appendChild(badgeText);
            } else {
                // Not connected, display editor input
                const currentVal = node.params[pinId] ?? '';
                
                if (pinType === 'boolean') {
                    const checkLabel = document.createElement('label');
                    checkLabel.className = 'input-field-checkbox';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = !!currentVal;
                    checkbox.addEventListener('change', () => {
                        // Capture snapshot on toggle action
                        pushToHistory();
                        updateNodeParam(node.id, pinId, checkbox.checked);
                    });
                    checkLabel.appendChild(checkbox);
                    checkLabel.appendChild(document.createTextNode(' Enabled'));
                    row.appendChild(checkLabel);
                } else {
                    const textInput = document.createElement('input');
                    textInput.type = pinType === 'number' ? 'number' : 'text';
                    textInput.className = 'input-field';
                    textInput.value = currentVal.toString();
                    textInput.autocomplete = 'off';
                    
                    // Capture snapshot once upon focusing the input
                    textInput.addEventListener('focus', () => {
                        appState.preEditGraphState = JSON.parse(JSON.stringify(appState.currentGraph));
                    });

                    textInput.addEventListener('input', () => {
                        // If we have a pending pre-edit snapshot, push it to history before saving the first keystroke
                        if (appState.preEditGraphState) {
                            undoStack.push(appState.preEditGraphState);
                            if (undoStack.length > 50) undoStack.shift();
                            redoStack.length = 0;
                            updateUndoRedoButtons();
                            appState.preEditGraphState = null; // Only push once per focus session
                        }

                        let parsedVal: any = textInput.value;
                        if (pinType === 'number') {
                            parsedVal = parseFloat(textInput.value);
                            if (isNaN(parsedVal)) parsedVal = 0;
                        }
                        updateNodeParam(node.id, pinId, parsedVal);
                    });
                    row.appendChild(textInput);
                }
            }
            paramsContainer.appendChild(row);
        });

        if (requires.length === 0) {
            const noParams = document.createElement('span');
            noParams.style.fontSize = '12px';
            noParams.style.color = 'var(--text-muted)';
            noParams.textContent = 'None';
            paramsContainer.appendChild(noParams);
        }
    }

    // 2. Rebuild Outputs Container
    const outputsContainer = document.getElementById('inspect-outputs-container');
    if (outputsContainer && nodeDef) {
        outputsContainer.replaceChildren();

        const provides = Object.keys(nodeDef.provides);
        provides.forEach(pinId => {
            const row = document.createElement('div');
            row.className = 'pin-status-row';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pin-name';
            nameSpan.textContent = pinId;
            row.appendChild(nameSpan);

            const valSpan = document.createElement('span');
            valSpan.className = 'pin-val';
            
            const stateKey = `${node.id}.${pinId}`;
            const val = appState.latestExecutionState[stateKey];
            valSpan.textContent = val !== undefined ? JSON.stringify(val) : 'undefined';
            row.appendChild(valSpan);

            outputsContainer.appendChild(row);
        });

        if (provides.length === 0) {
            const noOutputs = document.createElement('span');
            noOutputs.style.fontSize = '12px';
            noOutputs.style.color = 'var(--text-muted)';
            noOutputs.textContent = 'None';
            outputsContainer.appendChild(noOutputs);
        }
    }

    // 3. Rebuild Error Container
    const errorsContainer = document.getElementById('inspect-errors-container');
    if (errorsContainer) {
        if (appState.nodeErrors[node.id]) {
            errorsContainer.classList.remove('hidden');
            errorsContainer.textContent = appState.nodeErrors[node.id];
        } else {
            errorsContainer.classList.add('hidden');
            errorsContainer.textContent = '';
        }
    }
}

export function updateNodeParam(nodeId: string, paramKey: string, value: any) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    // Immutable update
    const updatedParams = { ...node.params, [paramKey]: value };
    const updatedNode = { ...node, params: updatedParams };
    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: updatedNode
        }
    };
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}
