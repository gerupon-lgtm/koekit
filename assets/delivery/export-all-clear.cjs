// Format conversion only; preserve the approved illustration, without crop or retouch.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../../.local-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage();
  const source=fs.readFileSync(path.join(__dirname,'originals/all-clear.png')).toString('base64');
  const data=await page.evaluate(async source=>{const img=new Image();img.src='data:image/png;base64,'+source;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/webp',.9)},source);
  if(!data.startsWith('data:image/webp;base64,'))throw Error('WebP encoder unavailable');
  const output=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(path.join(__dirname,'all-clear.webp'),output);console.log(`all-clear.webp: ${output.length} bytes`);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
