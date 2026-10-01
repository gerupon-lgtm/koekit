// Keep the content scrollable while close and playback stop stay in place.
export function setupPlaybackSheet(dialog,{closeId,stopId,onStop,stopOnClose=true}) {
 dialog.classList.add('playback-sheet');
 let heading=dialog.querySelector('.screen-heading');
 if(!heading){heading=document.createElement('div');heading.className='screen-heading';heading.append(dialog.querySelector('h2'),dialog.querySelector('[data-close]'));dialog.prepend(heading);}
 const close=heading.querySelector('button');close.id=closeId;close.textContent='とじる';
 let stop=dialog.querySelector('#'+stopId);
 const oldStopRow=dialog.querySelector('.sheet-stop');
 if(!stop){stop=document.createElement('button');stop.id=stopId;}
 stop.textContent='■ とめる';stop.onclick=()=>onStop();stop.remove();oldStopRow?.remove();
 const body=document.createElement('div');body.className='sheet-body';
 for(const node of [...dialog.childNodes])if(node!==heading)body.append(node);
 const footer=document.createElement('div');footer.className='sheet-stop';footer.append(stop);
 dialog.append(body,footer);
 if(stopOnClose)dialog.addEventListener('close',()=>onStop());
}
