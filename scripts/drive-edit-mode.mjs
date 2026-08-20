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

for (const engine of ['openlayers', 'maplibre']) {
    try {
        await run(engine);
    } catch (err) {
        failures.push(`  FAIL  ${engine}: threw — ${err.message}`);
    }
}

console.log(notes.join('\n'));
if (failures.length) {
    console.log('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
}
console.log('\nAll edit-mode checks passed on both engines.');
