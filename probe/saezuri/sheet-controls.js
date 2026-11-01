// Keep content scrollable while its header and footer actions stay in place.
export function setupPlaybackSheet(dialog,{closeId,stopId,onStop,stopOnClose=true,footerCloseId=null}) {
 dialog.classList.add('playback-sheet');
 let heading=dialog.querySelector('.screen-heading');
 if(!heading){heading=document.createElement('div');heading.className='screen-heading';heading.append(dialog.querySelector('h2'),dialog.querySelector('[data-close]'));dialog.prepend(heading);}
 const close=heading.querySelector('button');close.id=closeId;close.textContent='とじる';
 let action=stopId?dialog.querySelector('#'+stopId):null;
 const oldStopRow=dialog.querySelector('.sheet-stop');
 if(footerCloseId){
  action?.remove();action=document.createElement('button');action.id=footerCloseId;action.textContent='とじる';action.onclick=()=>close.click();
 }else{
  if(!action){action=document.createElement('button');action.id=stopId;}
  action.textContent='■ とめる';action.onclick=()=>onStop();
 }
 action.remove();oldStopRow?.remove();
 const body=document.createElement('div');body.className='sheet-body';
 for(const node of [...dialog.childNodes])if(node!==heading)body.append(node);
 const footer=document.createElement('div');footer.className='sheet-stop';footer.append(action);
 dialog.append(body,footer);
 if(stopOnClose)dialog.addEventListener('close',()=>onStop());
}

// Android's keyboard can shrink only the visual viewport, leaving vh and the
// layout viewport unchanged. Track the visible rectangle without refocusing or
// scrolling the page, so native input/IME selection remains untouched.
export function keepDialogVisible(dialog){
 const viewport=window.visualViewport,properties=['top','left','width','height'].map(key=>'--dialog-visible-'+key);let frame=0;
 const update=()=>{
  if(!dialog.open)return;
  const visibleWidth=viewport?.width??innerWidth,visibleHeight=viewport?.height??innerHeight,width=Math.max(0,Math.min(540,visibleWidth-16));
  const values=[(viewport?.offsetTop??0)+8,(viewport?.offsetLeft??0)+(visibleWidth-width)/2,width,Math.max(0,visibleHeight-16)];
  properties.forEach((key,index)=>dialog.style.setProperty(key,values[index]+'px'));
  dialog.toggleAttribute('data-viewport-short',visibleHeight<360);dialog.toggleAttribute('data-viewport-tiny',visibleHeight<260);dialog.toggleAttribute('data-viewport-narrow',visibleWidth<300);
 };
 const schedule=()=>{if(!dialog.open||frame)return;frame=requestAnimationFrame(()=>{frame=0;update();});};
 viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);
 dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);frame=0;for(const key of properties)dialog.style.removeProperty(key);for(const key of ['short','tiny','narrow'])dialog.removeAttribute('data-viewport-'+key);});
 return update;
}
