import { medalMarkup } from '../src/ui/achievement.js';
export const DIRECTIONS = {up:['↑','うえ'],down:['↓','した'],left:['←','ひだり'],right:['→','みぎ']};
export const $ = id => document.getElementById(id);
export function node(tag, text, className) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(className)e.className=className; return e; }
export function directionIcon(direction) {
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','direction-icon');svg.setAttribute('aria-hidden','true');
  path.setAttribute('d','M4 12h16m-7-7 7 7-7 7');path.setAttribute('transform',`rotate(${{right:0,down:90,left:180,up:270}[direction]} 12 12)`);
  svg.append(path);return svg;
}
export function renderStepOptions(size) {
  const select=$('step-count'),maximum=size-1;
  if(select.options.length===maximum)return;
  const selected=Math.min(Number(select.value)||1,maximum);select.replaceChildren();
  for(let n=1;n<=maximum;n++){const option=node('option',String(n));option.value=n;select.append(option)}
  select.value=String(selected);
}
export function popcount(n) { let count=0; for(;n;n&=n-1)count++; return count; }
export function showScreen(id) {
  for(const section of document.querySelectorAll('#app > .screen'))section.hidden=section.id!==id;
  $('home').hidden=id!=='title'; $('quit').hidden=id==='title';
  $('mode-label').textContent=id==='title'?'':'デリバリズム';
}
export function renderBoard(stage,runtime,{hintTarget,hintDirection,failedCell}={}) {
  const board=$('board');board.style.setProperty('--n',stage.size);board.replaceChildren();
  const blocked=new Set(stage.blocked),held=popcount(runtime.heldMask);
  const sprite=['empty','one','two'][held];
  for(let cell=0;cell<stage.size*stage.size;cell++){
    const tile=node('div',undefined,'cell');tile.dataset.cell=cell;
    tile.classList.toggle('blocked',blocked.has(cell));
    tile.classList.toggle('hint-target',hintTarget===cell);tile.classList.toggle('failed-cell',failedCell===cell);
    const pic=(name,cls)=>{const img=node('img',undefined,cls);img.src=`../assets/delivery/${name}`;img.alt='';tile.append(img);return img};
    if(blocked.has(cell))pic('obstacle.svg','obstacle');
    else{
      if(cell%stage.size<stage.size-1&&!blocked.has(cell+1))tile.classList.add('link-right');
      if(cell+stage.size<stage.size*stage.size&&!blocked.has(cell+stage.size))tile.classList.add('link-down');
      if(cell===stage.destination)pic('destination.svg','destination');
      const index=stage.packages.findIndex(p=>p.cell===cell);
      if(index>=0&&!((runtime.heldMask|runtime.deliveredMask)&(1<<index)))pic('package.svg','package');
      if(cell===runtime.position){const img=pic(`robot-${sprite}.webp`,'robot');img.dataset.position=cell;img.alt=`ロボット、にもつ${held}こ`;if(hintDirection){const arrow=node('span',undefined,'hint-arrow');arrow.append(directionIcon(hintDirection));tile.append(arrow)}}
    }
    board.append(tile);
  }
  board.setAttribute('aria-label',`${stage.size}かける${stage.size}のばんめん。ロボットは${Math.floor(runtime.position/stage.size)+1}ぎょう${runtime.position%stage.size+1}れつ。はいだつ${popcount(runtime.deliveredMask)}こ。`);
  $('delivery-count').textContent=`とどけた ${popcount(runtime.deliveredMask)} / ${stage.packages.length}`;
  $('hands').replaceChildren();$('hands').setAttribute('aria-label',`もっている にもつ ${held}こ、2こまで`);
  for(let i=0;i<2;i++){const slot=node('span',undefined,'hand');if(i<held){const img=node('img');img.src='../assets/delivery/package.svg';img.alt='にもつ';slot.append(img)}else slot.textContent='−';$('hands').append(slot)}
}
export function renderSequence(session) {
  const el=$('sequence'),scroll=el.scrollTop;el.replaceChildren();
  session.sequence.forEach((command,index)=>{
    const btn=node('button');btn.dataset.row=index;btn.type='button';
    const instruction=node('span',undefined,'instruction');instruction.append(directionIcon(command.direction),document.createTextNode(`${DIRECTIONS[command.direction][1]} ${command.count}`));
    btn.append(node('span',`${index+1}ばん`,'row-label'),instruction);
    btn.classList.toggle('selected',session.selectedIndex===index);
    btn.classList.toggle('running',['executing','paused'].includes(session.phase)&&session.commandIndex===index);
    btn.disabled=session.phase!=='editing';btn.setAttribute('aria-pressed',String(session.selectedIndex===index));el.append(btn);
  });
  el.scrollTop=scroll;
  if(session.phase==='executing'){
    const row=el.querySelector('.running');
    if(row){const box=el.getBoundingClientRect(),item=row.getBoundingClientRect();if(item.top<box.top)el.scrollTop+=item.top-box.top;else if(item.bottom>box.bottom)el.scrollTop+=item.bottom-box.bottom;}
  }
  $('selection-label').textContent=Number.isInteger(session.selectedIndex)?`${session.selectedIndex+1}ばんを なおす`:'さいごに ついか';
  $('add-command').textContent=Number.isInteger(session.selectedIndex)?'おきかえる':'ついか';
}
export function renderRecord(el,title,difficulty) {
  el.replaceChildren();if(title)el.insertAdjacentHTML('beforeend',medalMarkup(title.medal));
  const text=node('div');text.append(node('small',`デリバリズム・${difficulty==='easy'?'やさしい':'むずかしい'}`),node('strong',title?.name||'称号は これから'));el.append(text);
}
export {medalMarkup};
