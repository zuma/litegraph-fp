import { StandardNodes, getNodeInputs, getNodeOutputs, getNodeMode, getDefaultFormulaForType, getModeBaseInputs, getModeBaseOutputs } from '../registry/index.js';
import { NodeMode, NodeState, PinType } from '../core/ast.js';
import { NodeDefinition } from '../registry/types.js';
import { appState } from './state.js';
import { pushToHistory, undoStack, redoStack, updateUndoRedoButtons } from './history.js';
import { triggerAutoRun } from './execution.js';

// ============================================================================
// DYNAMIC INSPECTOR BUILDER
// ============================================================================

export function updateInspector() {
    // 1. Remember focused element details to restore after rebuild
    const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    let focusInfo: {
        formulaInput?: boolean;
        blockId?: string;
        blockField?: string;
        pinId?: string;
        selectionStart: number;
        selectionEnd: number;
    } | null = null;

    if (activeEl && activeEl.closest('#sidebar')) {
        focusInfo = {
            formulaInput: activeEl.dataset.formulaInput === 'true',
            blockId: activeEl.dataset.blockId,
            blockField: activeEl.dataset.blockField,
            pinId: activeEl.dataset.pinId,
            selectionStart: activeEl.selectionStart || 0,
            selectionEnd: activeEl.selectionEnd || 0
        };
    }

    const placeholder = document.getElementById('inspector-placeholder');
    const content = document.getElementById('inspector-content');
    
    if (!content || !placeholder) return;

    const chkPinSidebar = document.getElementById('chk-pin-sidebar') as HTMLInputElement | null;
    const isPinned = chkPinSidebar ? chkPinSidebar.checked : false;
    const shouldAutoCollapse = !isPinned;

    const nodeCount = appState.selectedNodeIds.size;
    const edgeCount = appState.selectedEdgeIds.size;
    const totalSelected = nodeCount + edgeCount;

    if (totalSelected === 0) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.textContent = 'Select a node to view properties & edit inputs';
        document.getElementById('btn-add-input')?.classList.add('hidden');
        document.getElementById('btn-add-output')?.classList.add('hidden');
        if (shouldAutoCollapse && typeof (window as any).setSidebarCollapsed === 'function') {
            (window as any).setSidebarCollapsed(true);
        }
        return;
    }

    if (totalSelected > 1) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        
        let labelText = 'Multiple items selected';
        const parts: string[] = [];
        if (nodeCount > 0) parts.push(`${nodeCount} node${nodeCount > 1 ? 's' : ''}`);
        if (edgeCount > 0) parts.push(`${edgeCount} connection${edgeCount > 1 ? 's' : ''}`);
        labelText += ` (${parts.join(', ')})`;
        
        placeholder.textContent = labelText;
        document.getElementById('btn-add-input')?.classList.add('hidden');
        document.getElementById('btn-add-output')?.classList.add('hidden');
        if (shouldAutoCollapse && typeof (window as any).setSidebarCollapsed === 'function') {
            (window as any).setSidebarCollapsed(false);
        }
        return;
    }

    if (edgeCount === 1 && nodeCount === 0) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        const edgeId = appState.selectedEdgeId || Array.from(appState.selectedEdgeIds)[0];
        const edge = appState.currentGraph.edges.find(e => e.id === edgeId);
        if (edge) {
            placeholder.innerHTML = `<strong>Selected Connection</strong><br><br><span class="mono" style="font-size: 11px; opacity: 0.8; display: block; line-height: 1.5;">[Node ${edge.sourceNodeId}].${edge.sourcePinId}<br>➡️<br>[Node ${edge.targetNodeId}].${edge.targetPinId}</span>`;
        } else {
            placeholder.textContent = '1 connection selected';
        }
        document.getElementById('btn-add-input')?.classList.add('hidden');
        document.getElementById('btn-add-output')?.classList.add('hidden');
        if (shouldAutoCollapse && typeof (window as any).setSidebarCollapsed === 'function') {
            (window as any).setSidebarCollapsed(false);
        }
        return;
    }

    if (!appState.selectedNodeId || !appState.currentGraph.nodes[appState.selectedNodeId]) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.textContent = 'Select a node to view properties & edit inputs';
        document.getElementById('btn-add-input')?.classList.add('hidden');
        document.getElementById('btn-add-output')?.classList.add('hidden');
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



    // Add/Remove Pin buttons setup
    // Add Pin buttons setup
    const btnAddInput = document.getElementById('btn-add-input');
    const btnAddOutput = document.getElementById('btn-add-output');

    if (btnAddInput) {
        btnAddInput.classList.remove('hidden');
        
        const newAddBtn = btnAddInput.cloneNode(true) as HTMLButtonElement;
        btnAddInput.parentNode?.replaceChild(newAddBtn, btnAddInput);
        newAddBtn.addEventListener('click', () => {
            handleAddInputPin(node.id);
        });
    }

    if (btnAddOutput) {
        btnAddOutput.classList.remove('hidden');
        
        const newAddBtn = btnAddOutput.cloneNode(true) as HTMLButtonElement;
        btnAddOutput.parentNode?.replaceChild(newAddBtn, btnAddOutput);
        newAddBtn.addEventListener('click', () => {
            handleAddOutputPin(node.id);
        });
    }
    // Node mode selector configuration
    const modeRow = document.getElementById('inspect-node-mode-row');
    const modeSelect = document.getElementById('inspect-node-mode') as HTMLSelectElement | null;
    if (modeRow && modeSelect) {
        modeRow.classList.remove('hidden');
        modeSelect.replaceChildren();
        const modes: { value: NodeMode; label: string }[] = [
            { value: 'formula', label: 'Math Formula' },
            { value: 'blocks', label: 'Blocks Expression' },
            { value: 'python', label: 'Python Script' },
            { value: 'delay', label: 'Time Delay' },
            { value: 'state', label: 'State Loop' }
        ];
        modes.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.label;
            modeSelect.appendChild(opt);
        });
        
        const activeMode = getNodeMode(node);
        modeSelect.value = activeMode;
        
        const newSelect = modeSelect.cloneNode(true) as HTMLSelectElement;
        modeSelect.parentNode?.replaceChild(newSelect, modeSelect);
        newSelect.value = activeMode;
        newSelect.addEventListener('change', () => {
            handleSwitchNodeMode(node.id, newSelect.value as NodeMode);
        });
    }
    // Node details textContent insertion
    const nodeIdText = document.getElementById('inspect-node-id');
    const nodeTypeText = document.getElementById('inspect-node-type');
    
    if (nodeIdText) nodeIdText.textContent = node.id;
    if (nodeTypeText) {
        nodeTypeText.textContent = node.type;
        nodeTypeText.className = `inspector-value badge`;
    }

    // Title input field binding
    const nodeTitleInput = document.getElementById('inspect-node-title') as HTMLInputElement | null;
    if (nodeTitleInput) {
        nodeTitleInput.value = node.ui?.title ?? '';
        
        // Clone input element to clear previous event listeners
        const newTitleInput = nodeTitleInput.cloneNode(true) as HTMLInputElement;
        nodeTitleInput.parentNode?.replaceChild(newTitleInput, nodeTitleInput);
        
        newTitleInput.addEventListener('focus', () => {
            appState.preEditGraphState = JSON.parse(JSON.stringify(appState.currentGraph));
        });
        
        newTitleInput.addEventListener('input', () => {
            if (appState.preEditGraphState) {
                undoStack.push(appState.preEditGraphState);
                if (undoStack.length > 50) undoStack.shift();
                redoStack.length = 0;
                updateUndoRedoButtons();
                appState.preEditGraphState = null;
            }
            updateNodeTitle(node.id, newTitleInput.value);
        });
    }

    // 0.5 Rebuild Logic Editor Container
    const logicContainer = document.getElementById('inspect-node-logic-container');
    if (logicContainer) {
        logicContainer.replaceChildren();
        logicContainer.classList.add('hidden');

        const mode = getNodeMode(node);
        if (mode === 'formula') {
            logicContainer.classList.remove('hidden');

            const row = document.createElement('div');
            row.className = 'inspector-field-group';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'stretch';
            row.style.gap = '6px';

            const label = document.createElement('span');
            label.className = 'inspector-label';
            label.textContent = 'Formula';
            row.appendChild(label);

            const formulaInput = document.createElement('input');
            formulaInput.type = 'text';
            formulaInput.className = 'input-field';
            formulaInput.style.width = '100%';
            formulaInput.value = node.params.formula ?? getDefaultFormulaForType(node.type);
            formulaInput.autocomplete = 'off';
            formulaInput.dataset.formulaInput = 'true';
            setupAutocomplete(formulaInput, () => {
                const inputPins = Object.keys(getNodeInputs(node, appState.resolvedInputs));
                const outputPins = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
                const mathHelpers = ['sin', 'cos', 'abs', 'round', 'min', 'max', 'pi', 'e', 'value'];
                return Array.from(new Set([...inputPins, ...outputPins, ...mathHelpers]));
            });

            formulaInput.addEventListener('focus', () => {
                appState.preEditGraphState = JSON.parse(JSON.stringify(appState.currentGraph));
            });

            formulaInput.addEventListener('input', () => {
                if (appState.preEditGraphState) {
                    undoStack.push(appState.preEditGraphState);
                    if (undoStack.length > 50) undoStack.shift();
                    redoStack.length = 0;
                    updateUndoRedoButtons();
                    appState.preEditGraphState = null;
                }
                updateNodeFormula(node.id, formulaInput.value);
            });
            row.appendChild(formulaInput);
            logicContainer.appendChild(row);
        } else if (mode === 'blocks') {
            logicContainer.classList.remove('hidden');

            const label = document.createElement('span');
            label.className = 'inspector-label';
            label.textContent = 'Blocks Logic';
            logicContainer.appendChild(label);

            const blocksList = node.params.blocks ?? [];
            blocksList.forEach((block, idx) => {
                const blockRow = document.createElement('div');
                blockRow.style.display = 'flex';
                blockRow.style.alignItems = 'center';
                blockRow.style.gap = '6px';
                blockRow.style.marginBottom = '4px';

                const setLabel = document.createElement('span');
                setLabel.textContent = 'Set';
                setLabel.style.fontSize = '11px';
                setLabel.style.color = 'var(--text-muted)';
                blockRow.appendChild(setLabel);

                const targetInput = document.createElement('input');
                targetInput.type = 'text';
                targetInput.className = 'input-field';
                targetInput.value = block.targetVar;
                targetInput.style.width = '50px';
                targetInput.style.padding = '3px 6px';
                targetInput.style.fontSize = '11px';
                targetInput.style.fontFamily = 'var(--font-mono)';
                targetInput.dataset.blockId = block.id;
                targetInput.dataset.blockField = 'targetVar';
                targetInput.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'targetVar', targetInput.value);
                });
                setupAutocomplete(targetInput, () => {
                    const outputPins = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
                    return Array.from(new Set([...outputPins, 'out', 'temp', 'result', 'value']));
                });
                blockRow.appendChild(targetInput);

                const eqLabel = document.createElement('span');
                eqLabel.textContent = '=';
                eqLabel.style.fontSize = '11px';
                eqLabel.style.color = 'var(--text-muted)';
                blockRow.appendChild(eqLabel);

                const op1Input = document.createElement('input');
                op1Input.type = 'text';
                op1Input.className = 'input-field';
                op1Input.value = block.operand1;
                op1Input.style.width = '50px';
                op1Input.style.padding = '3px 6px';
                op1Input.style.fontSize = '11px';
                op1Input.style.fontFamily = 'var(--font-mono)';
                op1Input.dataset.blockId = block.id;
                op1Input.dataset.blockField = 'operand1';
                op1Input.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'operand1', op1Input.value);
                });
                
                const getOperandSuggestions = () => {
                    const inputPins = Object.keys(getNodeInputs(node, appState.resolvedInputs));
                    const outputPins = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
                    const priorVars = (node.params.blocks || []).slice(0, idx).map(b => b.targetVar.trim()).filter(Boolean);
                    const mathHelpers = ['sin', 'cos', 'abs', 'round', 'min', 'max', 'pi', 'e', 'value'];
                    return Array.from(new Set([...inputPins, ...outputPins, ...priorVars, ...mathHelpers]));
                };
                setupAutocomplete(op1Input, getOperandSuggestions);
                blockRow.appendChild(op1Input);

                const opSelect = document.createElement('select');
                opSelect.className = 'input-field';
                opSelect.style.width = '45px';
                opSelect.style.padding = '2px';
                opSelect.style.fontSize = '11px';
                const ops = ['+', '-', '*', '/', 'and', 'or', '=='];
                ops.forEach(op => {
                    const opt = document.createElement('option');
                    opt.value = op;
                    opt.textContent = op;
                    opSelect.appendChild(opt);
                });
                opSelect.value = block.operator;
                opSelect.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'operator', opSelect.value);
                });
                blockRow.appendChild(opSelect);

                const op2Input = document.createElement('input');
                op2Input.type = 'text';
                op2Input.className = 'input-field';
                op2Input.value = block.operand2;
                op2Input.style.width = '50px';
                op2Input.style.padding = '3px 6px';
                op2Input.style.fontSize = '11px';
                op2Input.style.fontFamily = 'var(--font-mono)';
                op2Input.dataset.blockId = block.id;
                op2Input.dataset.blockField = 'operand2';
                op2Input.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'operand2', op2Input.value);
                });
                setupAutocomplete(op2Input, getOperandSuggestions);
                blockRow.appendChild(op2Input);

                const btnDelBlock = document.createElement('button');
                btnDelBlock.className = 'btn-delete-pin';
                btnDelBlock.textContent = '×';
                btnDelBlock.title = 'Delete Block';
                btnDelBlock.addEventListener('click', () => {
                    deleteBlockStatement(node.id, block.id);
                });
                blockRow.appendChild(btnDelBlock);

                logicContainer.appendChild(blockRow);
            });

            const btnAddBlock = document.createElement('button');
            btnAddBlock.className = 'btn-add-pin';
            btnAddBlock.textContent = '+ Add Block';
            btnAddBlock.style.marginTop = '4px';
            btnAddBlock.addEventListener('click', () => {
                addBlockStatement(node.id);
            });
            logicContainer.appendChild(btnAddBlock);
        } else if (mode === 'python') {
            logicContainer.classList.remove('hidden');

            const label = document.createElement('span');
            label.className = 'inspector-label';
            label.textContent = 'Python Code';
            logicContainer.appendChild(label);

            const currentVal = node.params.code ?? 'def execute(inputs):\n    return { "out": 0 }';

            const textArea = document.createElement('textarea');
            textArea.className = 'input-field';
            textArea.style.fontFamily = '"Fira Code", monospace';
            textArea.style.minHeight = '180px';
            textArea.style.fontSize = '11px';
            textArea.style.width = '100%';
            textArea.style.resize = 'vertical';
            textArea.value = currentVal.toString();
            textArea.autocomplete = 'off';

            textArea.addEventListener('focus', () => {
                appState.preEditGraphState = JSON.parse(JSON.stringify(appState.currentGraph));
            });

            textArea.addEventListener('input', () => {
                if (appState.preEditGraphState) {
                    undoStack.push(appState.preEditGraphState);
                    if (undoStack.length > 50) undoStack.shift();
                    redoStack.length = 0;
                    updateUndoRedoButtons();
                    appState.preEditGraphState = null;
                }
                updateNodeParam(node.id, 'code', textArea.value);
            });
            logicContainer.appendChild(textArea);
        }
    }

    // 1. Rebuild Parameter Editor Container (Inputs Card)
    const paramsContainer = document.getElementById('inspect-parameters-container');
    if (paramsContainer) {
        paramsContainer.replaceChildren();
        renderInputPinsList(paramsContainer, node, nodeDef);
    }

    // 2. Rebuild Outputs Container
    const outputsContainer = document.getElementById('inspect-outputs-container');
    if (outputsContainer && nodeDef) {
        outputsContainer.replaceChildren();

        const mode = getNodeMode(node);
        const baseOutputs = getModeBaseOutputs(mode, node.type);
        const provides = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));

        if (provides.length > 0) {
            const header = document.createElement('div');
            header.className = 'pin-table-header';
            
            const nameH = document.createElement('span');
            nameH.className = 'pin-header-col left';
            nameH.textContent = 'Name';
            header.appendChild(nameH);
            
            const srcH = document.createElement('span');
            srcH.className = 'pin-header-col';
            srcH.textContent = 'SRC';
            header.appendChild(srcH);
            
            const valH = document.createElement('span');
            valH.className = 'pin-header-col';
            valH.textContent = 'Value';
            header.appendChild(valH);
            
            const destH = document.createElement('span');
            destH.className = 'pin-header-col';
            destH.textContent = 'DEST';
            header.appendChild(destH);
            
            outputsContainer.appendChild(header);
        }

        provides.forEach(pinId => {
            const row = document.createElement('div');
            row.className = 'pin-status-row';
            const isActive = pinId in baseOutputs;
            if (!isActive) {
                row.style.opacity = '0.5';
                row.style.filter = 'grayscale(1)';
                row.title = `This output is inactive in '${mode}' mode.`;
            }
            row.draggable = true;

            row.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'output', pinId }));
                row.classList.add('dragging');
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                row.classList.add('drag-hover');
            });

            row.addEventListener('dragleave', () => {
                row.classList.remove('drag-hover');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('drag-hover');
                try {
                    const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '{}');
                    if (data.type === 'output') {
                        reorderOutputPins(node.id, data.pinId, pinId);
                    }
                } catch (err) {
                    // Ignore
                }
            });

            // Column 1: Name
            const nameRow = document.createElement('div');
            nameRow.style.display = 'flex';
            nameRow.style.alignItems = 'center';
            nameRow.style.gap = '6px';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pin-name';
            nameSpan.textContent = pinId;
            nameRow.appendChild(nameSpan);

            const isDynamic = !!(node.outputs && pinId in node.outputs && !(nodeDef && pinId in nodeDef.provides));
            if (isDynamic) {
                const btnDel = document.createElement('button');
                btnDel.className = 'btn-delete-pin';
                btnDel.textContent = '×';
                btnDel.title = `Delete output '${pinId}'`;
                btnDel.addEventListener('click', () => {
                    handleDeleteOutputPin(node.id, pinId);
                });
                nameRow.appendChild(btnDel);
            }
            row.appendChild(nameRow);

            const isConnected = appState.currentGraph.edges.some(e => e.sourceNodeId === node.id && e.sourcePinId === pinId);
            const stateKey = `${node.id}.${pinId}`;
            const val = appState.latestExecutionState[stateKey];
            const flowFlow = getOutputPinFlow(node, pinId);

            // Column 2: SRC
            const srcSpan = document.createElement('span');
            srcSpan.className = 'pin-col-text';
            if (!isActive) {
                srcSpan.className += ' inactive';
                srcSpan.textContent = '—';
            } else {
                srcSpan.className += ' active-src';
                srcSpan.textContent = flowFlow.src;
                srcSpan.title = flowFlow.src;
            }
            row.appendChild(srcSpan);

            // Column 3: Value
            const valCol = document.createElement('div');
            valCol.className = 'pin-col-val';
            const valSpan = document.createElement('span');
            valSpan.className = 'pin-val';
            valSpan.textContent = val !== undefined ? JSON.stringify(val) : 'undefined';
            valCol.appendChild(valSpan);
            row.appendChild(valCol);

            // Column 4: DEST
            const destSpan = document.createElement('span');
            destSpan.className = 'pin-col-text';
            if (!isActive) {
                destSpan.className += ' inactive';
                destSpan.textContent = '—';
            } else if (isConnected) {
                destSpan.className += ' active-dest';
                destSpan.textContent = flowFlow.dest;
                destSpan.title = flowFlow.dest;
            } else {
                destSpan.textContent = '—';
            }
            row.appendChild(destSpan);

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

    // 4. Restore focus if active element was recreated
    if (focusInfo && content) {
        let targetEl: HTMLInputElement | HTMLTextAreaElement | null = null;
        if (focusInfo.formulaInput) {
            targetEl = content.querySelector('input[data-formula-input="true"]');
        } else if (focusInfo.blockId && focusInfo.blockField) {
            targetEl = content.querySelector(
                `input[data-block-id="${focusInfo.blockId}"][data-block-field="${focusInfo.blockField}"]`
            );
        } else if (focusInfo.pinId) {
            targetEl = content.querySelector(`input[data-pin-id="${focusInfo.pinId}"]`);
        }

        if (targetEl) {
            targetEl.focus();
            targetEl.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd);
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

export function updateNodeTitle(nodeId: string, title: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    const updatedNode = {
        ...node,
        ui: {
            ...(node.ui ?? { x: 0, y: 0 }),
            title: title
        }
    };
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
}

export function handleAddInputPin(nodeId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;
    
    const requires = getNodeInputs(node);
    let nextIndex = 0;
    let pinName = `in${nextIndex}`;
    while (pinName in requires) {
        nextIndex++;
        pinName = `in${nextIndex}`;
    }

    pushToHistory();
    const updatedInputs = { ...requires, [pinName]: 'any' };
    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                inputs: updatedInputs
            }
        }
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function handleAddOutputPin(nodeId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;
    
    const provides = getNodeOutputs(node);
    let nextIndex = 0;
    let pinName = `out${nextIndex}`;
    while (pinName in provides) {
        nextIndex++;
        pinName = `out${nextIndex}`;
    }

    pushToHistory();
    const updatedOutputs = { ...provides, [pinName]: 'any' };
    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                outputs: updatedOutputs
            }
        }
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function handleDeleteInputPin(nodeId: string, pinId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.inputs) return;

    pushToHistory();
    const updatedInputs = { ...node.inputs };
    delete (updatedInputs as any)[pinId];

    const updatedEdges = appState.currentGraph.edges.filter(
        edge => !(edge.targetNodeId === nodeId && edge.targetPinId === pinId)
    );

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                inputs: updatedInputs
            }
        },
        edges: updatedEdges
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function handleDeleteOutputPin(nodeId: string, pinId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.outputs) return;

    pushToHistory();
    const updatedOutputs = { ...node.outputs };
    delete (updatedOutputs as any)[pinId];

    const updatedEdges = appState.currentGraph.edges.filter(
        edge => !(edge.sourceNodeId === nodeId && edge.sourcePinId === pinId)
    );

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                outputs: updatedOutputs
            }
        },
        edges: updatedEdges
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}



export function handleSwitchNodeMode(nodeId: string, newMode: NodeMode) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    pushToHistory();

    const initialParams: Record<string, any> = {};
    if (newMode === 'formula') {
        initialParams.formula = 'a + b';
    } else if (newMode === 'blocks') {
        initialParams.blocks = [
            { id: `b_${Math.random().toString(36).substr(2, 4)}`, targetVar: 'out', operand1: 'a', operator: '+', operand2: 'b' }
        ];
    } else if (newMode === 'python') {
        initialParams.code = 'def execute(inputs):\n    # inputs: dict\n    # return dict\n    return { "out": inputs.get("a", 0) + inputs.get("b", 0) }';
    } else if (newMode === 'delay') {
        initialParams.delayMs = 1000;
    } else if (newMode === 'state') {
        initialParams.defaultValue = 0;
    }

    let newType = node.type;
    if (newMode === 'formula') {
        newType = 'node/formula';
    } else if (newMode === 'blocks') {
        newType = 'node/blocks';
    } else if (newMode === 'python') {
        newType = 'node/python';
    } else if (newMode === 'delay') {
        newType = 'system/delay';
    } else if (newMode === 'state') {
        newType = 'system/state';
    }

    const tempNode = { ...node, type: newType, mode: newMode, params: initialParams };
    const nextInputs = getNodeInputs(tempNode);
    const nextOutputs = getNodeOutputs(tempNode);

    const updatedEdges = appState.currentGraph.edges.filter(edge => {
        if (edge.sourceNodeId === nodeId && !(edge.sourcePinId in nextOutputs)) return false;
        if (edge.targetNodeId === nodeId && !(edge.targetPinId in nextInputs)) return false;
        return true;
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: tempNode
        },
        edges: updatedEdges
    };

    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function updateNodeFormula(nodeId: string, formula: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    let newType = node.type;
    if (node.type === 'node/unconfigured') {
        newType = 'node/formula';
    }
    const tempNode = { ...node, type: newType, params: { ...node.params, formula } };
    const nextInputs = getNodeInputs(tempNode);

    const updatedEdges = appState.currentGraph.edges.filter(edge => {
        if (edge.targetNodeId === nodeId && !(edge.targetPinId in nextInputs)) return false;
        return true;
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: tempNode
        },
        edges: updatedEdges
    };
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function updateBlockField(nodeId: string, blockId: string, field: string, value: any) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.params.blocks) return;

    pushToHistory();
    const updatedBlocks = node.params.blocks.map(b => {
        if (b.id === blockId) {
            return { ...b, [field]: value };
        }
        return b;
    });

    let newType = node.type;
    if (node.type === 'node/unconfigured') {
        newType = 'node/blocks';
    }
    const tempNode = { ...node, type: newType, params: { ...node.params, blocks: updatedBlocks } };
    const nextInputs = getNodeInputs(tempNode);

    const updatedEdges = appState.currentGraph.edges.filter(edge => {
        if (edge.targetNodeId === nodeId && !(edge.targetPinId in nextInputs)) return false;
        return true;
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: tempNode
        },
        edges: updatedEdges
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function addBlockStatement(nodeId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    pushToHistory();
    const newBlock = {
        id: `b_${Math.random().toString(36).substr(2, 4)}`,
        targetVar: 'out',
        operand1: '0',
        operator: '+' as const,
        operand2: '0'
    };
    const updatedBlocks = [...(node.params.blocks || []), newBlock];

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                params: { ...node.params, blocks: updatedBlocks }
            }
        }
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function deleteBlockStatement(nodeId: string, blockId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.params.blocks) return;

    pushToHistory();
    const updatedBlocks = node.params.blocks.filter(b => b.id !== blockId);

    const tempNode = { ...node, params: { ...node.params, blocks: updatedBlocks } };
    const nextInputs = getNodeInputs(tempNode);

    const updatedEdges = appState.currentGraph.edges.filter(edge => {
        if (edge.targetNodeId === nodeId && !(edge.targetPinId in nextInputs)) return false;
        return true;
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: tempNode
        },
        edges: updatedEdges
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

function renderInputPinsList(paramsContainer: HTMLElement, node: NodeState, nodeDef: NodeDefinition | undefined) {
    const requires = Object.entries(getNodeInputs(node, appState.resolvedInputs)).filter(([pinId]) => pinId !== 'code');
    if (requires.length === 0) {
        const noParams = document.createElement('span');
        noParams.style.fontSize = '12px';
        noParams.style.color = 'var(--text-muted)';
        noParams.textContent = 'None';
        paramsContainer.appendChild(noParams);
        return;
    }

    const mode = getNodeMode(node);
    const baseInputs = getModeBaseInputs(mode, node);
    const incomingEdges = appState.currentGraph.edges.filter(e => e.targetNodeId === node.id);

    // Render Table Header
    const header = document.createElement('div');
    header.className = 'pin-table-header';
    
    const nameH = document.createElement('span');
    nameH.className = 'pin-header-col left';
    nameH.textContent = 'Name';
    header.appendChild(nameH);
    
    const srcH = document.createElement('span');
    srcH.className = 'pin-header-col';
    srcH.textContent = 'SRC';
    header.appendChild(srcH);
    
    const valH = document.createElement('span');
    valH.className = 'pin-header-col';
    valH.textContent = 'Value';
    header.appendChild(valH);
    
    const destH = document.createElement('span');
    destH.className = 'pin-header-col';
    destH.textContent = 'DEST';
    header.appendChild(destH);
    
    paramsContainer.appendChild(header);

    requires.forEach(([pinId, pinType]) => {
        const isConnected = incomingEdges.some(e => e.targetPinId === pinId);
        const row = document.createElement('div');
        row.className = 'pin-status-row';
        const isActive = pinId in baseInputs;
        if (!isActive) {
            row.style.opacity = '0.5';
            row.style.filter = 'grayscale(1)';
            row.title = `This input is inactive in '${mode}' mode.`;
        }
        row.draggable = true;

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'input', pinId }));
            row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            row.classList.add('drag-hover');
        });

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-hover');
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-hover');
            try {
                const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '{}');
                if (data.type === 'input') {
                    reorderInputPins(node.id, data.pinId, pinId);
                }
            } catch (err) {
                // Ignore
            }
        });

        // Column 1: Name
        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';
        nameRow.style.gap = '6px';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'pin-name';
        nameSpan.textContent = pinId;
        nameRow.appendChild(nameSpan);

        const isDynamic = !!(node.inputs && pinId in node.inputs && !(nodeDef && pinId in nodeDef.requires));
        if (isDynamic) {
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-delete-pin';
            btnDel.textContent = '×';
            btnDel.title = `Delete input '${pinId}'`;
            btnDel.addEventListener('click', () => {
                handleDeleteInputPin(node.id, pinId);
            });
            nameRow.appendChild(btnDel);
        }
        row.appendChild(nameRow);

        const flowFlow = getInputPinFlow(node, pinId);

        // Column 2: SRC
        const srcSpan = document.createElement('span');
        srcSpan.className = 'pin-col-text';
        if (!isActive) {
            srcSpan.className += ' inactive';
            srcSpan.textContent = '—';
        } else if (isConnected) {
            srcSpan.className += ' active-src';
            srcSpan.textContent = flowFlow.src;
            srcSpan.title = flowFlow.src;
        } else {
            srcSpan.textContent = 'LITERAL';
        }
        row.appendChild(srcSpan);

        // Column 3: Value
        const valCol = document.createElement('div');
        valCol.className = 'pin-col-val';
        if (isConnected) {
            const dashSpan = document.createElement('span');
            dashSpan.style.color = 'var(--text-muted)';
            dashSpan.style.fontSize = '12px';
            dashSpan.style.width = '100%';
            dashSpan.style.textAlign = 'right';
            dashSpan.textContent = '—';
            valCol.appendChild(dashSpan);
        } else {
            const currentVal = node.params[pinId] ?? '';
            if (!isActive) {
                const textInput = document.createElement('input');
                textInput.type = 'text';
                textInput.className = 'input-field';
                textInput.value = currentVal.toString();
                textInput.disabled = true;
                textInput.style.opacity = '0.5';
                valCol.appendChild(textInput);
            } else if (pinType === 'boolean') {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!currentVal;
                checkbox.style.width = '14px';
                checkbox.style.height = '14px';
                checkbox.style.cursor = 'pointer';
                checkbox.addEventListener('change', () => {
                    pushToHistory();
                    updateNodeParam(node.id, pinId, checkbox.checked);
                });
                valCol.appendChild(checkbox);
            } else {
                const textInput = document.createElement('input');
                textInput.type = pinType === 'number' ? 'number' : 'text';
                textInput.className = 'input-field';
                textInput.value = currentVal.toString();
                textInput.autocomplete = 'off';
                textInput.dataset.pinId = pinId;
                
                textInput.addEventListener('focus', () => {
                    appState.preEditGraphState = JSON.parse(JSON.stringify(appState.currentGraph));
                });

                textInput.addEventListener('input', () => {
                    if (appState.preEditGraphState) {
                        undoStack.push(appState.preEditGraphState);
                        if (undoStack.length > 50) undoStack.shift();
                        redoStack.length = 0;
                        updateUndoRedoButtons();
                        appState.preEditGraphState = null;
                    }

                    let parsedVal: any = textInput.value;
                    if (pinType === 'number') {
                        parsedVal = parseFloat(textInput.value);
                        if (isNaN(parsedVal)) parsedVal = 0;
                    }
                    updateNodeParam(node.id, pinId, parsedVal);
                });
                valCol.appendChild(textInput);
            }
        }
        row.appendChild(valCol);

        // Column 4: DEST
        const destSpan = document.createElement('span');
        destSpan.className = 'pin-col-text';
        if (!isActive) {
            destSpan.className += ' inactive';
            destSpan.textContent = '—';
        } else {
            destSpan.className += ' active-dest';
            destSpan.textContent = flowFlow.dest;
            destSpan.title = flowFlow.dest;
        }
        row.appendChild(destSpan);

        paramsContainer.appendChild(row);
    });
}

export function reorderInputPins(nodeId: string, draggedPinId: string, targetPinId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    const currentInputs = getNodeInputs(node);
    const keys = Object.keys(currentInputs);
    const draggedIndex = keys.indexOf(draggedPinId);
    const targetIndex = keys.indexOf(targetPinId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

    pushToHistory();

    const newKeys = [...keys];
    newKeys.splice(draggedIndex, 1);
    newKeys.splice(targetIndex, 0, draggedPinId);

    const newInputs: Record<string, PinType> = {};
    newKeys.forEach(k => {
        newInputs[k] = currentInputs[k];
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                inputs: newInputs
            }
        }
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function reorderOutputPins(nodeId: string, draggedPinId: string, targetPinId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    const currentOutputs = getNodeOutputs(node);
    const keys = Object.keys(currentOutputs);
    const draggedIndex = keys.indexOf(draggedPinId);
    const targetIndex = keys.indexOf(targetPinId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

    pushToHistory();

    const newKeys = [...keys];
    newKeys.splice(draggedIndex, 1);
    newKeys.splice(targetIndex, 0, draggedPinId);

    const newOutputs: Record<string, PinType> = {};
    newKeys.forEach(k => {
        newOutputs[k] = currentOutputs[k];
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [nodeId]: {
                ...node,
                outputs: newOutputs
            }
        }
    };
    updateInspector();
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    triggerAutoRun();
}

export function setupAutocomplete(input: HTMLInputElement, getSuggestions: () => string[]) {
    let activeIndex = -1;
    let dropdown: HTMLDivElement | null = null;

    const removeDropdown = () => {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
    };

    const getActiveToken = () => {
        const val = input.value;
        const pos = input.selectionStart || 0;
        const textBefore = val.slice(0, pos);
        const lastWordMatch = textBefore.match(/[a-zA-Z0-9_]+$/);
        if (lastWordMatch) {
            return {
                query: lastWordMatch[0].toLowerCase(),
                start: pos - lastWordMatch[0].length,
                end: pos
            };
        }
        return null;
    };

    const selectSuggestion = (suggestion: string) => {
        const token = getActiveToken();
        if (token) {
            const val = input.value;
            input.value = val.slice(0, token.start) + suggestion + val.slice(token.end);
            input.setSelectionRange(token.start + suggestion.length, token.start + suggestion.length);
        } else {
            input.value = suggestion;
        }
        input.dispatchEvent(new Event('change')); // Trigger update handlers
        input.dispatchEvent(new Event('input'));  // Trigger input updates
        removeDropdown();
    };

    input.addEventListener('input', () => {
        const token = getActiveToken();
        removeDropdown();

        if (!token || !token.query) return;

        const allSuggestions = getSuggestions();
        const matches = allSuggestions.filter(s => s.toLowerCase().startsWith(token.query) && s.toLowerCase() !== token.query);

        if (matches.length === 0) return;

        dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        
        const rect = input.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY + 2}px`;
        dropdown.style.minWidth = `${rect.width}px`;
        
        matches.forEach((suggestion, idx) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = suggestion;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Keep input focused
                selectSuggestion(suggestion);
            });
            dropdown!.appendChild(item);
        });

        document.body.appendChild(dropdown);
    });

    input.addEventListener('keydown', (e) => {
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('.autocomplete-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex < items.length - 1) {
                if (activeIndex >= 0) items[activeIndex].classList.remove('active');
                activeIndex++;
                items[activeIndex].classList.add('active');
                (items[activeIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeIndex > 0) {
                items[activeIndex].classList.remove('active');
                activeIndex--;
                items[activeIndex].classList.add('active');
                (items[activeIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < items.length) {
                e.preventDefault();
                selectSuggestion(items[activeIndex].textContent || '');
            }
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            removeDropdown();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(removeDropdown, 150);
    });
}

function getInputPinFlow(node: NodeState, pinId: string): { src: string; dest: string } {
    const mode = getNodeMode(node);
    let dest = '—';
    if (mode === 'formula') {
        const formula = (node.params.formula ?? '').toString();
        const regex = new RegExp(`\\b${pinId}\\b`);
        if (regex.test(formula)) {
            dest = 'FORMULA';
        }
    } else if (mode === 'blocks') {
        const blocks = node.params.blocks ?? [];
        const isUsed = blocks.some((b: any) => b.operand1 === pinId || b.operand2 === pinId || b.targetVar === pinId);
        if (isUsed) {
            dest = 'BLOCKS';
        }
    } else if (mode === 'python') {
        const code = (node.params.code ?? '').toString();
        if (code.includes(pinId)) {
            dest = 'PYTHON';
        }
    } else if (node.type.startsWith('system/')) {
        dest = 'SYSTEM';
    }

    let src = 'LITERAL';
    const edge = appState.currentGraph.edges.find(e => e.targetNodeId === node.id && e.targetPinId === pinId);
    if (edge) {
        const srcNode = appState.currentGraph.nodes[edge.sourceNodeId];
        const srcLabel = srcNode?.ui?.title || edge.sourceNodeId;
        src = `${srcLabel}.${edge.sourcePinId}`;
    }

    return { src, dest };
}

function getOutputPinFlow(node: NodeState, pinId: string): { src: string; dest: string } {
    const mode = getNodeMode(node);
    let src = '—';
    if (pinId === 'out0') {
        if (mode === 'formula') src = 'FORMULA';
        else if (mode === 'blocks') src = 'BLOCKS';
        else if (mode === 'python') src = 'PYTHON';
    } else if (node.type.startsWith('system/')) {
        src = 'SYSTEM';
    }

    let dest = '—';
    const edges = appState.currentGraph.edges.filter(e => e.sourceNodeId === node.id && e.sourcePinId === pinId);
    if (edges.length > 0) {
        dest = edges.map(e => {
            const tgtNode = appState.currentGraph.nodes[e.targetNodeId];
            const tgtLabel = tgtNode?.ui?.title || e.targetNodeId;
            return `${tgtLabel}.${e.targetPinId}`;
        }).join(', ');
    }

    return { src, dest };
}
