// Open the real disclosure before an existing step-entry/settings interaction.
async function revealCreationControl(page,selector){
 const control=page.locator(selector);
 if(['#image-suggest','#image-settings-open'].includes(selector)&&!await control.isVisible()&&await page.locator('[data-mode=backing]').isVisible())await page.locator('[data-mode=backing]').click();
 if(!await control.isVisible()&&await control.evaluate(n=>!!n.closest('#image-chords'))&&await page.locator('[data-mode=backing]').isVisible())await page.locator('[data-mode=backing]').click();
 if(['#creation-note-display','#instrument','#image-rhythm','#image-genre'].includes(selector))return;
 if(!await control.isVisible()&&await control.evaluate(n=>!!n.closest('#backing-rebuild'))&&await page.locator('[data-mode=backing]').isVisible())await page.locator('[data-mode=backing]').click();
 if(!await control.isVisible()&&await control.evaluate(n=>!!n.closest('#creation-settings'))&&await page.locator('[data-mode=edit]').isVisible())await page.locator('[data-mode=edit]').click();
 if(!await control.isVisible()&&await control.evaluate(n=>n.matches('#image-next')||!!n.closest('#image-words'))){if(await page.locator('[data-mode=backing]').isVisible())await page.locator('[data-mode=backing]').click();if(!await page.locator('#backing-rebuild').evaluate(n=>n.open))await page.locator('#backing-rebuild>summary').click();await page.locator('#image-choice-reopen').click();}

 if(!await control.isVisible()&&await page.locator('#creation-options-toggle').isVisible()&&await control.evaluate(n=>!!n.closest('#creation-options')))await page.locator('#creation-options-toggle').click();
 if(!await control.isVisible()&&await page.locator('#image-record-return').isVisible()&&await control.evaluate(n=>!!n.closest('#image-edit-tools')))await page.locator('#image-record-return').click();
 const disclose=async()=>{
  const ancestors=await control.locator('xpath=ancestor::details').all();
  for(let pass=0;pass<2;pass++)for(const detail of ancestors){const summary=detail.locator(':scope>summary');if(!await detail.evaluate(n=>n.open)&&await summary.isVisible())await summary.click();}
 };
 await disclose();
 const input=page.locator('#creation-input-display');
 if(!await control.isVisible()&&!await input.isVisible()&&await page.locator('#creation-options-toggle').isVisible()&&await control.evaluate(n=>!!n.closest('#composer-panel,.keyboard-actions,.keyboard-settings')))await page.locator('#creation-options-toggle').click();
 if(!await control.isVisible()&&await input.isVisible()){
  if(await control.evaluate(n=>!!n.closest('#composer-panel')))await input.selectOption('cards');
  else if(await control.evaluate(n=>!!n.closest('.keyboard-actions,.keyboard-settings')))await input.selectOption('keyboard');
 }
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
 await page.locator('[data-part-original]').click();
}
module.exports.startNewPart=startNewPart;module.exports.openProjectPart=openProjectPart;

// Exercise the two visible selectors, including fixtures saved with a combined id.
function hatChoice(id){return ({
 'hat-half-front':['hat-half-on','beat-1'],'hat-half-back':['hat-half-on','beat-3'],
 'hat-backbeat':['hat-half-off','none'],'hat-backbeat-front':['hat-half-off','beat-2'],'hat-backbeat-back':['hat-half-off','beat-4'],
 'hat-quarters-first':['hat-quarter-on','beat-1'],'hat-quarters-third':['hat-quarter-on','beat-3'],
 'hat-quarters-front':['hat-quarter-on','beats-13'],'hat-quarters-back':['hat-quarter-on','beats-24'],
})[id]??[id,'none'];}
async function chooseHat(page,id,accent){
 const [rhythm,defaultAccent]=hatChoice(id),selected=accent??defaultAccent;
 if(await page.locator('#image-drums').inputValue()!==rhythm)await page.locator('#image-drums').selectOption(rhythm);
 if(!['auto','none'].includes(rhythm)&&await page.locator('#image-accent').inputValue()!==selected)await page.locator('#image-accent').selectOption(selected);
}
module.exports.chooseHat=chooseHat;module.exports.hatChoice=hatChoice;

async function chooseNoteDisplay(page,value){
 const opened=!await page.locator('#melody-settings').isVisible();if(opened)await page.locator('#screen-settings').click();
 if(!await page.locator('#device-tools').evaluate(n=>n.open))await page.locator('#device-tools>summary').click();
 await page.locator('#creation-note-display').selectOption(value);if(opened)await page.locator('#settings-close-bottom').click();
}
async function chooseSongInstrument(page,value){
 const opened=!await page.locator('#instrument').isVisible();if(opened)await page.locator('#screen-settings').click();
 await page.locator('#instrument').selectOption(value);if(opened)await page.locator('#settings-close-bottom').click();
}
async function chooseBackingRhythm(page,value){
 const opened=!await page.locator('#image-rhythm').isVisible();if(opened){await revealCreationControl(page,'#image-settings-open');await page.locator('#image-settings-open').click();}
 await page.locator('#image-rhythm').selectOption(value);if(opened)await page.locator('#backing-settings-close-bottom').click();
}
async function chooseBackingGenre(page,value){
 if(await page.locator('#image-genre').isVisible()&&!await page.locator('#backing-genre-use').count()){await page.locator('#image-genre').selectOption(value);return;}
 if(await page.locator('#backing-settings').isVisible())await page.locator('#backing-settings-close-bottom').click();
 if(!await page.locator('#backing-rebuild').isVisible())await page.locator('[data-mode=backing]').click();
 if(!await page.locator('#backing-rebuild').evaluate(n=>n.open))await page.locator('#backing-rebuild>summary').click();
 await page.locator('#image-genre').selectOption(value);if(await page.locator('#backing-genre-use').isVisible())await page.locator('#backing-genre-use').click();
}
async function chooseProgression(page,id){
 const option=page.locator('#progression-choice option[data-progression="'+id+'"]');await page.locator('#progression-choice').selectOption(await option.getAttribute('value'));
}
module.exports.chooseNoteDisplay=chooseNoteDisplay;module.exports.chooseSongInstrument=chooseSongInstrument;module.exports.chooseBackingRhythm=chooseBackingRhythm;module.exports.chooseBackingGenre=chooseBackingGenre;module.exports.chooseProgression=chooseProgression;

async function chooseInputDisplay(page,value){await revealCreationControl(page,'#creation-input-display');await page.locator('#creation-input-display').selectOption(value);}
module.exports.chooseInputDisplay=chooseInputDisplay;
