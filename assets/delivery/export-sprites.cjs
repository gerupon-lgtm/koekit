// Optional asset conversion using the repository's local browser test tools.
// Format conversion/downsampling only: no crop, retouch, background removal or alignment edits.
// node assets/delivery/export-sprites.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../.local-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const verification = {};
    for (const state of ['empty', 'one', 'two']) {
      const name = `robot-${state}`;
      const input = fs.readFileSync(path.join(__dirname, 'originals', name + '.png')).toString('base64');
      const result = await page.evaluate(async data => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data;
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 256, 256);
        const rgba = ctx.getImageData(0, 0, 256, 256).data;
        let transparent = 0, opaque = 0;
        const bounds = { left: 256, top: 256, right: -1, bottom: -1 };
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          const alpha = rgba[(y * 256 + x) * 4 + 3];
          if (alpha === 0) transparent++;
          if (alpha > 128) { opaque++; bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y); bounds.right = Math.max(bounds.right, x); bounds.bottom = Math.max(bounds.bottom, y); }
        }
        return { sourceSize: [image.width, image.height], outputSize: [256, 256], transparent, opaque, bounds, webp: canvas.toDataURL('image/webp', .92) };
      }, input);
      if (!result.webp.startsWith('data:image/webp;base64,')) throw Error('WebP encoder unavailable');
      if (!result.transparent || !result.opaque) throw Error('Missing transparent sprite pixels');
      const buffer = Buffer.from(result.webp.split(',')[1], 'base64');
      fs.writeFileSync(path.join(__dirname, name + '.webp'), buffer);
      delete result.webp; result.bytes = buffer.length;
      verification[name] = result;
    }
    fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify(verification, null, 2) + '\n');
    console.log(JSON.stringify(verification));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
