import {chromium} from 'playwright';
const SPEC = JSON.parse(process.env.SPEC);
const OUT = process.env.OUT;
const square = ([lon, lat], h) => [[
    [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]];
const features = SPEC.map((item, i) => {
    const lon = -60 + i * 30;
    const shift = c => [c[0] + lon, c[1] + 20];
    const geometry = item.point ? {type: 'Point', coordinates: [lon + 7, 20]}
        : item.coords ? {type: 'LineString', coordinates: item.coords.map(shift)}
        : item.area ? {type: 'Polygon', coordinates: square([lon + 7, 20], 7)}
        : {type: 'LineString', coordinates: [[lon, 20], [lon + 14, 20]]};
    return {type: 'Feature', geometry, properties: {role: 'base', symbolId: `probe-${item.name}-${i}`,
        graphicName: item.name, tacticalGraphic: {name: item.name, ...item.props}}};
});
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1700, height: 620}, deviceScaleFactor: 2});
page.on('console', m => { if (m.type() === 'error') console.log('  console.error:', m.text()); });
await page.goto('http://localhost:3000/', {waitUntil: 'load', timeout: 120_000});
await page.waitForFunction(() => !!window.__tacticalGraphics?.manager, null, {timeout: 120_000});
await page.waitForTimeout(2000);
const report = await page.evaluate(fc => {
    const hook = window.__tacticalGraphics;
    hook.drawSpikeSamples(fc);
    hook.map.getView().fit(hook.manager.renderingVectorSource.getExtent(),
        {size: hook.map.getSize(), padding: [90, 90, 90, 460]});
    hook.map.getLayers().getArray().forEach(l => { if (l.getSource()?.constructor?.name === 'OSM') l.setOpacity(0.2); });
    const kinds = {};
    hook.manager.renderingVectorSource.getFeatures().forEach(f => {
        const n = f.get('graphicName'); kinds[n] = (kinds[n] ?? 0) + 1; });
    return kinds;
}, {type: 'FeatureCollection', features});
console.log('features by graphic:', report);
await page.waitForTimeout(1500);
await page.screenshot({path: OUT});
console.log('wrote', OUT);
await browser.close();
