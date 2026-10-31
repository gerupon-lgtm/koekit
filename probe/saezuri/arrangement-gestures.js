const $=id=>document.getElementById(id);
// Pointer capture belongs to the stable line, never to a card replaced on render.
export class ArrangementGestures{
 constructor(shell,{onSelect}){
  this.shell=shell;this.onSelect=onSelect;this.line=$('sequence-line');this.moving=null;this.press=null;this.drag=null;this.suppressUntil=0;
  this.menu=document.createElement('dialog');this.menu.id='sequence-card-menu';this.menu.className='song-dialog';this.menu.innerHTML='<h2 id="sequence-card-menu-title">このカード</h2><div class="project-menu-actions"><button id="sequence-menu-remove">外す</button><button id="sequence-menu-move">移動</button><button id="sequence-menu-close">とじる</button></div>';
  document.querySelector('main').append(this.menu);$('sequence-menu-close').onclick=()=>this.menu.close();
  $('sequence-menu-remove').onclick=()=>{const id=this.menuId;this.menu.close();shell.stage({type:'remove',placementId:id});};
  $('sequence-menu-move').onclick=()=>{this.moving=this.menuId;this.menu.close();shell.selected=this.moving;shell.renderSequence();$('sequence-message').textContent='このカードを押さえて、入れたい場所へ動かしてね。';};
  this.menu.addEventListener('close',()=>shell.onNavigate());
  this.line.addEventListener('pointerdown',e=>this.down(e));this.line.addEventListener('pointermove',e=>this.move(e));
  this.line.addEventListener('pointerup',e=>this.up(e));this.line.addEventListener('pointercancel',()=>this.cancel());this.line.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancel();});
  this.line.addEventListener('contextmenu',e=>{const card=e.target.closest('[data-placement]');if(card){e.preventDefault();this.showMenu(card.dataset.placement);}});
  this.line.addEventListener('keydown',e=>{const card=e.target.closest('[data-placement]');if(card&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();this.showMenu(card.dataset.placement);}});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&(this.drag||this.moving||this.press)){e.preventDefault();this.cancel();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
 }
 locked(){return this.shell.busy||!!this.shell.proposal||this.shell.placementWorkflow.active;}
 tap(id){if(performance.now()<this.suppressUntil||this.moving||this.locked())return;this.onSelect(id);}
 showMenu(id){if(this.locked())return;this.clearPress();this.suppressUntil=performance.now()+700;this.menuId=id;const card=this.line.querySelector(`[data-placement="${CSS.escape(id)}"]`);$('sequence-card-menu-title').textContent=card?.textContent??'このカード';this.menu.showModal();this.shell.onNavigate();}
 down(e){
  if(e.button!==0||!e.isPrimary||this.locked())return;const card=e.target.closest('[data-placement]');if(!card)return;
  const id=card.dataset.placement;
  if(this.moving===id){e.preventDefault();this.clearPress();this.drag={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,index:null};this.line.setPointerCapture(e.pointerId);this.suppressUntil=Infinity;return;}
  if(this.moving){this.cancel();return;}
  this.clearPress();this.press={id,x:e.clientX,y:e.clientY,pointerId:e.pointerId,timer:setTimeout(()=>{this.showMenu(id);},500)};
 }
 move(e){
  if(this.press&&this.press.pointerId===e.pointerId&&Math.hypot(e.clientX-this.press.x,e.clientY-this.press.y)>10)this.clearPress();
  const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;e.preventDefault();d.x=e.clientX;d.y=e.clientY;
  if(!d.moved&&Math.hypot(d.x-d.startX,d.y-d.startY)>8){d.moved=true;this.ghost=document.createElement('div');this.ghost.className='sequence-ghost';this.ghost.textContent=this.line.querySelector(`[data-placement="${CSS.escape(d.id)}"]`).textContent;document.body.append(this.ghost);this.tick();}
  if(d.moved)this.position();
 }
 position(){
  const d=this.drag;if(!d||!this.ghost)return;this.ghost.style.left=Math.max(8,Math.min(innerWidth-148,d.x-60))+'px';this.ghost.style.top=(d.y-28)+'px';
  const bounds=this.line.getBoundingClientRect();const inside=d.x>=bounds.left-16&&d.x<=bounds.right+16&&d.y>=Math.max(0,bounds.top)-20&&d.y<=Math.min(innerHeight,bounds.bottom)+20;
  const cards=[...this.line.querySelectorAll('[data-placement]')].filter(b=>b.dataset.placement!==d.id);d.index=inside?cards.filter(b=>d.y>b.getBoundingClientRect().top+b.offsetHeight/2).length:null;
  for(const b of this.line.querySelectorAll('[data-drop-before],[data-drop-after]')){b.removeAttribute('data-drop-before');b.removeAttribute('data-drop-after');}
  if(d.index!==null){const target=cards[d.index]??cards.at(-1);target?.setAttribute(d.index===cards.length?'data-drop-after':'data-drop-before','');}
 }
 tick(){
  if(!this.drag?.moved)return;const r=this.line.getBoundingClientRect(),y=this.drag.y,top=Math.max(r.top,0),bottom=Math.min(r.bottom,innerHeight-60);let delta=0;
  if(y<top+38)delta=-Math.min(9,(top+38-y)/4);else if(y>bottom-38)delta=Math.min(9,(y-bottom+38)/4);
  if(delta){this.line.scrollTop+=delta;this.position();}this.frame=requestAnimationFrame(()=>this.tick());
 }
 up(e){
  this.clearPress();const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;e.preventDefault();const original=this.shell.sequence.placements.findIndex(p=>p.id===d.id);const r=this.line.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=Math.max(0,r.top)&&e.clientY<=Math.min(innerHeight-60,r.bottom);const index=inside?d.index:null,moved=d.moved;this.cleanup();this.moving=null;this.render();
  if(moved&&index!==null&&index!==original)this.shell.stage({type:'move',placementId:d.id,index});
 }
 clearPress(){if(this.press)clearTimeout(this.press.timer);this.press=null;}
 cleanup(){const pointer=this.drag?.pointerId;this.drag=null;cancelAnimationFrame(this.frame);this.ghost?.remove();this.ghost=null;if(pointer!==undefined)this.suppressUntil=performance.now()+500;
  if(pointer!==undefined&&this.line.hasPointerCapture(pointer))this.line.releasePointerCapture(pointer);
  for(const b of this.line.querySelectorAll('[data-drop-before],[data-drop-after]')){b.removeAttribute('data-drop-before');b.removeAttribute('data-drop-after');}
 }
 cancel(){this.clearPress();this.cleanup();this.moving=null;this.render();}
 render(){for(const card of this.line.querySelectorAll('[data-placement]')){card.toggleAttribute('data-move-ready',card.dataset.placement===this.moving);}}
}
