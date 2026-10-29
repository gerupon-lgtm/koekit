// Open the real disclosure before an existing step-entry/settings interaction.
async function revealCreationControl(page,selector){
 const control=page.locator(selector);
 if(!await control.isVisible()&&await page.locator('#creation-options-toggle').isVisible()&&await control.evaluate(n=>!!n.closest('#creation-options')))await page.locator('#creation-options-toggle').click();
 if(!await control.isVisible()&&await page.locator('#image-record-return').isVisible()&&await control.evaluate(n=>!!n.closest('#image-edit-tools')))await page.locator('#image-record-return').click();
 const disclose=async()=>{
  const ids=await control.evaluate(n=>{const ids=[];for(let d=n.parentElement;d;d=d.parentElement)if(d.matches('details#image-edit-tools,details#image-backing-detail,details#step-entry,details#keyboard-more,details#phrase-tools')&&!d.open)ids.unshift(d.id);return ids;});
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
module.exports={revealCreationControl};
