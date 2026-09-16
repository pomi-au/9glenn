// Browser acceptance checks: navigation, source dimension quotations, layers and offline use.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 1 });
    async function withControls(action) {
      if (!await page.locator('#workspace-controls').evaluate(el => el.matches(':popover-open')))
        await page.locator('#controls-toggle').click();
      await action();
      if (await page.locator('#workspace-controls').evaluate(el => el.matches(':popover-open')))
        await page.locator('#controls-toggle').click();
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForSelector('#stage svg');
    assert.equal(await page.locator('.nav-item').count(), 8);
    assert.equal(await page.locator('#view-title').textContent(), 'Ground floor');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(255, 255, 255)');
    await page.locator('[data-room="study"]').click();
    assert.match(await page.locator('#selection-details').innerText(), /3,630 mm × 4,500 mm/);
    await page.locator('#zoom-in').click();
    assert.equal(await page.locator('#zoom-level').textContent(), '125%');
    await page.locator('#fit-button').click();
    assert.equal(await page.locator('#zoom-level').textContent(), '100%');
    await page.locator('#measure-button').click();
    async function clickMM(x,y) {
      const point = await page.evaluate(([x,y]) => {
        const svg = document.querySelector('#stage svg');
        const p = new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
        return {x:p.x,y:p.y};
      },[x,y]);
      await page.mouse.click(point.x,point.y);
    }
    const span = await page.evaluate(() => window.DRAWINGS[0].dimensions.find(d=>d.value===26630));
    await clickMM(...span.a);
    await clickMM(...span.b);
    assert.match(await page.locator('#measurement-list').innerText(), /26,630 mm/);
    assert.match(await page.locator('#measurement-list').innerText(), /Dimensioned model span/);
    await page.locator('#units').selectOption('m');
    assert.match(await page.locator('#measurement-list').innerText(), /26.630 m/);
    await page.locator('#snap').uncheck();
    await clickMM(7000,7500);
    await clickMM(8000,8500);
    assert.match(await page.locator('#measurement-list').innerText(), /≈ 1.414 m/);
    await page.locator('#clear-measurements').click();
    assert.equal(await page.locator('.measurement-row').count(), 0);
    await withControls(() => page.locator('[data-toggle="dimensions"]').uncheck());
    assert.equal(await page.locator('[data-layer="dimensions"]').evaluate(el => getComputedStyle(el).display), 'none');
    await withControls(() => page.locator('[data-toggle="dimensions"]').check());
    await page.locator('#pan-button').click();
    await page.locator('[data-dimension="0"] text').click();
    assert.match(await page.locator('#measurement-list').innerText(), /Dimensioned model span/);
    await page.locator('#clear-measurements').click();
    await page.locator('#accuracy-button').click();
    assert.match(await page.locator('#audit-summary').innerText(), /checked spans/);
    assert.ok(await page.locator('#audit-checks tr').count() > 10);
    await page.locator('#close-dialog').click();
    await page.locator('.inspector-close').click();
    await withControls(() => page.locator('#overlay-toggle').check());
    assert.equal(await page.locator('#source-overlay').getAttribute('opacity'), '0.5');
    await withControls(async () => {
      await page.locator('#overlay-opacity').focus();
      await page.keyboard.press('End');
    });
    assert.equal(await page.locator('#source-overlay').getAttribute('opacity'), '1');
    await page.screenshot({ path: path.join(__dirname, '..', 'tmp', 'viewer-overlay.png') });
    await withControls(() => page.locator('#overlay-toggle').uncheck());
    await page.locator('#reference-button').click();
    await page.locator('#source-image').evaluate(image => image.decode());
    assert.equal(await page.locator('#reference-pane').isVisible(), true);
    assert.equal(await page.locator('#source-image').evaluate(image => image.naturalWidth),3316);
    await page.locator('#source-page').selectOption('1');
    await page.locator('#source-image').evaluate(image => image.decode());
    assert.equal(await page.locator('#source-image').evaluate(image => image.naturalWidth),3304);
    await page.locator('#close-reference').click();
    const ids = ['first','cellar','elevation-1','elevation-2','elevation-3','elevation-4','section','ground'];
    for (const id of ids) {
      await withControls(() => page.locator(`.nav-item[data-drawing="${id}"]`).click());
      await page.waitForFunction(id => document.querySelector('#stage svg').getAttribute('aria-label') === window.DRAWINGS.find(d => d.id === id).title, id);
      assert.equal(await page.locator('#stage svg').count(),1);
      assert.equal(await page.locator('#inspector').evaluate(el => el.scrollTop),0);
      const clippedText = await page.locator('#stage svg').evaluate(svg => {
        const [x,y,w,h] = svg.viewBox.baseVal ? [svg.viewBox.baseVal.x,svg.viewBox.baseVal.y,svg.viewBox.baseVal.width,svg.viewBox.baseVal.height] : [];
        return [...svg.querySelectorAll('text')].filter(el => {
          const b=el.getBoundingClientRect(), r=svg.getBoundingClientRect();
          return b.width && (b.left<r.left-1 || b.right>r.right+1 || b.top<r.top-1 || b.bottom>r.bottom+1);
        }).map(el=>el.textContent);
      });
      assert.deepEqual(clippedText,[],`${id}: clipped text`);
      await page.screenshot({ path: path.join(__dirname, '..', 'tmp', `viewer-${id}.png`) });
    }
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#download-button').click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), '9-glenn-ground.svg');
    await download.saveAs(path.join(__dirname, '..', 'tmp', 'download-test.svg'));
    // Changing the viewport must keep controls on-screen and permit navigation.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await withControls(() => page.locator('.nav-item[data-drawing="first"]').click());
    await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'First floor');
    assert.equal(await page.locator('#inspector').isVisible(),false);
    await page.screenshot({ path: path.join(__dirname, '..', 'tmp', 'viewer-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('PASS offline loading, 8 views, room dimensions, zoom, printed/approximate ruler and PDF overlay, units, layers, full-resolution sources, SVG export and mobile layout.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
