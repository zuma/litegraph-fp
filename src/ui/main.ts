import { RenderingContext } from './types.js';
import { createRenderer } from './renderer.js';
import { StandardNodes } from '../registry/index.js';
import { NODE_WIDTH } from './canvas.js';
import { appState, syncContextState, updateCursor, getNodeHeight } from './state.js';
import { runExecutionPipeline, logToTerminal } from './execution.js';
import { setupInteractions, deleteSelectedNodes } from './interactions.js';
import { undo, redo, pushToHistory } from './history.js';
import { loadSettings, updateSetting } from './settings.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    appState.canvas = canvas;
    appState.ctx = ctx;

    const settings = loadSettings();

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
        selectedNodeId: appState.selectedNodeId,
        selectedNodeIds: appState.selectedNodeIds,
        hoveredNodeId: appState.hoveredNodeId,
        hoveredPin: appState.hoveredPin,
        draggingConnection: null,
        nodeErrors: appState.nodeErrors,
        selectionBox: null,
        lastExecutionTime: 0,
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

        if (btnSidebar) {
            btnSidebar.textContent = collapsed ? '📋' : '❌';
        }
        
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
        if (settings.layout.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            if (btnSidebar) btnSidebar.textContent = '📋';
        } else {
            sidebar.classList.remove('collapsed');
            if (btnSidebar) btnSidebar.textContent = '❌';
        }
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
    if (chkPinSidebar) {
        chkPinSidebar.checked = settings.layout.sidebarPinned;
    }
    chkPinSidebar?.addEventListener('change', () => {
        if (chkPinSidebar) {
            updateSetting('layout', 'sidebarPinned', chkPinSidebar.checked);
        }
        import('./inspector.js').then(mod => {
            mod.updateInspector();
        });
    });

    // Initialize and bind Auto-Run state
    const chkAutoRun = document.getElementById('chk-auto-run') as HTMLInputElement | null;
    if (chkAutoRun) {
        chkAutoRun.checked = settings.canvas.autoRun;
    }
    chkAutoRun?.addEventListener('change', () => {
        if (chkAutoRun) {
            updateSetting('canvas', 'autoRun', chkAutoRun.checked);
        }
    });

    // Theme Management initialization and click handler
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (settings.ui.theme === 'light') {
        document.body.classList.add('light-theme');
        if (btnTheme) btnTheme.textContent = '🌙 Dark Mode';
    } else {
        document.body.classList.remove('light-theme');
        if (btnTheme) btnTheme.textContent = '☀️ Light Mode';
    }

    btnTheme?.addEventListener('click', () => {
        const isCurrentlyLight = document.body.classList.contains('light-theme');
        if (isCurrentlyLight) {
            document.body.classList.remove('light-theme');
            updateSetting('ui', 'theme', 'dark');
            if (btnTheme) btnTheme.textContent = '☀️ Light Mode';
        } else {
            document.body.classList.add('light-theme');
            updateSetting('ui', 'theme', 'light');
            if (btnTheme) btnTheme.textContent = '🌙 Dark Mode';
        }
        renderer.triggerSingleFrame();
    });

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
        const nodes = Object.values(appState.currentGraph.nodes);
        if (nodes.length === 0) {
            appState.viewport.zoom = 1.0;
            appState.viewport.x = 0;
            appState.viewport.y = 0;
            if (appState.renderingContext) appState.renderingContext.viewport = { ...appState.viewport };
            return;
        }

        // Calculate bounding box in world space
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        nodes.forEach(node => {
            const x = node.ui?.x ?? 0;
            const y = node.ui?.y ?? 0;
            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;

        const rect = canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;

        const padding = 60;
        const availableWidth = canvasWidth - padding * 2;
        const availableHeight = canvasHeight - padding * 2;

        let targetZoom = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
        targetZoom = Math.max(0.05, Math.min(3.0, targetZoom));

        const centerX = minX + graphWidth / 2;
        const centerY = minY + graphHeight / 2;

        appState.viewport.zoom = targetZoom;
        appState.viewport.x = canvasWidth / 2 - centerX * targetZoom;
        appState.viewport.y = canvasHeight / 2 - centerY * targetZoom;

        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
    });

    // Undo/Redo Button clicks
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);

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

    // Close Adder
    document.getElementById('btn-close-adder')?.addEventListener('click', () => {
        document.getElementById('node-adder')?.classList.add('hidden');
    });

    // ========================================================================
    // MAIN DROPDOWN MENU OPERATIONS
    // ========================================================================
    const btnMainMenu = document.getElementById('btn-main-menu');
    const mainDropdownMenu = document.getElementById('main-dropdown-menu');

    btnMainMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = mainDropdownMenu?.classList.toggle('hidden');
        btnMainMenu.classList.toggle('active', !isHidden);
    });

    // Auto-close menu on clicking outside
    window.addEventListener('click', () => {
        mainDropdownMenu?.classList.add('hidden');
        btnMainMenu?.classList.remove('active');
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
});
