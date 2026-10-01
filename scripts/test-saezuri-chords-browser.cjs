const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8014')+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-image').click();
 await page.locator('#image-suggest').click();assert.equal(await page.locator('.suggestion-row').count(),3);await page.locator('.suggestion-row button').first().click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#progression-suggestions > button').first().click();await page.locator('#progression-suggestions > button').last().click();
 assert.equal(await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().list()).length;}),0,'audition does not allocate an empty song');
 await page.locator('[data-chord-bar="0"]').click({timeout:3000});
 await page.locator('#chord-detail summary').click();
 await page.locator('#chord-root').selectOption('11');await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');
 await page.locator('#chord-confirm').click();assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/C♯/);
 await page.locator('#image-settings-open').click();await page.locator('#image-genre').selectOption('ballad');await page.locator('#backing-settings-close').click();await page.locator('#capture-edit-confirm').click();
 assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/C♯/);
 await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();await page.locator('#sound-chord').selectOption('lead');await page.locator('#sounds-close').click();await page.locator('#backing-settings-close').click();await page.locator('#capture-edit-confirm').click();
 await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#stop').click();
 await page.locator('#discard').click();await page.locator('#melody-home').waitFor({state:'visible'});await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').click();await page.locator('[data-mode="backing"]').click();
 assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/C♯/);
 await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();assert.equal(await page.locator('#sound-chord').inputValue(),'lead');await page.locator('#sounds-close').click();await page.locator('#backing-settings-close').click();
 await page.screenshot({path:'.local-tools/saezuri-workflow-backing.png'});
 const rowHeight=await page.locator('#image-chords').evaluate(node=>node.getBoundingClientRect().height);
 await page.locator('#screen-settings').click();await page.locator('#creation-settings details').first().locator('summary').click();await page.locator('#composer-extend').click();await page.locator('#settings-close').click();await page.locator('#capture-edit-confirm').click();
 assert.equal(await page.locator('[data-chord-bar]').count(),8);assert.equal(await page.locator('#image-chords').evaluate(node=>node.getBoundingClientRect().height),rowHeight,'8 bars keep the same single-row chord height');
 for(const id of ['preview','capture-edit-confirm','stop']){const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.y+box.height<=844,`${id} stays visible without scrolling at 390x844`);}
 await page.screenshot({path:'.local-tools/saezuri-workflow-backing-8bars.png'});
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('chord sheet, genre preservation, custom sounds, reload, narrow screens: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
