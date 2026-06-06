import { StandardNodes, getNodeInputs, getNodeOutputs, getNodeMode, getDefaultFormulaForType } from '../registry/index.js';
import { NodeMode } from '../core/ast.js';
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



    const activeMode = getNodeMode(node);
    const isPython = activeMode === 'python';

    // Add/Remove Pin buttons setup
    const btnAddInput = document.getElementById('btn-add-input');
    const btnRemoveInput = document.getElementById('btn-remove-input');
    const btnAddOutput = document.getElementById('btn-add-output');
    const btnRemoveOutput = document.getElementById('btn-remove-output');

    if (btnAddInput && btnRemoveInput) {
        if (nodeDef?.dynamicInputs && isPython) {
            btnAddInput.classList.remove('hidden');
            
            const deletableInputs = node.inputs ? Object.keys(node.inputs).filter(
                pinId => !(nodeDef && pinId in nodeDef.requires)
            ) : [];
            const hasCustomInputs = deletableInputs.length > 0;
            if (hasCustomInputs) {
                btnRemoveInput.classList.remove('hidden');
            } else {
                btnRemoveInput.classList.add('hidden');
            }

            const newAddBtn = btnAddInput.cloneNode(true) as HTMLButtonElement;
            btnAddInput.parentNode?.replaceChild(newAddBtn, btnAddInput);
            newAddBtn.addEventListener('click', () => {
                handleAddInputPin(node.id);
            });

            const newRemoveBtn = btnRemoveInput.cloneNode(true) as HTMLButtonElement;
            btnRemoveInput.parentNode?.replaceChild(newRemoveBtn, btnRemoveInput);
            newRemoveBtn.addEventListener('click', () => {
                handleRemoveLastInputPin(node.id);
            });
        } else {
            btnAddInput.classList.add('hidden');
            btnRemoveInput.classList.add('hidden');
        }
    }

    if (btnAddOutput && btnRemoveOutput) {
        if (nodeDef?.dynamicOutputs && isPython) {
            btnAddOutput.classList.remove('hidden');
            
            const deletableOutputs = node.outputs ? Object.keys(node.outputs).filter(
                pinId => !(nodeDef && pinId in nodeDef.provides)
            ) : [];
            const hasCustomOutputs = deletableOutputs.length > 0;
            if (hasCustomOutputs) {
                btnRemoveOutput.classList.remove('hidden');
            } else {
                btnRemoveOutput.classList.add('hidden');
            }

            const newAddBtn = btnAddOutput.cloneNode(true) as HTMLButtonElement;
            btnAddOutput.parentNode?.replaceChild(newAddBtn, btnAddOutput);
            newAddBtn.addEventListener('click', () => {
                handleAddOutputPin(node.id);
            });

            const newRemoveBtn = btnRemoveOutput.cloneNode(true) as HTMLButtonElement;
            btnRemoveOutput.parentNode?.replaceChild(newRemoveBtn, btnRemoveOutput);
            newRemoveBtn.addEventListener('click', () => {
                handleRemoveLastOutputPin(node.id);
            });
        } else {
            btnAddOutput.classList.add('hidden');
            btnRemoveOutput.classList.add('hidden');
        }
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

    // 1. Rebuild Parameter Editor Container
    const paramsContainer = document.getElementById('inspect-parameters-container');
    if (paramsContainer) {
        paramsContainer.replaceChildren();
        const mode = getNodeMode(node);

        if (mode === 'formula') {
            const row = document.createElement('div');
            row.className = 'param-input-row';

            const label = document.createElement('label');
            label.textContent = 'Formula';
            row.appendChild(label);

            const formulaInput = document.createElement('input');
            formulaInput.type = 'text';
            formulaInput.className = 'input-field';
            formulaInput.value = node.params.formula ?? getDefaultFormulaForType(node.type);
            formulaInput.autocomplete = 'off';

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
            paramsContainer.appendChild(row);
        } else if (mode === 'blocks') {
            const blocksList = node.params.blocks ?? [];
            blocksList.forEach((block) => {
                const blockRow = document.createElement('div');
                blockRow.style.display = 'flex';
                blockRow.style.alignItems = 'center';
                blockRow.style.gap = '6px';
                blockRow.style.marginBottom = '8px';

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
                targetInput.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'targetVar', targetInput.value);
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
                op1Input.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'operand1', op1Input.value);
                });
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
                op2Input.addEventListener('change', () => {
                    updateBlockField(node.id, block.id, 'operand2', op2Input.value);
                });
                blockRow.appendChild(op2Input);

                const btnDelBlock = document.createElement('button');
                btnDelBlock.className = 'btn-delete-pin';
                btnDelBlock.textContent = '×';
                btnDelBlock.title = 'Delete Block';
                btnDelBlock.addEventListener('click', () => {
                    deleteBlockStatement(node.id, block.id);
                });
                blockRow.appendChild(btnDelBlock);

                paramsContainer.appendChild(blockRow);
            });

            const btnAddBlock = document.createElement('button');
            btnAddBlock.className = 'btn-add-pin';
            btnAddBlock.textContent = '+ Add Block';
            btnAddBlock.style.marginTop = '8px';
            btnAddBlock.addEventListener('click', () => {
                addBlockStatement(node.id);
            });
            paramsContainer.appendChild(btnAddBlock);
        } else {
            // Python, Delay, State
            const requires = Object.entries(getNodeInputs(node));
            const incomingEdges = appState.currentGraph.edges.filter(e => e.targetNodeId === node.id);

            requires.forEach(([pinId, pinType]) => {
                const isConnected = incomingEdges.some(e => e.targetPinId === pinId);
                const row = document.createElement('div');
                row.className = 'param-input-row';

                const labelRow = document.createElement('div');
                labelRow.style.display = 'flex';
                labelRow.style.justifyContent = 'space-between';
                labelRow.style.alignItems = 'center';

                const label = document.createElement('label');
                label.textContent = `${pinId} (${pinType})`;
                labelRow.appendChild(label);

                const isDynamic = !!(node.inputs && pinId in node.inputs && !(nodeDef && pinId in nodeDef.requires));
                if (isDynamic) {
                    const btnDel = document.createElement('button');
                    btnDel.className = 'btn-delete-pin';
                    btnDel.textContent = '×';
                    btnDel.title = `Delete input '${pinId}'`;
                    btnDel.addEventListener('click', () => {
                        handleDeleteInputPin(node.id, pinId);
                    });
                    labelRow.appendChild(btnDel);
                }
                row.appendChild(labelRow);

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
                    const currentVal = node.params[pinId] ?? '';
                    
                    if (pinType === 'boolean') {
                        const checkLabel = document.createElement('label');
                        checkLabel.className = 'input-field-checkbox';
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = !!currentVal;
                        checkbox.addEventListener('change', () => {
                            pushToHistory();
                            updateNodeParam(node.id, pinId, checkbox.checked);
                        });
                        checkLabel.appendChild(checkbox);
                        checkLabel.appendChild(document.createTextNode(' Enabled'));
                    } else if (pinId === 'code') {
                        const textArea = document.createElement('textarea');
                        textArea.className = 'input-field';
                        textArea.style.fontFamily = '"Fira Code", monospace';
                        textArea.style.minHeight = '140px';
                        textArea.style.fontSize = '11px';
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
                            updateNodeParam(node.id, pinId, textArea.value);
                        });
                        row.appendChild(textArea);
                    } else {
                        const textInput = document.createElement('input');
                        textInput.type = pinType === 'number' ? 'number' : 'text';
                        textInput.className = 'input-field';
                        textInput.value = currentVal.toString();
                        textInput.autocomplete = 'off';
                        
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
    }

    // 2. Rebuild Outputs Container
    const outputsContainer = document.getElementById('inspect-outputs-container');
    if (outputsContainer && nodeDef) {
        outputsContainer.replaceChildren();

        const provides = Object.keys(getNodeOutputs(node));
        provides.forEach(pinId => {
            const row = document.createElement('div');
            row.className = 'pin-status-row';

            const leftContainer = document.createElement('div');
            leftContainer.style.display = 'flex';
            leftContainer.style.alignItems = 'center';
            leftContainer.style.gap = '8px';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pin-name';
            nameSpan.textContent = pinId;
            leftContainer.appendChild(nameSpan);

            const isDynamic = !!(node.outputs && pinId in node.outputs && !(nodeDef && pinId in nodeDef.provides));
            if (isDynamic) {
                const btnDel = document.createElement('button');
                btnDel.className = 'btn-delete-pin';
                btnDel.textContent = '×';
                btnDel.title = `Delete output '${pinId}'`;
                btnDel.addEventListener('click', () => {
                    handleDeleteOutputPin(node.id, pinId);
                });
                leftContainer.appendChild(btnDel);
            }
            row.appendChild(leftContainer);

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
    let pinName = `input${nextIndex}`;
    while (pinName in requires) {
        nextIndex++;
        pinName = `input${nextIndex}`;
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
    let pinName = `output${nextIndex}`;
    while (pinName in provides) {
        nextIndex++;
        pinName = `output${nextIndex}`;
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

export function handleRemoveLastInputPin(nodeId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.inputs) return;
    const nodeDef = StandardNodes[node.type];

    const deletablePins = Object.keys(node.inputs).filter(
        pinId => !(nodeDef && pinId in nodeDef.requires)
    );
    if (deletablePins.length === 0) return;

    const pinIdToDelete = deletablePins[deletablePins.length - 1];
    handleDeleteInputPin(nodeId, pinIdToDelete);
}

export function handleRemoveLastOutputPin(nodeId: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node || !node.outputs) return;
    const nodeDef = StandardNodes[node.type];

    const deletablePins = Object.keys(node.outputs).filter(
        pinId => !(nodeDef && pinId in nodeDef.provides)
    );
    if (deletablePins.length === 0) return;

    const pinIdToDelete = deletablePins[deletablePins.length - 1];
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

    const tempNode = { ...node, mode: newMode, params: initialParams };
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
            [nodeId]: {
                ...node,
                mode: newMode,
                params: initialParams
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

export function updateNodeFormula(nodeId: string, formula: string) {
    const node = appState.currentGraph.nodes[nodeId];
    if (!node) return;

    const tempNode = { ...node, params: { ...node.params, formula } };
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
