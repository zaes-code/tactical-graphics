/**
 * Drives the real app to prove edit mode works, on BOTH engines.
 *
 * Per ai/decisions.md, "browser automation can reach OpenLayers' Pointer interaction"
 * but only for the FIRST synthetic drag in a page session. The affordance gestures do
 * not go through OL's Pointer interaction at all — they are window listeners — so they
 * are not subject to that limit. Still, each engine gets a fresh page.
 */
import {chromium} from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const OUT = process.env.OUT_DIR ?? '.';
const failures = [];
const notes = [];

function check(name, ok, detail = '') {
    if (ok) notes.push(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
    else failures.push(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

async function drawGraphic(page, displayName, points) {
    // The list is virtualised/long, so it has to be filtered before the name is on
    // screen — the same two steps `drive-app.mjs` uses.
    await page.getByPlaceholder('Filter graphics').fill(displayName);
    await page.getByText(displayName, {exact: true}).first().click();
    const drawBtn = page.locator('button').filter({hasText: /Add Graphic|Drawing…/}).first();
    await drawBtn.click();
    const box = await page.locator('.map-container').boundingBox();
    for (let i = 0; i < points.length - 1; i++) {
        await page.mouse.click(box.x + points[i][0], box.y + points[i][1]);
    }
    const last = points[points.length - 1];
    await page.mouse.dblclick(box.x + last[0], box.y + last[1]);
    await page.waitForTimeout(1500);
    return box;
}

async function run(engine) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1500, height: 950}});
    const consoleErrors = [];
    page.on('console', m => {
        if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);

    if (engine === 'maplibre') {
        await page.getByRole('button', {name: 'MapLibre', exact: true}).click();
        await page.waitForTimeout(2500);
    }

    // ---- 1. The panel offers ONE edit button, not four ----
    const editBtn = page.locator('button').filter({hasText: /^Edit$|^Editing/}).first();
    check(`${engine}: a single Edit button exists`, await editBtn.count() > 0);
    const rotateToggle = page.locator('[value="rotate"]');
    check(`${engine}: the four global mode toggles are gone`, await rotateToggle.count() === 0,
        `found ${await rotateToggle.count()}`);

    // ---- 2. Draw a phase line ----
    const mapBox = await drawGraphic(page, 'phase line', [[500, 400], [700, 400], [850, 460]]);

    const graphicCount = await page.evaluate(() => window.__tacticalEngine?.snapshot().features.length ?? -1);
    check(`${engine}: a graphic was drawn`, graphicCount === 1, `snapshot has ${graphicCount}`);

    // ---- 3. Enter edit mode; nothing selected yet, so no chrome ----
    await editBtn.click();
    await page.waitForTimeout(400);
    const mode = await page.evaluate(() => window.__tacticalEngine?.getInteractionMode());
    check(`${engine}: the button puts the engine in edit mode`, mode === 'edit', `mode=${mode}`);

    const boxBefore = await page.evaluate(() => window.__tacticalEngine?.selectionBox() ?? null);
    check(`${engine}: no selection box before anything is selected`, boxBefore === null);

    // ---- 4. Click the graphic to select it ----
    await page.mouse.click(mapBox.x + 600, mapBox.y + 400);
    await page.waitForTimeout(600);

    const selected = await page.evaluate(() => {
        const s = window.__tacticalEngine?.getSelection();
        return s ? {id: s.id, name: s.name} : null;
    });
    check(`${engine}: clicking a graphic selects it`, selected !== null, JSON.stringify(selected));

    const selBox = await page.evaluate(() => window.__tacticalEngine?.selectionBox() ?? null);
    check(`${engine}: the selection has an on-screen box`, !!selBox && selBox.width > 0 && selBox.height >= 0,
        JSON.stringify(selBox));

    const gestures = await page.evaluate(() => window.__tacticalEngine?.selectionGestures() ?? null);
    check(`${engine}: the selection reports its gestures`, !!gestures && gestures.translate === true,
        JSON.stringify(gestures));

    // ---- 5. The dashed box + affordance buttons are in the DOM ----
    const moveBtn = page.locator('[aria-label="Move"]');
    const rotBtn = page.locator('[aria-label="Rotate"]');
    const sizeBtn = page.locator('[aria-label="Resize"]');
    check(`${engine}: a Move affordance is rendered`, await moveBtn.count() === 1);
    check(`${engine}: a Rotate affordance is rendered`, await rotBtn.count() === 1);
    check(`${engine}: a Resize affordance is rendered`, await sizeBtn.count() === 1);

    await page.screenshot({path: `${OUT}/edit-${engine}-selected.png`});

    // ---- 6. Drag the Move affordance; the graphic must actually move ----
    const before = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0].geometry));
    const mb = await moveBtn.boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await page.mouse.down();
    await page.mouse.move(mb.x + mb.width / 2 + 60, mb.y + mb.height / 2 + 40, {steps: 12});
    await page.mouse.up();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0].geometry));
    check(`${engine}: the Move affordance moves the graphic`, before !== after);

    await page.screenshot({path: `${OUT}/edit-${engine}-moved.png`});

    // ---- 6b. The graphic's OWN handles must still reshape it ----
    //
    // The regression this section exists for: `edit` showed handles but installed no
    // `Modify` interaction, so the handles were inert and OpenLayers' blue
    // "a drag here adds a vertex" marker vanished with them. Both went together.
    const sel = await page.evaluate(() => window.__tacticalEngine.selectionBox());
    // The line's own end vertex, which sits at a corner of the box.
    const vx = mapBox.x + sel.x + sel.width;
    const vy = mapBox.y + sel.y + sel.height;

    const overVertex = await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return el ? `${el.tagName}.${String(el.className).slice(0, 30)}` : 'none';
    }, {x: Math.round(vx), y: Math.round(vy)});
    check(`${engine}: nothing covers the graphic's corner handle`,
        !/MuiBox|MuiTooltip/.test(overVertex), `topmost = ${overVertex}`);

    const preDrag = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0].geometry.coordinates));
    await page.mouse.move(vx, vy);
    await page.mouse.down();
    await page.mouse.move(vx + 70, vy + 50, {steps: 12});
    await page.mouse.up();
    await page.waitForTimeout(500);
    const postDrag = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0].geometry.coordinates));
    check(`${engine}: dragging a handle still reshapes the graphic`, preDrag !== postDrag);
    await page.screenshot({path: `${OUT}/edit-${engine}-handle-drag.png`});

    // ---- 7. A rotate-refusing symbol shows no rotate button ----
    await page.evaluate(() => window.__tacticalEngine.clearAll());
    await page.waitForTimeout(400);
    const clearedSel = await page.evaluate(() => window.__tacticalEngine.getSelection());
    check(`${engine}: clearAll drops the selection`, clearedSel === null);

    await drawGraphic(page, 'screen', [[600, 450], [600, 450]]);
    await editBtn.click();               // clearAll returned us to view; re-arm edit
    await page.waitForTimeout(300);
    await page.mouse.click(mapBox.x + 600, mapBox.y + 450);
    await page.waitForTimeout(600);

    const screenGestures = await page.evaluate(() => window.__tacticalEngine?.selectionGestures() ?? null);
    check(`${engine}: a Screen refuses resize`, screenGestures && screenGestures.resize === false,
        JSON.stringify(screenGestures));
    if (screenGestures) {
        check(`${engine}: the Resize affordance is not drawn for a Screen`,
            await page.locator('[aria-label="Resize"]').count() === 0);
        check(`${engine}: the Rotate affordance IS drawn for a Screen`,
            await page.locator('[aria-label="Rotate"]').count() === 1);
    }
    await page.screenshot({path: `${OUT}/edit-${engine}-screen.png`});

    const realErrors = consoleErrors.filter(t => !/DevTools|favicon|Download the React/i.test(t));
    check(`${engine}: no console errors`, realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    await browser.close();
}

/**
 * The graphics the user reported as broken, plus a control.
 *
 * Each is drawn, selected, and then asked two questions: does the resize *icon* change
 * its geometry, and — where it has a width handle — does dragging that handle change it.
 * Both are compared on `properties.tacticalGraphic`, not on pixels.
 */
const RESIZE_CASES = [
    {filter: 'fields of fire / sector of fire', pts: [[520, 380], [700, 420], [640, 520]]},
    {filter: 'withdraw', pts: [[520, 380], [720, 430]]},
    {filter: 'retirement', pts: [[520, 380], [720, 430]]},
    {filter: 'mobile defense', pts: [[520, 380], [720, 430]]},
    {filter: 'relief in place', pts: [[520, 380], [720, 430]]},
    {filter: 'disrupt', pts: [[520, 380], [720, 430]]},
    {filter: 'block', pts: [[520, 380], [720, 430]]},
    {filter: 'bridge', pts: [[520, 380], [720, 430]]},
    {filter: 'air corridor', pts: [[520, 380], [660, 400], [780, 460]]},
    {filter: 'destroy', pts: [[600, 430], [600, 430]]},
];

async function runResizeSweep(engine) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1500, height: 950}});
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);
    if (engine === 'maplibre') {
        await page.getByRole('button', {name: 'MapLibre', exact: true}).click();
        await page.waitForTimeout(2500);
    }
    const editBtn = page.locator('button').filter({hasText: /^Edit$|^Editing/}).first();

    for (const {filter, pts} of RESIZE_CASES) {
        await page.evaluate(() => window.__tacticalEngine.clearAll());
        await page.waitForTimeout(300);
        let mapBox;
        try {
            mapBox = await drawGraphic(page, filter, pts);
        } catch {
            check(`${engine}: "${filter}" could be drawn`, false, 'not found in the list');
            continue;
        }
        const drawn = await page.evaluate(() => {
            const f = window.__tacticalEngine.snapshot().features[0];
            return f ? f.properties.tacticalGraphic.name : null;
        });
        if (!drawn) {
            check(`${engine}: "${filter}" produced a graphic`, false);
            continue;
        }

        if ((await page.evaluate(() => window.__tacticalEngine.getInteractionMode())) !== 'edit') await editBtn.click();
        await page.waitForTimeout(250);
        /*
         * Selecting by a guessed pixel is a probe bug waiting to happen — a 2-point line
         * is a few pixels thick and a click 6 px off it hits the basemap. Try each drawn
         * vertex and every segment midpoint until the engine reports a selection, and
         * only then call it a failure.
         */
        const candidates = [...pts];
        for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1][0] + pts[i][0]) / 2;
            const my = (pts[i - 1][1] + pts[i][1]) / 2;
            candidates.push([mx, my]);
            /*
             * **Several families draw nothing on the line the user drew.** A bridge and an
             * air corridor are two rails offset either side of the base, so the
             * centreline is empty map and a click there correctly selects nothing — that
             * is the symbol, not a defect. Offer the perpendicular offsets too, so the
             * probe clicks the ink rather than the construction line.
             */
            const dx = pts[i][0] - pts[i - 1][0];
            const dy = pts[i][1] - pts[i - 1][1];
            const len = Math.hypot(dx, dy) || 1;
            for (const off of [18, -18, 36, -36]) {
                candidates.push([mx + (-dy / len) * off, my + (dx / len) * off]);
            }
        }
        for (const [cx, cy] of candidates) {
            await page.mouse.click(mapBox.x + cx, mapBox.y + cy);
            await page.waitForTimeout(300);
            if (await page.evaluate(() => window.__tacticalEngine.getSelection())) break;
        }
        const sel = await page.evaluate(() => window.__tacticalEngine.getSelection());
        if (!sel) {
            check(`${engine}: ${drawn} could be selected`, false);
            continue;
        }

        const sizeBtn = page.locator('[aria-label="Resize"]');
        await sizeBtn.first().waitFor({state: 'attached', timeout: 5000}).catch(() => {});
        if (await sizeBtn.count() === 0) {
            check(`${engine}: ${drawn} offers a resize affordance`, false);
            continue;
        }
        const before = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0]));
        /*
         * **Wait for the button to stop moving before pressing it.** The chrome
         * re-measures every animation frame, and MapLibre is often still easing its
         * camera for a moment after a click — so a box read immediately after selecting
         * can be stale by the time the mouse gets there, the press lands on empty map,
         * and the drag pans instead of resizing. Reading it twice and requiring agreement
         * is the difference between this sweep being reliable and being flaky.
         */
        let rb = await sizeBtn.boundingBox();
        for (let settle = 0; settle < 20; settle++) {
            await page.waitForTimeout(100);
            const next = await sizeBtn.boundingBox();
            if (next && rb && Math.abs(next.x - rb.x) < 0.5 && Math.abs(next.y - rb.y) < 0.5) { rb = next; break; }
            rb = next;
        }
        const px = rb.x + rb.width / 2;
        const py = rb.y + rb.height / 2;
        const under = await page.evaluate(({x, y}) => {
            const el = document.elementFromPoint(x, y);
            return el ? `${el.tagName}[${el.getAttribute('aria-label') ?? ''}].${String(el.className).slice(0, 24)}` : 'none';
        }, {x: Math.round(px), y: Math.round(py)});
        await page.mouse.move(px, py);
        await page.mouse.down();
        await page.mouse.move(px + 90, py + 70, {steps: 14});
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => JSON.stringify(window.__tacticalEngine.snapshot().features[0]));
        if (before !== after) {
            check(`${engine}: ${drawn} resizes from the icon`, true);
            continue;
        }
        // The mouse route did nothing. Ask the engine directly, so the report says
        // whether the gesture is refused or merely the pointer never reached it.
        const direct = await page.evaluate(() => {
            const started = window.__tacticalEngine.beginGesture(
                'resize', new PointerEvent('pointerdown', {clientX: 700, clientY: 500, bubbles: true}));
            window.dispatchEvent(new PointerEvent('pointermove', {clientX: 900, clientY: 700, bubbles: true}));
            window.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
            return {started, snap: JSON.stringify(window.__tacticalEngine.snapshot().features[0])};
        });
        check(`${engine}: ${drawn} resizes from the icon`, false,
            `press at ${Math.round(px)},${Math.round(py)} hit ${under}; direct beginGesture returned ${direct.started}, geometry ${direct.snap === before ? 'unchanged' : 'CHANGED'}`);
        await page.screenshot({path: `${OUT}/resize-fail-${engine}-${drawn}.png`});
    }

    await browser.close();
}

/**
 * The families whose width is set by dragging an offset handle.
 *
 * That handle is the *only* way to set a width — the resize icon scales the whole
 * graphic — so if it is not reachable in edit mode the dimension is unreachable, which
 * is what happened when `edit` first shipped: the OpenLayers `handleDownEvent` claimed a
 * drag only for `editStretches` or a mirror handle, so an offset grab fell through to
 * the map and panned it.
 */
const WIDTH_CASES = [
    {filter: 'air corridor', pts: [[520, 380], [660, 400], [780, 460]]},
    {filter: 'bridge', pts: [[520, 400], [720, 430]]},
];

async function runWidthSweep(engine) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1500, height: 950}});
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);
    if (engine === 'maplibre') {
        await page.getByRole('button', {name: 'MapLibre', exact: true}).click();
        await page.waitForTimeout(2500);
    }
    const editBtn = page.locator('button').filter({hasText: /^Edit$|^Editing/}).first();

    for (const {filter, pts} of WIDTH_CASES) {
        await page.evaluate(() => window.__tacticalEngine.clearAll());
        await page.waitForTimeout(300);
        let mapBox;
        try {
            mapBox = await drawGraphic(page, filter, pts);
        } catch {
            check(`${engine}: width case "${filter}" could be drawn`, false, 'not found');
            continue;
        }
        const drawn = await page.evaluate(() => {
            const f = window.__tacticalEngine.snapshot().features[0];
            return f ? f.properties.tacticalGraphic.name : null;
        });
        if (!drawn) { check(`${engine}: width case "${filter}" produced a graphic`, false); continue; }

        if ((await page.evaluate(() => window.__tacticalEngine.getInteractionMode())) !== 'edit') await editBtn.click();
        await page.waitForTimeout(250);

        /*
         * **Select first.** In edit mode the handles belong to the selection, so an
         * unselected graphic's handles are hidden — and a hidden handle is not a hit
         * target, so the drag below would have fallen through to the map. This is the
         * probe reproducing the mode's own rule, not working around it.
         */
        const candidates = [...pts];
        for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1][0] + pts[i][0]) / 2;
            const my = (pts[i - 1][1] + pts[i][1]) / 2;
            const dx = pts[i][0] - pts[i - 1][0];
            const dy = pts[i][1] - pts[i - 1][1];
            const len = Math.hypot(dx, dy) || 1;
            candidates.push([mx, my]);
            for (const off of [18, -18, 36, -36]) candidates.push([mx + (-dy / len) * off, my + (dx / len) * off]);
        }
        for (const [cx, cy] of candidates) {
            await page.mouse.click(mapBox.x + cx, mapBox.y + cy);
            await page.waitForTimeout(250);
            if (await page.evaluate(() => window.__tacticalEngine.getSelection())) break;
        }
        if (!(await page.evaluate(() => window.__tacticalEngine.getSelection()))) {
            check(`${engine}: ${drawn} could be selected for its width handle`, false);
            continue;
        }

        // The offset handle is the one furthest off the drawn line. Ask the engine where
        // the handles are rather than guessing: the OpenLayers holder publishes them as a
        // MultiPoint, and MapLibre keeps them on the graphic.
        const handles = await page.evaluate(() => {
            const w = window;
            const mgr = w.__tacticalGraphics?.manager;
            if (mgr) {
                const f = mgr.renderingVectorSource.getFeatures().find(x => x.get('offsetHandler'));
                const g = f?.getGeometry();
                const coords = g?.getCoordinates?.();
                if (!coords) return null;
                const pts = Array.isArray(coords[0]) ? coords : [coords];
                return pts.map(c => mgr.map.getPixelFromCoordinate(c));
            }
            /*
             * MapLibre keeps handles on the graphic in **projected metres** and publishes
             * no pixel accessor, so the probe converts. Web Mercator inverse, then the
             * map's own projection — asserting the same thing OpenLayers is asked, rather
             * than skipping the engine and calling the sweep complete.
             */
            const mlb = w.__tacticalGraphicsMapLibre?.native;
            const map = w.__tacticalGraphicsMapLibre?.map;
            if (!mlb || !map || !mlb.selection) return null;
            const graphic = mlb.find(mlb.selection);
            if (!graphic?.handles?.length) return null;
            const R = 6378137;
            const toLonLat = ([x, y]) => [
                (x / R) * (180 / Math.PI),
                (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
            ];
            // The width handle is the one the contract puts last for the movement family
            // and past the vertex count for a corridor — in both cases, the final one.
            const rect = map.getCanvasContainer().getBoundingClientRect();
            const host = document.querySelector('.map-container').getBoundingClientRect();
            return graphic.handles.map(h => {
                const p = map.project(toLonLat(h));
                return [p.x + rect.left - host.left, p.y + rect.top - host.top];
            });
        });

        if (!handles || !handles.length) {
            // MapLibre keeps handles in projected meters on the graphic; there is no
            // published pixel accessor, so this half is asserted on OpenLayers only and
            // said so rather than silently skipped.
            notes.push(`  SKIP  ${engine}: ${drawn} width handle — no pixel accessor on this engine`);
            continue;
        }

        const before = await page.evaluate(() => window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic.width
            ?? window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic.radius);
        // OpenLayers hands back only the offset feature's points; MapLibre hands back
        // every handle, and the width one is last in both affected contracts.
        const [hx, hy] = handles.length > 1 && engine === 'maplibre' ? handles[handles.length - 1] : handles[0];
        await page.mouse.move(mapBox.x + hx, mapBox.y + hy);
        await page.mouse.down();
        await page.mouse.move(mapBox.x + hx, mapBox.y + hy - 55, {steps: 12});
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic.width
            ?? window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic.radius);
        check(`${engine}: ${drawn} width changes from its handle in edit mode`, before !== after,
            `${before} -> ${after}`);
    }

    await browser.close();
}

/**
 * The editor chrome that is *not* a button: the hashed measure read-out and the handles
 * a graphic does or does not wear. OpenLayers only — these read the live feature bag,
 * which is where the three reported defects lived.
 */
async function runChromeChecks() {
    const engine = 'openlayers';
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1500, height: 950}});
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);
    const editBtn = page.locator('button').filter({hasText: /^Edit$|^Editing/}).first();

    const measureState = () => page.evaluate(() => {
        const src = window.__tacticalGraphics.manager.renderingVectorSource;
        const f = src.getFeatures().find(x => x.get('measure'));
        const g = f?.getGeometry();
        const coords = g?.getCoordinates?.();
        const handles = src.getFeatures().find(x => x.get('handle') && !x.get('inert') && !x.get('measure'))
            ?.getGeometry()?.getCoordinates?.();
        return {measure: coords ?? null, firstHandle: Array.isArray(handles?.[0]) ? handles[0] : handles ?? null};
    });

    // ── a circular graphic: the read-out must look the same whichever way it resizes ──
    //
    // It must be one that *has* a read-out: `RADIUS_GRAPHICS` is a subset of the circular
    // family, and picking a member outside it measures nothing and passes for the wrong
    // reason. @see hasRadiusReadout
    let mapBox = await drawGraphic(page, 'air space coordination area circular', [[600, 430], [700, 430]]);
    await editBtn.click();
    await page.waitForTimeout(300);
    await page.mouse.click(mapBox.x + 700, mapBox.y + 430);
    await page.waitForTimeout(500);
    if (!(await page.evaluate(() => window.__tacticalEngine.getSelection()))) {
        await page.mouse.click(mapBox.x + 600, mapBox.y + 430);
        await page.waitForTimeout(500);
    }

    const sizeBtn = page.locator('[aria-label="Resize"]');
    if (await sizeBtn.count() === 1) {
        const rb = await sizeBtn.boundingBox();
        await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await page.mouse.down();
        await page.mouse.move(rb.x + rb.width / 2 + 60, rb.y + rb.height / 2 + 45, {steps: 10});
        await page.waitForTimeout(200);
        const mid = await measureState();
        // With the anchor left alone, the hashed line runs to the rim handle — the same
        // picture a handle drag draws. Following the cursor sent it to a box corner.
        const ok = !!mid.measure && !!mid.firstHandle
            && Math.hypot(mid.measure[1][0] - mid.firstHandle[0], mid.measure[1][1] - mid.firstHandle[1])
               < Math.hypot(mid.measure[1][0] - mid.measure[0][0], mid.measure[1][1] - mid.measure[0][1]) * 0.25;
        check(`${engine}: an icon resize draws the radius read-out to the rim handle`, ok,
            mid.measure ? `end ${mid.measure[1].map(Math.round)} vs handle ${mid.firstHandle?.map(Math.round)}` : 'no measure line');
        await page.mouse.up();
        await page.waitForTimeout(300);
        const done = await measureState();
        check(`${engine}: the radius read-out clears when the icon drag ends`, done.measure === null);
    } else {
        check(`${engine}: the circular graphic offers a resize affordance`, false);
    }

    // ── a rectangular zone: no dead handle, and no read-out left behind ──
    await page.evaluate(() => window.__tacticalEngine.clearAll());
    await page.waitForTimeout(300);
    mapBox = await drawGraphic(page, 'PsyOps zone, rectangular', [[560, 380], [760, 480]]);
    const rectName = await page.evaluate(() => window.__tacticalEngine.snapshot().features[0]?.properties.tacticalGraphic.name);
    await editBtn.click();
    await page.waitForTimeout(300);
    for (const [cx, cy] of [[660, 380], [560, 430], [660, 480], [660, 430]]) {
        await page.mouse.click(mapBox.x + cx, mapBox.y + cy);
        await page.waitForTimeout(250);
        if (await page.evaluate(() => window.__tacticalEngine.getSelection())) break;
    }
    check(`${engine}: the rectangular zone selects`, !!(await page.evaluate(() => window.__tacticalEngine.getSelection())), rectName);

    const shownHandles = await page.evaluate(() => window.__tacticalGraphics.manager.renderingVectorSource
        .getFeatures().filter(f => f.get('handle') && !f.get('hidden') && !f.get('measure')).length);
    check(`${engine}: a rectangular zone shows no dead shape handle in edit mode`, shownHandles === 0,
        `${shownHandles} visible`);

    const rectSize = page.locator('[aria-label="Resize"]');
    // **Wait for it, don't read it.** The chrome measures on an animation frame, so a
    // count taken in the same tick as the selection can legitimately be zero — which
    // reads as "the affordance is missing" when it is merely not painted yet.
    await rectSize.first().waitFor({state: 'attached', timeout: 5000}).catch(() => {});
    const rectSizeCount = await rectSize.count();
    check(`${engine}: a rectangular zone offers a resize affordance`, rectSizeCount === 1, `${rectSizeCount} found`);
    if (rectSizeCount === 1) {
        const rb = await rectSize.boundingBox();
        await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await page.mouse.down();
        await page.mouse.move(rb.x + rb.width / 2 + 50, rb.y + rb.height / 2 + 40, {steps: 10});
        await page.mouse.up();
        await page.waitForTimeout(400);
        const afterDrag = await measureState();
        check(`${engine}: the width read-out clears when the rectangle's drag ends`, afterDrag.measure === null,
            afterDrag.measure ? 'still drawn' : '');
    }

    // Leaving edit mode must not leave a read-out on the map.
    await editBtn.click();
    await page.waitForTimeout(400);
    const outOfEdit = await measureState();
    check(`${engine}: no measure read-out survives leaving edit mode`, outOfEdit.measure === null);
    await page.screenshot({path: `${OUT}/edit-chrome.png`});

    await browser.close();
}

for (const engine of ['openlayers', 'maplibre']) {
    try {
        await run(engine);
        await runResizeSweep(engine);
        await runWidthSweep(engine);
    } catch (err) {
        failures.push(`  FAIL  ${engine}: threw — ${err.message}`);
    }
}

try {
    await runChromeChecks();
} catch (err) {
    failures.push(`  FAIL  chrome checks threw — ${err.message}`);
}

console.log(notes.join('\n'));
if (failures.length) {
    console.log('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
}
console.log('\nAll edit-mode checks passed on both engines.');
