export interface AppSettings {
    ui: {
        theme: 'dark' | 'light';
    };
    layout: {
        sidebarPinned: boolean;
        sidebarCollapsed: boolean;
        inspectorExpanded: boolean;
        astExpanded: boolean;
        logsExpanded: boolean;
    };
    canvas: {
        autoRun: boolean;
        snapToGrid: boolean;
        autoBringToFront: boolean;
        edgeStyle: 'spline' | 'orthogonal';
        gridStyle?: 'dot' | 'line';
        camera: { x: number; y: number; zoom: number };
        backgroundColor?: string;
        warnOnDelete?: boolean;
    };
}

export const DEFAULT_SETTINGS: AppSettings = {
    ui: {
        theme: 'light',
    },
    layout: {
        sidebarPinned: false,
        sidebarCollapsed: true, // Maximize viewport by default
        inspectorExpanded: true,
        astExpanded: false,
        logsExpanded: true,
    },
    canvas: {
        autoRun: true,
        snapToGrid: false,
        autoBringToFront: true,
        edgeStyle: 'spline',
        gridStyle: 'dot',
        camera: { x: 0, y: 0, zoom: 1.0 },
        backgroundColor: '#f3f4f6',
        warnOnDelete: true,
    },
};

const SETTINGS_KEY = 'litegraph-fp-settings';

export function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return structuredClone(DEFAULT_SETTINGS);
        const parsed = JSON.parse(raw);
        
        // Deep merge with defaults to handle schema changes safely
        return {
            ui: {
                ...DEFAULT_SETTINGS.ui,
                theme: parsed.ui?.theme || DEFAULT_SETTINGS.ui.theme
            },
            layout: {
                ...DEFAULT_SETTINGS.layout,
                ...(parsed.layout || {})
            },
            canvas: {
                ...DEFAULT_SETTINGS.canvas,
                ...(parsed.canvas || {})
            }
        };
    } catch (e) {
        return structuredClone(DEFAULT_SETTINGS);
    }
}

export function saveSettings(settings: AppSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        // Fail silently if localStorage is full or disabled
    }
}

export function updateSetting<K1 extends keyof AppSettings, K2 extends keyof AppSettings[K1]>(
    category: K1,
    key: K2,
    value: AppSettings[K1][K2]
) {
    const current = loadSettings();
    (current[category] as any)[key] = value;
    saveSettings(current);
}
