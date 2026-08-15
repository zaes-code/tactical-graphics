import {chromium} from 'playwright';
import {readdirSync} from 'fs';
import {pathToFileURL} from 'url';
const DIR = process.env.DIR;
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1320, height: 900}, deviceScaleFactor: 2});
for (const f of readdirSync(DIR).filter(n => n.endsWith('.html')).sort()) {
    await page.goto(pathToFileURL(`${DIR}/${f}`).href, {waitUntil: 'load'});
    await page.screenshot({path: `${DIR}/${f.replace('.html', '.png')}`, fullPage: true});
}
console.log('shot', readdirSync(DIR).filter(n => n.endsWith('.png')).length, 'sheets');
await browser.close();
