import { RenderingContext } from './types.js';
import { createRenderer } from './renderer.js';
import { StandardNodes } from '../registry/index.js';
import { NODE_WIDTH } from './canvas.js';
import { appState, syncContextState, updateCursor, getNodeHeight } from './state.js';
import { runExecutionPipeline, logToTerminal } from './execution.js';
import { setupInteractions, deleteSelectedNodes } from './interactions.js';
import { undo, redo } from './history.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    appState.canvas = canvas;
    appState.ctx = ctx;

    // Handle resize with DPR support (Fixes #17)
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    };
    resizeCanvas();
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

    const toggleSidebar = () => {
        if (!sidebar) return;
        const isCollapsed = !sidebar.classList.contains('collapsed');
        setSidebarCollapsed(isCollapsed);
    };
    
    btnSidebar?.addEventListener('click', toggleSidebar);

    // Pin-sidebar toggle listener to immediately sync panel state when activated
    const chkPinSidebar = document.getElementById('chk-pin-sidebar') as HTMLInputElement | null;
    chkPinSidebar?.addEventListener('change', () => {
        import('./inspector.js').then(mod => {
            mod.updateInspector();
        });
    });

    // Theme Management initialization and click handler
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (savedTheme === 'light') {
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
            localStorage.setItem('theme', 'dark');
            if (btnTheme) btnTheme.textContent = '☀️ Light Mode';
        } else {
            document.body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
            if (btnTheme) btnTheme.textContent = '🌙 Dark Mode';
        }
        renderer.triggerSingleFrame();
    });

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
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        appState.viewport.zoom = Math.max(0.05, appState.viewport.zoom / 1.2);
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
    });

    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
        appState.viewport.zoom = 1.0;
        appState.viewport.x = 0;
        appState.viewport.y = 0;
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
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
    inspectorHeader?.addEventListener('click', () => {
        inspectorSection?.classList.toggle('expanded');
    });

    // Toggle AST JSON Collapsible block
    const astHeader = document.getElementById('ast-header');
    const astSection = document.getElementById('ast-section');
    astHeader?.addEventListener('click', () => {
        astSection?.classList.toggle('expanded');
    });

    // Close Adder
    document.getElementById('btn-close-adder')?.addEventListener('click', () => {
        document.getElementById('node-adder')?.classList.add('hidden');
    });
});
