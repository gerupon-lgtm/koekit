// Re-export the user-confirmed reference logo. The generated PNG is preserved intact.
// SVG viewBox trims layout whitespace; no recoloring, tracing or common-suffix substitution.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../.local-tools/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),source=fs.readFileSync(path.join(__dirname,'../assets/delivery/originals/wordmark-jintori-style.png')).toString('base64');
 const result=await page.evaluate(async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=0,bottom=0,transparent=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const a=rgba[(y*c.width+x)*4+3];if(a===0)transparent++;if(a>128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}}return {width:c.width,height:c.height,left:Math.max(0,left-8),top:Math.max(0,top-8),right:Math.min(c.width-1,right+8),bottom:Math.min(c.height-1,bottom+8),transparent,data:c.toDataURL('image/webp',.95)}},source);
 if(!result.transparent)throw Error('Logo alpha channel missing');
 const w=result.right-result.left+1,h=result.bottom-result.top+1;
 // Match the existing 799x196 wordmark slot. Optical inset places the visible
 // lettering at the same top as Jintori/Pitari; preserve the source aspect ratio.
 fs.writeFileSync(path.join(__dirname,'../assets/brand/deliverhythm.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="799" height="196" viewBox="0 0 799 196" role="img" aria-label="デリバリズム"><title>デリバリズム</title><svg x="8" y="13" width="783" height="175" viewBox="${result.left} ${result.top} ${w} ${h}" preserveAspectRatio="xMidYMin meet"><image width="${result.width}" height="${result.height}" href="${result.data}"/></svg></svg>\n`);
 delete result.data;fs.writeFileSync(path.join(__dirname,'../assets/delivery/wordmark-verification.json'),JSON.stringify({...result,viewBox:[result.left,result.top,w,h]},null,2));console.log('reference wordmark exported',w,h);
 await page.setViewportSize({width:900,height:300});await page.goto('http://127.0.0.1:8001/delivery/');await page.setContent('<body style="margin:0;background:#faf5ed;display:grid;place-items:center;height:100vh"><img src="http://127.0.0.1:8001/assets/brand/deliverhythm.svg" style="width:800px"></body>');await page.locator('img').evaluate(im=>im.decode());await page.screenshot({path:'.local-tools/delivery/wordmark-reference-preview.png'});
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
