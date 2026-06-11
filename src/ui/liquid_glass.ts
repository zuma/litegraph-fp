import { generateMaps } from './liquid_glass_helper.js';

export interface LiquidGlassOptions {
    bezelWidth?: number;       // in pixels
    refractionScale?: number;  // feDisplacementMap scale (px)
    blurLevel?: number;        // feGaussianBlur stdDeviation inside SVG (default 0.2)
    backdropBlur?: number;     // CSS backdrop-filter blur in pixels (default 20)
    specularOpacity?: number;  // 0 to 1
    specularAngle?: number;    // angle in radians (default -60 deg)
    saturation?: number;       // feColorMatrix saturation value (default 1.35)
    downsample?: number;       // performance downsample factor (default 2)
}

// Global SVG container for our dynamic filters
let svgContainer: SVGSVGElement | null = null;

function getOrCreateSvgContainer(): SVGSVGElement {
    if (!svgContainer) {
        svgContainer = document.getElementById('liquid-glass-svg-container') as SVGSVGElement | null;
        if (!svgContainer) {
            svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
            svgContainer.id = 'liquid-glass-svg-container';
            // Hide the container offscreen using 1px dimensions so layout engine compiles its filters
            svgContainer.setAttribute('style', 'position: absolute; width: 1px; height: 1px; left: -9999px; top: -9999px; pointer-events: none; overflow: hidden;');
            svgContainer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(svgContainer);
        }
    }
    return svgContainer;
}

/**
 * Helper to parse border radius from computed style.
 */
function getBorderRadius(element: HTMLElement): number {
    const style = window.getComputedStyle(element);
    const radiusStr = style.borderRadius || '0px';
    const match = radiusStr.match(/^(\d+(?:\.\d+)?)(px|%|em|rem)?/);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2] || 'px';
    if (unit === 'px') return val;
    // Simple fallback for other units
    return 10;
}

/**
 * Applies the Liquid Glass SVG refraction filter to a given element.
 * Measures the element, generates custom displacement/specular maps,
 * creates an SVG filter, and applies it to the element's backdrop-filter.
 */
export function applyLiquidGlass(element: HTMLElement, options: LiquidGlassOptions = {}): string {
    const container = getOrCreateSvgContainer();
    const rect = element.getBoundingClientRect();
    const W = Math.ceil(rect.width);
    const H = Math.ceil(rect.height);
    
    // Avoid generating filters for collapsed/invisible elements
    if (W <= 0 || H <= 0) return '';

    const R = getBorderRadius(element);

    const bezelWidth = options.bezelWidth ?? 12;
    const refractionScale = options.refractionScale ?? 10;
    const blurLevel = options.blurLevel ?? 0.2; // Default to small anti-alias pass inside SVG
    const specularOpacity = options.specularOpacity ?? 0.35;
    const specularAngle = options.specularAngle ?? -Math.PI / 3;
    const saturation = options.saturation ?? 1.35;
    const downsample = options.downsample ?? 2;

    // Generate displacement and specular maps as data URLs
    const { displacementMapUrl, specularMapUrl } = generateMaps(W, H, R, {
        bezelWidth,
        specularOpacity,
        specularAngle,
        downsample
    });

    // Ensure the element has a unique ID so we can track and clean up its filter definition
    if (!element.id) {
        element.id = `lg-el-${Math.random().toString(36).substring(2, 9)}`;
    }
    const filterId = `lg-filter-${element.id}`;

    // Check if filter already exists, if so remove it
    let existingFilter = document.getElementById(filterId);
    if (existingFilter) {
        existingFilter.remove();
    }

    // Create the SVG filter element
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = filterId;
    filter.setAttribute('x', '-10%');
    filter.setAttribute('y', '-10%');
    filter.setAttribute('width', '120%');
    filter.setAttribute('height', '120%');
    filter.setAttribute('filterUnits', 'objectBoundingBox');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    // 1. feGaussianBlur (Soft backdrop blur)
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', blurLevel.toString());
    blur.setAttribute('result', 'blurred_source');
    filter.appendChild(blur);

    // 2. feImage for Displacement Map
    const dispImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
    dispImage.setAttribute('href', displacementMapUrl);
    dispImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', displacementMapUrl);
    dispImage.setAttribute('x', '0');
    dispImage.setAttribute('y', '0');
    dispImage.setAttribute('width', W.toString());
    dispImage.setAttribute('height', H.toString());
    dispImage.setAttribute('result', 'displacement_map');
    filter.appendChild(dispImage);

    // 3. feDisplacementMap (Refraction)
    const dispMap = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    dispMap.setAttribute('in', 'blurred_source');
    dispMap.setAttribute('in2', 'displacement_map');
    dispMap.setAttribute('scale', refractionScale.toString());
    dispMap.setAttribute('xChannelSelector', 'R');
    dispMap.setAttribute('yChannelSelector', 'G');
    dispMap.setAttribute('result', 'displaced');
    filter.appendChild(dispMap);

    // 4. feColorMatrix (Refraction Color Saturation boost)
    const matrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    matrix.setAttribute('in', 'displaced');
    matrix.setAttribute('type', 'saturate');
    matrix.setAttribute('values', saturation.toString());
    matrix.setAttribute('result', 'displaced_saturated');
    filter.appendChild(matrix);

    // 5. feImage for Specular Map
    const specImage = document.createElementNS('http://www.w3.org/2000/svg', 'feImage');
    specImage.setAttribute('href', specularMapUrl);
    specImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', specularMapUrl);
    specImage.setAttribute('x', '0');
    specImage.setAttribute('y', '0');
    specImage.setAttribute('width', W.toString());
    specImage.setAttribute('height', H.toString());
    specImage.setAttribute('result', 'specular_layer');
    filter.appendChild(specImage);

    // 6. feBlend (Overlay specular highlight)
    const blend = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    blend.setAttribute('in', 'specular_layer');
    blend.setAttribute('in2', 'displaced_saturated');
    blend.setAttribute('mode', 'normal');
    filter.appendChild(blend);

    // Append to SVG container in DOM
    container.appendChild(filter);

    // Force style refresh and layout reflow to clear browser filter caches
    element.style.backdropFilter = '';
    (element.style as any).webkitBackdropFilter = '';
    void element.offsetHeight;

    // Detect if the browser is WebKit/Safari
    const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Chromium');

    const backdropBlur = options.backdropBlur ?? 20;

    if (isSafari) {
        // Safari does not support SVG url() references inside backdrop-filter.
        // We fall back to native CSS blur and saturate, and overlay the specular highlight as a background-image.
        const filterStyle = backdropBlur > 0 ? `blur(${backdropBlur}px) saturate(${saturation * 100}%)` : '';
        element.style.backdropFilter = filterStyle;
        (element.style as any).webkitBackdropFilter = filterStyle;

        // Apply specular highlight as background image overlay
        element.style.backgroundImage = `url(${specularMapUrl})`;
        element.style.backgroundSize = '100% 100%';
        element.style.backgroundRepeat = 'no-repeat';
    } else {
        // Apply the chained backdrop-filter with CSS blur first, then SVG refraction/specular
        const filterStyle = backdropBlur > 0 ? `blur(${backdropBlur}px) url(#${filterId})` : `url(#${filterId})`;
        element.style.backdropFilter = filterStyle;
        (element.style as any).webkitBackdropFilter = filterStyle;
        element.style.backgroundImage = '';
    }
    
    // Apple Liquid Glass looks best with a highly translucent base background.
    // Ensure the element has a slightly transparent background to let the refraction show through.
    // Rather than overwriting element.style.background, we can let CSS handle it or apply a fallback class.
    
    return filterId;
}

/**
 * Helper to watch size changes of elements and dynamically re-generate the filter.
 */
export function watchLiquidGlass(element: HTMLElement, options: LiquidGlassOptions = {}): () => void {
    let filterId = applyLiquidGlass(element, options);
    
    const observer = new ResizeObserver(() => {
        filterId = applyLiquidGlass(element, options);
    });
    
    observer.observe(element);
    
    // Return a cleanup function to unobserve and remove the dynamic SVG filter
    return () => {
        observer.disconnect();
        if (filterId) {
            const filter = document.getElementById(filterId);
            if (filter) filter.remove();
        }
        element.style.backdropFilter = '';
        (element.style as any).webkitBackdropFilter = '';
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundRepeat = '';
    };
}
