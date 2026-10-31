const {chromium}=require('../.local-tools/node_modules/playwright');const assert=require('node:assert/strict');
const {revealCreationControl}=require('./saezuri-browser-controls.cjs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.SAEZURI_BASE||'http://127.0.0.1:8014')+'/probe/saezuri/');await page.locator('#home-create').click();await page.locator('#new-image').click();
 await revealCreationControl(page,'#image-suggest');await page.locator('#image-suggest').click();assert.equal(await page.locator('.suggestion-row').count(),4);assert.equal(await page.locator('#progression-all-open').count(),0);
 for(let i=0;i<4;i++){await page.locator('.suggestion-row').nth(i).locator('button').first().click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#progression-stop').click();}
 await page.locator('#progression-close').click();
 assert.equal(await page.evaluate(async()=>{const {SongStore}=await import('/saezuri/song-store.js');return (await new SongStore().list()).length;}),0,'audition does not allocate an empty song');
 await revealCreationControl(page,'#image-suggest');await page.locator('#image-suggest').click();await page.locator('.suggestion-row').nth(3).locator('button').last().click();assert.equal(await page.locator('#progression-suggestions').isVisible(),false);assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/F/);assert.equal(await page.locator('#backing-loop').isDisabled(),true);assert.match(await page.locator('#loop-hint').textContent(),/オッケー/);
 await page.locator('[data-chord-bar="0"]').click({timeout:3000});
 await page.locator('#chord-all-mode').click();
 await page.locator('#chord-root').selectOption('11');await page.locator('#chord-quality').selectOption('m7♭5');await page.locator('#chord-bass').selectOption('1');
 await page.locator('#chord-use').click();await page.locator('#chord-confirm').click();assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/D♭/);assert.equal(await page.locator('#backing-loop').isEnabled(),true,'OK unlocks the changed backing for looping');
 await revealCreationControl(page,'#image-settings-open');await page.locator('#image-settings-open').click();await page.locator('#image-genre').selectOption('ballad');await page.locator('#backing-settings-close').click();await revealCreationControl(page,'#capture-edit-confirm');await page.locator('#capture-edit-confirm').click();
 assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/D♭/);
 await revealCreationControl(page,'#image-settings-open');await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();await page.locator('#sound-chord').selectOption('lead');await page.locator('#sounds-close').click();await page.locator('#backing-settings-close').click();await revealCreationControl(page,'#capture-edit-confirm');await page.locator('#capture-edit-confirm').click();
 await revealCreationControl(page,'#preview');await page.locator('#preview').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='playing');await page.locator('#stop').click();
 await page.locator('#melody-create [data-screen-back]').click();await page.locator('#melody-home').waitFor({state:'visible'});await page.reload();await page.locator('#home-songs').click();await page.locator('[data-song-open]').click();await revealCreationControl(page,'[data-mode="backing"]');await page.locator('[data-mode="backing"]').click();
 assert.match(await page.locator('[data-chord-bar="0"]').textContent(),/Bm7♭5\/D♭/);
 await revealCreationControl(page,'#image-settings-open');await page.locator('#image-settings-open').click();await page.locator('#image-sounds').click();assert.equal(await page.locator('#sound-chord').inputValue(),'lead');await page.locator('#sounds-close').click();await page.locator('#backing-settings-close').click();
 await page.screenshot({path:'.local-tools/saezuri-workflow-backing.png'});
 const rowHeight=await page.locator('#image-chords').evaluate(node=>node.getBoundingClientRect().height);
 await page.locator('#screen-settings').click();await page.locator('#creation-settings details').first().locator('summary').click();await page.locator('#composer-extend').click();await page.locator('#settings-close').click();await page.locator('#capture-edit-confirm').click();
 assert.equal(await page.locator('[data-chord-bar]').count(),8);assert.equal(await page.locator('#image-chords').evaluate(node=>node.getBoundingClientRect().height),rowHeight,'8 bars keep the same single-row chord height');
 // Since the adopted image-recording layout, editing actions live in a disclosure.
 // Check the real reveal/scroll path rather than the superseded always-visible UI.
 for(const id of ['preview','capture-edit-confirm','stop']){await revealCreationControl(page,'#'+id);await page.locator('#'+id).scrollIntoViewIfNeeded();const box=await page.locator('#'+id).boundingBox(),footer=await page.locator('#stop').boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=(id==='stop'?844:footer.y),`${id} is reachable above the fixed footer at 390x844`);}
 await page.screenshot({path:'.local-tools/saezuri-workflow-backing-8bars.png'});
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('chord sheet, genre preservation, custom sounds, reload, narrow screens: PASS');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
