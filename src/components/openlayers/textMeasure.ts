/**
 * Canvas text measurement, in its own module.
 *
 * Split out of `openlayerStyles.ts` when the paint layer arrived: that module
 * imports `asStyleFunction` from `paintToOpenLayers.ts`, which needs the measurer,
 * which would import back from `openlayerStyles.ts`. The cycle happens to work —
 * every reference is inside a function body — and is exactly the kind of thing
 * that stops working after an unrelated refactor. One shared leaf module instead.
 *
 * **The scratch canvas is created on first use, not at module load.** A top-level
 * `document.createElement` makes the whole module unimportable anywhere without a
 * DOM — a Next.js server render, a Node script, a jest suite in the `node`
 * environment — which is a bug this repo has already shipped once. Every caller
 * runs inside a style or paint function, which by then has a document; the
 * fallback only matters if one is ever called without one, and returning 0 widths
 * beats throwing during import.
 */

let textMeasureCtx: CanvasRenderingContext2D | null = null;

const NO_MEASURE: Pick<CanvasRenderingContext2D, 'font' | 'measureText'> = {
    font: '',
    measureText: () => ({width: 0}) as TextMetrics,
};

function measureCtx(): Pick<CanvasRenderingContext2D, 'font' | 'measureText'> {
    if (textMeasureCtx) return textMeasureCtx;
    if (typeof document === 'undefined') return NO_MEASURE;
    textMeasureCtx = document.createElement('canvas').getContext('2d');
    return textMeasureCtx ?? NO_MEASURE;
}

/**
 * Width in screen pixels of `text` rendered at `font`, times `scale`.
 *
 * **Pass the same `font` string you render with.** A gap measured at
 * `'bold 16px sans-serif'` and drawn at `'bold 24px sans-serif'` is 50% too small
 * — a bug this repo has shipped twice, which is why `RATIO_LOCKED_LABEL_FONT` is
 * an exported constant rather than a literal at each site.
 */
export function getTextWidth(text: string, font: string, scale: number): number {
    const ctx = measureCtx();
    ctx.font = font;
    return ctx.measureText(text).width * scale;
}
