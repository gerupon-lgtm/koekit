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
