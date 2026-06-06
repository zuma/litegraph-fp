/**
 * Computes the distance to the border and the normal vector for a pixel on a rounded rectangle.
 * 
 * @param x Pixel X coordinate (0 to W)
 * @param y Pixel Y coordinate (0 to H)
 * @param W Rounded rectangle width
 * @param H Rounded rectangle height
 * @param R Corner radius (clamped to <= min(W, H)/2)
 */
export function getRoundedRectNormalAndDistance(
    x: number,
    y: number,
    W: number,
    H: number,
    R: number
): { nx: number; ny: number; d: number } {
    let nx = 0;
    let ny = 0;
    let d = 0;

    const dx = Math.min(x, W - x);
    const dy = Math.min(y, H - y);

    // Clamp radius to fit within dimensions
    const maxR = Math.min(W, H) / 2;
    const clampedR = Math.min(R, maxR);

    // Check if we are in one of the 4 corner zones
    if (x < clampedR && y < clampedR) { // Top-Left
        const rx = clampedR - x;
        const ry = clampedR - y;
        const dist = Math.sqrt(rx * rx + ry * ry);
        d = clampedR - dist;
        if (dist > 0) {
            nx = -rx / dist;
            ny = -ry / dist;
        } else {
            nx = 0;
            ny = 0;
        }
    } else if (x > W - clampedR && y < clampedR) { // Top-Right
        const rx = x - (W - clampedR);
        const ry = clampedR - y;
        const dist = Math.sqrt(rx * rx + ry * ry);
        d = clampedR - dist;
        if (dist > 0) {
            nx = rx / dist;
            ny = -ry / dist;
        } else {
            nx = 0;
            ny = 0;
        }
    } else if (x < clampedR && y > H - clampedR) { // Bottom-Left
        const rx = clampedR - x;
        const ry = y - (H - clampedR);
        const dist = Math.sqrt(rx * rx + ry * ry);
        d = clampedR - dist;
        if (dist > 0) {
            nx = -rx / dist;
            ny = ry / dist;
        } else {
            nx = 0;
            ny = 0;
        }
    } else if (x > W - clampedR && y > H - clampedR) { // Bottom-Right
        const rx = x - (W - clampedR);
        const ry = y - (H - clampedR);
        const dist = Math.sqrt(rx * rx + ry * ry);
        d = clampedR - dist;
        if (dist > 0) {
            nx = rx / dist;
            ny = ry / dist;
        } else {
            nx = 0;
            ny = 0;
        }
    } else { // Straight edge zone (sides)
        if (dx < dy) {
            d = dx;
            nx = (x < W / 2) ? -1 : 1;
            ny = 0;
        } else {
            d = dy;
            nx = 0;
            ny = (y < H / 2) ? -1 : 1;
        }
    }

    return { nx, ny, d };
}

/**
 * Generates the displacement map and specular highlight map for the Liquid Glass filter.
 */
export function generateMaps(
    width: number,
    height: number,
    radius: number,
    options: {
        bezelWidth?: number;
        specularOpacity?: number;
        specularAngle?: number;
        downsample?: number;
    } = {}
): { displacementMapUrl: string; specularMapUrl: string } {
    const downsample = options.downsample ?? 2;
    const bezelWidth = (options.bezelWidth ?? 12) / downsample;
    const specularOpacity = options.specularOpacity ?? 0.35;
    const specularAngle = options.specularAngle ?? -Math.PI / 3;

    // Dimensions scaled down for rendering performance and smoother bilinear scaling
    const w = Math.ceil(width / downsample);
    const h = Math.ceil(height / downsample);
    
    // Clamp corner radius to fit the scaled down canvas
    const maxR = Math.min(w, h) / 2;
    const r = Math.min(radius / downsample, maxR);

    // 1. Create displacement canvas
    const dispCanvas = document.createElement('canvas');
    dispCanvas.width = w;
    dispCanvas.height = h;
    const dispCtx = dispCanvas.getContext('2d')!;
    const dispImgData = dispCtx.createImageData(w, h);
    const dispPixels = dispImgData.data;

    // 2. Create specular highlight canvas
    const specCanvas = document.createElement('canvas');
    specCanvas.width = w;
    specCanvas.height = h;
    const specCtx = specCanvas.getContext('2d')!;
    const specImgData = specCtx.createImageData(w, h);
    const specPixels = specImgData.data;

    // Direction vector of the light source
    const lx = Math.cos(specularAngle);
    const ly = Math.sin(specularAngle);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const { nx, ny, d } = getRoundedRectNormalAndDistance(x, y, w, h, r);
            const idx = (y * w + x) * 4;

            let vx = 0;
            let vy = 0;
            let specular = 0;

            if (d >= 0) {
                // Pixel is inside the panel bounds
                if (d < bezelWidth && bezelWidth > 0) {
                    const u = d / bezelWidth;
                    
                    // Smooth profile mapping: u=0 (outer edge) -> 1, u=1 (inner edge) -> 0
                    // smoothstep: 3*u^2 - 2*u^3
                    const magnitude = 1 - (3 * u * u - 2 * u * u * u);
                    
                    // Displace inward (opposite of outward normal)
                    vx = -nx * magnitude;
                    vy = -ny * magnitude;

                    // Specular dot product
                    const dot = nx * lx + ny * ly;
                    if (dot > 0) {
                        specular = dot * (1 - u);
                    }
                }
            }

            // Encode displacement map (Red = X, Green = Y, Blue = neutral, Alpha = mask)
            dispPixels[idx] = Math.round(128 + vx * 127);
            dispPixels[idx + 1] = Math.round(128 + vy * 127);
            dispPixels[idx + 2] = 128;
            dispPixels[idx + 3] = d >= 0 ? 255 : 0; // Mask out content outside rounded bounds

            // Encode specular map (White highlight with variable opacity)
            specPixels[idx] = 255;
            specPixels[idx + 1] = 255;
            specPixels[idx + 2] = 255;
            specPixels[idx + 3] = Math.round(specular * specularOpacity * 255);
        }
    }

    dispCtx.putImageData(dispImgData, 0, 0);
    specCtx.putImageData(specImgData, 0, 0);

    return {
        displacementMapUrl: dispCanvas.toDataURL('image/png'),
        specularMapUrl: specCanvas.toDataURL('image/png')
    };
}
