import { RenderingContext } from './types.js';
import { createRenderer } from './renderer.js';
import { StandardNodes } from '../registry/index.js';
import { NODE_WIDTH } from './canvas.js';
import { appState, syncContextState, updateCursor, getNodeHeight } from './state.js';
import { runExecutionPipeline, logToTerminal } from './execution.js';
import { setupInteractions, deleteSelectedNodes, zoomExtents, closeNodeAdder } from './interactions.js';
import { undo, redo, pushToHistory } from './history.js';
import { loadSettings, updateSetting } from './settings.js';
import { autoLayoutGraph } from './layout.js';
import { watchLiquidGlass } from './liquid_glass.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    appState.canvas = canvas;
    appState.ctx = ctx;

    const settings = loadSettings();

    // Differentiate shortcut hints depending on the platform (Mac vs Win/Linux) (Fixes #18)
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || (navigator.userAgent && /Mac/.test(navigator.userAgent));
    if (isMac) {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');

        if (btnUndo) btnUndo.setAttribute('title', 'Undo last action (⌘Z)');
        if (btnRedo) btnRedo.setAttribute('title', 'Redo last action (⌘Y)');
        if (btnSidebarToggle) btnSidebarToggle.setAttribute('data-tooltip', 'Toggle Panel (⌘B) - Manually show or hide the sidebar panel');
    }

    // Handle resize with DPR support (Fixes #17)
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    };
    window.addEventListener('resize', resizeCanvas);

    // Initialize rendering context object
    const renderingContext: RenderingContext = {
        canvas,
        ctx,
        viewport: appState.viewport,
        backgroundColor: settings.canvas.backgroundColor,
        selectedNodeId: appState.selectedNodeId,
        selectedNodeIds: appState.selectedNodeIds,
        hoveredNodeId: appState.hoveredNodeId,
        hoveredPin: appState.hoveredPin,
        draggingConnection: null,
        nodeErrors: appState.nodeErrors,
        selectionBox: null,
        lastExecutionTime: 0,
        edgeStyle: settings.canvas.edgeStyle,
        gridStyle: settings.canvas.gridStyle || 'dot',
        needsRedraw: true
    };

    appState.renderingContext = renderingContext;

    // Instantiate and start renderer
    const renderer = createRenderer(renderingContext, () => appState.currentGraph, StandardNodes);
    renderer.start();
    updateCursor();

    // Sidebar Collapsible Management
    const sidebar = document.getElementById('sidebar');
    const btnSidebar = document.getElementById('btn-sidebar-toggle');
    
    const setSidebarCollapsed = (collapsed: boolean) => {
        if (!sidebar) return;
        const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
        if (isCurrentlyCollapsed === collapsed) return;

        if (collapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }

        updateSetting('layout', 'sidebarCollapsed', collapsed);

        // No emoji overwrite to preserve the vector SVGs
        
        // Animate resize smoothly over transition
        let startTime = Date.now();
        const animateResize = () => {
            resizeCanvas();
            renderer.triggerSingleFrame();
            if (Date.now() - startTime < 350) {
                requestAnimationFrame(animateResize);
            }
        };
        animateResize();
    };
    
    (window as any).setSidebarCollapsed = setSidebarCollapsed;

    // Initialize Sidebar Collapsed state from settings
    if (sidebar) {
        sidebar.classList.add('no-transition');
        if (settings.layout.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
        // Force reflow to apply styles instantly
        void sidebar.offsetHeight;
        sidebar.classList.remove('no-transition');
    }

    const toggleSidebar = () => {
        if (!sidebar) return;
        const isCollapsed = !sidebar.classList.contains('collapsed');
        setSidebarCollapsed(isCollapsed);
    };
    
    btnSidebar?.addEventListener('click', toggleSidebar);

    // Finalize canvas bounds and redraw once sidebar transition finishes
    sidebar?.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'margin-right' || e.propertyName === 'transform') {
            resizeCanvas();
            renderer.triggerSingleFrame();
        }
    });

    // Initialize and bind Pin-sidebar toggle state
    const chkPinSidebar = document.getElementById('chk-pin-sidebar') as HTMLInputElement | null;
    const menuChkPinSidebar = document.getElementById('menu-chk-pin-sidebar-opt') as HTMLInputElement | null;
    
    if (chkPinSidebar) {
        chkPinSidebar.checked = settings.layout.sidebarPinned;
    }
    if (menuChkPinSidebar) {
        menuChkPinSidebar.checked = settings.layout.sidebarPinned;
    }

    function setPinSidebar(enabled: boolean) {
        if (chkPinSidebar) chkPinSidebar.checked = enabled;
        if (menuChkPinSidebar) menuChkPinSidebar.checked = enabled;
        updateSetting('layout', 'sidebarPinned', enabled);
        import('./inspector.js').then(mod => {
            mod.updateInspector();
        });
    }

    chkPinSidebar?.addEventListener('change', () => {
        if (chkPinSidebar) setPinSidebar(chkPinSidebar.checked);
    });

    const menuTogglePin = document.getElementById('menu-toggle-pin-sidebar');
    menuTogglePin?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== menuChkPinSidebar) {
            e.preventDefault();
            if (menuChkPinSidebar) menuChkPinSidebar.checked = !menuChkPinSidebar.checked;
        }
        if (menuChkPinSidebar) setPinSidebar(menuChkPinSidebar.checked);
    });

    // Initialize and bind Auto-Run state
    const chkAutoRun = document.getElementById('chk-auto-run') as HTMLInputElement | null;
    const menuChkAutoRun = document.getElementById('menu-chk-autorun') as HTMLInputElement | null;
    
    if (chkAutoRun) {
        chkAutoRun.checked = settings.canvas.autoRun;
    }
    if (menuChkAutoRun) {
        menuChkAutoRun.checked = settings.canvas.autoRun;
    }

    function setAutoRun(enabled: boolean) {
        if (chkAutoRun) chkAutoRun.checked = enabled;
        if (menuChkAutoRun) menuChkAutoRun.checked = enabled;
        updateSetting('canvas', 'autoRun', enabled);
    }

    chkAutoRun?.addEventListener('change', () => {
        if (chkAutoRun) setAutoRun(chkAutoRun.checked);
    });

    const menuToggleAuto = document.getElementById('menu-toggle-autorun');
    menuToggleAuto?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== menuChkAutoRun) {
            e.preventDefault();
            if (menuChkAutoRun) menuChkAutoRun.checked = !menuChkAutoRun.checked;
        }
        if (menuChkAutoRun) setAutoRun(menuChkAutoRun.checked);
    });

    // Initialize and bind Snap to Grid state
    const chkSnapGrid = document.getElementById('chk-snap-grid') as HTMLInputElement | null;
    const menuChkSnapGrid = document.getElementById('menu-chk-snap-grid-opt') as HTMLInputElement | null;

    if (chkSnapGrid) {
        chkSnapGrid.checked = settings.canvas.snapToGrid;
    }
    if (menuChkSnapGrid) {
        menuChkSnapGrid.checked = settings.canvas.snapToGrid;
    }

    function setSnapGrid(enabled: boolean) {
        if (chkSnapGrid) chkSnapGrid.checked = enabled;
        if (menuChkSnapGrid) menuChkSnapGrid.checked = enabled;
        updateSetting('canvas', 'snapToGrid', enabled);
    }

    chkSnapGrid?.addEventListener('change', () => {
        if (chkSnapGrid) setSnapGrid(chkSnapGrid.checked);
    });

    const menuToggleSnap = document.getElementById('menu-toggle-snap-grid');
    menuToggleSnap?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== menuChkSnapGrid) {
            e.preventDefault();
            if (menuChkSnapGrid) menuChkSnapGrid.checked = !menuChkSnapGrid.checked;
        }
        if (menuChkSnapGrid) setSnapGrid(menuChkSnapGrid.checked);
    });

    // Initialize and bind Auto Bring to Front state
    const menuChkAutoFront = document.getElementById('menu-chk-auto-front-opt') as HTMLInputElement | null;

    if (menuChkAutoFront) {
        menuChkAutoFront.checked = settings.canvas.autoBringToFront;
    }

    function setAutoFront(enabled: boolean) {
        if (menuChkAutoFront) menuChkAutoFront.checked = enabled;
        updateSetting('canvas', 'autoBringToFront', enabled);
    }

    const menuToggleAutoFront = document.getElementById('menu-toggle-auto-front');
    menuToggleAutoFront?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== menuChkAutoFront) {
            e.preventDefault();
            if (menuChkAutoFront) menuChkAutoFront.checked = !menuChkAutoFront.checked;
        }
        if (menuChkAutoFront) setAutoFront(menuChkAutoFront.checked);
    });

    // Initialize and bind Edge Style state
    const menuLblEdgeStyle = document.getElementById('menu-lbl-edge-style');
    const menuToggleEdgeStyle = document.getElementById('menu-toggle-edge-style');

    function updateEdgeStyleLabel(style: 'spline' | 'orthogonal') {
        if (menuLblEdgeStyle) {
            menuLblEdgeStyle.textContent = `🔌 Edge Style: ${style === 'orthogonal' ? 'Orthogonal' : 'Spline'}`;
        }
    }

    // Set initial label
    updateEdgeStyleLabel(settings.canvas.edgeStyle || 'spline');

    menuToggleEdgeStyle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentSettings = loadSettings();
        const newStyle = currentSettings.canvas.edgeStyle === 'orthogonal' ? 'spline' : 'orthogonal';
        updateSetting('canvas', 'edgeStyle', newStyle);
        updateEdgeStyleLabel(newStyle);
        if (appState.renderingContext) {
            appState.renderingContext.edgeStyle = newStyle;
            appState.renderingContext.needsRedraw = true;
        }
    });

    // Initialize and bind Grid Style state
    const menuLblGridStyle = document.getElementById('menu-lbl-grid-style');
    const menuToggleGridStyle = document.getElementById('menu-toggle-grid-style');

    function updateGridStyleLabel(style: 'dot' | 'line') {
        if (menuLblGridStyle) {
            menuLblGridStyle.textContent = `🌐 Grid Style: ${style === 'line' ? 'Line' : 'Dot'}`;
        }
    }

    updateGridStyleLabel(settings.canvas.gridStyle || 'dot');

    menuToggleGridStyle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentSettings = loadSettings();
        const newStyle = currentSettings.canvas.gridStyle === 'line' ? 'dot' : 'line';
        updateSetting('canvas', 'gridStyle', newStyle);
        updateGridStyleLabel(newStyle);
        if (appState.renderingContext) {
            appState.renderingContext.gridStyle = newStyle;
            appState.renderingContext.needsRedraw = true;
        }
    });

    // Theme Management initialization and click handlers
    const chkDarkMode = document.getElementById('menu-chk-darkmode') as HTMLInputElement | null;

    function applyTheme(theme: 'light' | 'dark') {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (chkDarkMode) chkDarkMode.checked = false;
        } else {
            document.body.classList.remove('light-theme');
            if (chkDarkMode) chkDarkMode.checked = true;
        }
        updateSetting('ui', 'theme', theme);
        renderer.triggerSingleFrame();
    }

    // Initialize theme state
    applyTheme(settings.ui.theme);

    const menuToggleDark = document.getElementById('menu-toggle-darkmode');
    menuToggleDark?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== chkDarkMode) {
            e.preventDefault();
            if (chkDarkMode) chkDarkMode.checked = !chkDarkMode.checked;
        }
        applyTheme(chkDarkMode?.checked ? 'dark' : 'light');
    });

    // Canvas Background Color picker handling
    const colorCanvasBg = document.getElementById('menu-color-canvas-bg') as HTMLInputElement | null;
    if (colorCanvasBg) {
        colorCanvasBg.value = settings.canvas.backgroundColor || '#f3f4f6';
        colorCanvasBg.addEventListener('input', (e) => {
            const newColor = (e.target as HTMLInputElement).value;
            updateSetting('canvas', 'backgroundColor', newColor);
            if (appState.renderingContext) {
                appState.renderingContext.backgroundColor = newColor;
                appState.renderingContext.needsRedraw = true;
            }
        });
        colorCanvasBg.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Trigger initial layout resize once DOM state is finalized
    resizeCanvas();

    // Wire up interactions
    setupInteractions();

    // Trigger initial run
    runExecutionPipeline().catch(console.error);

    // ========================================================================
    // HEADER AND GLOBAL CONTROL HOOKS
    // ========================================================================

    document.getElementById('btn-run')?.addEventListener('click', () => {
        runExecutionPipeline().catch(console.error);
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        appState.viewport.zoom = Math.min(3.0, appState.viewport.zoom * 1.2);
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        appState.viewport.zoom = Math.max(0.05, appState.viewport.zoom / 1.2);
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
    });

    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
        appState.viewport.zoom = 1.0;
        appState.viewport.x = 0;
        appState.viewport.y = 0;
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
    });

    // Fit Graph to Screen (Fixes #15)
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
        zoomExtents();
    });

    // Undo/Redo Button clicks
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);

    document.getElementById('btn-auto-layout')?.addEventListener('click', () => {
        pushToHistory();
        appState.currentGraph = autoLayoutGraph(appState.currentGraph);
        syncContextState();
        runExecutionPipeline().catch(console.error);
        logToTerminal("Auto-layout applied topologically.", "system-msg");
    });

    // Sidebar Hooks
    document.getElementById('btn-delete-node')?.addEventListener('click', () => {
        deleteSelectedNodes();
    });



    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
        const consoleView = document.getElementById('terminal-console');
        if (consoleView) {
            consoleView.replaceChildren();
            logToTerminal(`Console cleared.`, 'system-msg');
        }
    });

    // Toggle Node Inspector Collapsible block
    const inspectorHeader = document.getElementById('inspector-header');
    const inspectorSection = document.getElementById('inspector-section');
    if (inspectorSection) {
        if (settings.layout.inspectorExpanded) {
            inspectorSection.classList.add('expanded');
        } else {
            inspectorSection.classList.remove('expanded');
        }
    }
    inspectorHeader?.addEventListener('click', () => {
        const wasExpanded = inspectorSection?.classList.toggle('expanded');
        updateSetting('layout', 'inspectorExpanded', !!wasExpanded);
    });

    // Toggle AST JSON Collapsible block
    const astHeader = document.getElementById('ast-header');
    const astSection = document.getElementById('ast-section');
    if (astSection) {
        if (settings.layout.astExpanded) {
            astSection.classList.add('expanded');
        } else {
            astSection.classList.remove('expanded');
        }
    }
    astHeader?.addEventListener('click', () => {
        const wasExpanded = astSection?.classList.toggle('expanded');
        updateSetting('layout', 'astExpanded', !!wasExpanded);
    });

    // Toggle Logs Collapsible block
    const logsHeader = document.getElementById('logs-header');
    const logsSection = document.getElementById('logs-section');
    if (logsSection) {
        if (settings.layout.logsExpanded !== false) {
            logsSection.classList.add('expanded');
        } else {
            logsSection.classList.remove('expanded');
        }
    }
    logsHeader?.addEventListener('click', (e) => {
        // Clear button click should not trigger collapse
        if ((e.target as HTMLElement).closest('#btn-clear-logs')) return;
        const wasExpanded = logsSection?.classList.toggle('expanded');
        updateSetting('layout', 'logsExpanded', !!wasExpanded);
    });

    // Close Adder
    document.getElementById('btn-close-adder')?.addEventListener('click', () => {
        closeNodeAdder();
    });

    // ========================================================================
    // MAIN DROPDOWN MENU OPERATIONS
    // ========================================================================
    const btnMainMenu = document.getElementById('btn-main-menu');
    const mainDropdownMenu = document.getElementById('main-dropdown-menu');
    const submenuParent = document.querySelector('.dropdown-submenu-parent') as HTMLElement | null;
    const submenu = document.getElementById('main-settings-submenu') as HTMLElement | null;
 
    btnMainMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = mainDropdownMenu?.classList.toggle('hidden');
        btnMainMenu.classList.toggle('active', !isHidden);
        if (isHidden) {
            submenu?.classList.remove('open');
        }
    });

    // Auto-close menu on clicking outside
    window.addEventListener('click', () => {
        mainDropdownMenu?.classList.add('hidden');
        btnMainMenu?.classList.remove('active');
        submenu?.classList.remove('open');
    });

    // Open submenu on hover
    submenuParent?.addEventListener('mouseenter', () => {
        if (submenu && submenuParent) {
            const parentRect = submenuParent.getBoundingClientRect();
            // Position settings submenu dynamically next to its parent item
            submenu.style.top = `${parentRect.top - 6}px`;
            submenu.style.left = `${parentRect.right + 2}px`; // 2px overlap to avoid visual gap
        }
        submenu?.classList.add('open');
    });

    // Also support clicking submenu trigger to toggle
    submenuParent?.addEventListener('click', (e) => {
        e.stopPropagation();
        submenu?.classList.toggle('open');
    });

    // Close settings submenu if user hovers over other non-settings items
    const nonSubmenuItems = mainDropdownMenu?.querySelectorAll('.dropdown-item:not(#menu-settings-trigger)');
    nonSubmenuItems?.forEach(item => {
        item.addEventListener('mouseenter', () => {
            submenu?.classList.remove('open');
        });
    });

    // 1. Load Demo Graph
    document.getElementById('menu-load-demo')?.addEventListener('click', () => {
        import('./state.js').then(mod => {
            pushToHistory();
            appState.currentGraph = structuredClone(mod.defaultGraph);
            appState.selectedNodeId = null;
            appState.selectedNodeIds.clear();
            syncContextState();
            import('./inspector.js').then(ins => ins.updateInspector());
            runExecutionPipeline().catch(console.error);
            logToTerminal("Demo Graph loaded successfully.", "system-msg");
        });
    });

    // 2. Import JSON AST
    document.getElementById('menu-import-json')?.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.addEventListener('change', (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event: any) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (imported && typeof imported === 'object' && imported.nodes && imported.edges) {
                        pushToHistory();
                        appState.currentGraph = imported;
                        appState.selectedNodeId = null;
                        appState.selectedNodeIds.clear();
                        syncContextState();
                        import('./inspector.js').then(ins => ins.updateInspector());
                        runExecutionPipeline().catch(console.error);
                        logToTerminal("Graph AST imported successfully.", "system-msg");
                    } else {
                        alert("Invalid JSON format: missing 'nodes' or 'edges' fields.");
                    }
                } catch (err) {
                    alert("Failed to parse JSON file.");
                }
            };
            reader.readAsText(file);
        });
        fileInput.click();
    });

    // 3. Export JSON AST
    document.getElementById('menu-export-json')?.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.currentGraph, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "litegraph-ast.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        logToTerminal("Graph AST exported successfully.", "system-msg");
    });

    // 3.5. Export Execution JSON AST (Strips UI metadata)
    document.getElementById('menu-export-execution-json')?.addEventListener('click', () => {
        const cleanNodes: Record<string, any> = {};
        Object.entries(appState.currentGraph.nodes).forEach(([id, node]) => {
            cleanNodes[id] = {
                id: node.id,
                type: node.type,
                params: node.params
            };
        });
        const cleanGraph = {
            nodes: cleanNodes,
            edges: appState.currentGraph.edges
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanGraph, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "litegraph-execution-ast.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        logToTerminal("Execution AST exported successfully (without UI layout details).", "system-msg");
    });

    // 4. Clear Workspace
    document.getElementById('menu-clear-workspace')?.addEventListener('click', () => {
        const confirmed = confirm("Are you sure you want to clear the workspace? This will permanently delete all nodes and connections in your current graph.");
        if (!confirmed) return;

        pushToHistory();
        appState.currentGraph = { nodes: {}, edges: [] };
        appState.selectedNodeId = null;
        appState.selectedNodeIds.clear();
        syncContextState();
        import('./inspector.js').then(ins => ins.updateInspector());
        runExecutionPipeline().catch(console.error);
        logToTerminal("Workspace cleared.", "system-msg");
    });

    // 5. Liquid Glass Mouse-Reactive Specular Reflection
    const zoomControls = document.querySelector('.zoom-controls') as HTMLElement | null;
    if (zoomControls) {
        zoomControls.addEventListener('mousemove', (e) => {
            const rect = zoomControls.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            zoomControls.style.setProperty('--mouse-x', `${x}px`);
            zoomControls.style.setProperty('--mouse-y', `${y}px`);
        });
        zoomControls.addEventListener('mouseleave', () => {
            zoomControls.style.setProperty('--mouse-x', `-999px`);
            zoomControls.style.setProperty('--mouse-y', `-999px`);
        });
    }

    // Apply dynamic Liquid Glass UI effect to all glass panels in the DOM
    const glassPanels = document.querySelectorAll('.glass-panel');
    const glassCleanups: (() => void)[] = [];
    
    glassPanels.forEach(panel => {
        let bezelWidth = 12;
        let refractionScale = 36;
        let backdropBlur = 18;
        let specularOpacity = 0.24;
        
        if (panel.id === 'sidebar' || panel.id === 'zoom-toolbar') {
            bezelWidth = 6;
            refractionScale = 24;
            backdropBlur = 6;
            specularOpacity = 0.18;
        } else if (panel.id === 'context-menu' || panel.id === 'main-dropdown-menu' || panel.id === 'main-settings-submenu') {
            bezelWidth = 9;
            refractionScale = 27;
            backdropBlur = 12;
            specularOpacity = 0.24;
        } else if (panel.id === 'app-header') {
            bezelWidth = 12;
            refractionScale = 48;
            backdropBlur = 18;
            specularOpacity = 0.24;
        }

        const cleanup = watchLiquidGlass(panel as HTMLElement, {
            bezelWidth,
            refractionScale,
            backdropBlur,
            blurLevel: 0.2, // Small anti-aliasing inside SVG
            specularOpacity,
            downsample: 2
        });
        glassCleanups.push(cleanup);
    });
});
