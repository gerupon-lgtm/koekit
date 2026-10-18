// Open the real disclosure before an existing step-entry/settings interaction.
async function revealCreationControl(page,selector){
 const control=page.locator(selector);
 const input=page.locator('#creation-input-display');
 if(!await control.isVisible()&&await input.isVisible()){
  if(await control.evaluate(n=>!!n.closest('#composer-panel')))await input.selectOption('cards');
  else if(await control.evaluate(n=>!!n.closest('.keyboard-actions')))await input.selectOption('keyboard');
 }
 if(await control.evaluate(n=>(n.id==='image-next'||!!n.closest('#image-words'))&&document.querySelector('#image-choice-reopen')&&!document.querySelector('#image-choice-reopen').hidden))await page.locator('#image-choice-reopen').click();
 const details=await control.evaluate(n=>{const d=n.closest('#step-entry,#keyboard-more');return d&&!d.open?d.id:null;});
 if(details)await page.locator(`#${details}>summary`).click();
}
module.exports={revealCreationControl};
