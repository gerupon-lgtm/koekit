// Open the real disclosure before an existing step-entry/settings interaction.
async function revealCreationControl(page,selector){
 const control=page.locator(selector);
 if(!await control.isVisible()&&await page.locator('#creation-options-toggle').isVisible()&&await control.evaluate(n=>!!n.closest('#creation-options')))await page.locator('#creation-options-toggle').click();
 if(!await control.isVisible()&&await page.locator('#image-record-return').isVisible()&&await control.evaluate(n=>!!n.closest('#image-edit-tools')))await page.locator('#image-record-return').click();
 const disclose=async()=>{
  const ids=await control.evaluate(n=>{const ids=[];for(let d=n.parentElement;d;d=d.parentElement)if(d.matches('details#image-edit-tools,details#image-backing-detail,details#step-entry,details#keyboard-more,details#phrase-tools,details#keyboard-practice-tools')&&!d.open&&!(n.tagName==='SUMMARY'&&n.parentElement===d))ids.unshift(d.id);return ids;});
  for(const id of ids)if(await page.locator(`#${id}>summary`).isVisible())await page.locator(`#${id}>summary`).click();
 };
 if(!await control.isVisible()&&await page.locator('#image-choice-reopen').isVisible()&&await control.evaluate(n=>n.matches('#composer-key,#phrase-bars')||!!n.closest('#image-words,#image-chords')))await page.locator('#image-choice-reopen').click();
 await disclose();
 const input=page.locator('#creation-input-display');
 if(!await control.isVisible()&&!await input.isVisible()&&await page.locator('#creation-options-toggle').isVisible()&&await control.evaluate(n=>!!n.closest('#composer-panel,.keyboard-actions')))await page.locator('#creation-options-toggle').click();
 if(!await control.isVisible()&&await input.isVisible()){
  if(await control.evaluate(n=>!!n.closest('#composer-panel')))await input.selectOption('cards');
  else if(await control.evaluate(n=>!!n.closest('.keyboard-actions')))await input.selectOption('keyboard');
 }
 if(await control.evaluate(n=>(n.id==='image-next'||!!n.closest('#image-words'))&&document.querySelector('#image-choice-reopen')&&!document.querySelector('#image-choice-reopen').hidden))await page.locator('#image-choice-reopen').click();
 await disclose();
}
async function openSongActions(page,id){
 const action=page.locator(`[data-song-rename="${id}"]`);
 if(!await action.isVisible())await page.locator(`[data-song-more="${id}"]`).click();
}
async function resumeSavedSong(page,id=null,screen=null){
 await page.waitForFunction(()=>document.querySelector('#status')?.dataset.state!=='saving');
 if(!await page.locator('#song-library').isVisible()){
  if(await page.locator('#melody-home').isVisible())await page.locator('#home-songs').click();
  else{if(await page.locator('#melody-create').isVisible())await page.locator('#work-connect').click();await page.locator('#sequence-song').click();}
 }
 const target=id?page.locator(`[data-song-open="${id}"]`):page.locator('[data-song-open]').first();await target.click();
 if(await page.locator('#song-continue').isVisible())await page.locator('#song-continue').click();
 if(screen==='create'&&await page.locator('#melody-connect').isVisible())await page.locator('#sequence-work-create').click();
 if(screen==='connect'&&await page.locator('#melody-create').isVisible())await page.locator('#work-connect').click();
}
module.exports={revealCreationControl,openSongActions,resumeSavedSong};

// Start at the song overview before choosing a new part's source.
async function startNewPart(page,source='new-manual'){
 await page.locator('#home-create').click();await page.locator('#sequence-create').click();await page.locator('#'+source).click();
}
async function openProjectPart(page,index=-1){
 const parts=page.locator('#phrase-shelf [data-phrase]');await parts.nth(index<0?await parts.count()-1:index).click();
 await page.getByRole('button',{name:'つづきをつくる',exact:true}).click();
}
module.exports.startNewPart=startNewPart;module.exports.openProjectPart=openProjectPart;
