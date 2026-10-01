// Reserve equal space on both sides of the title, even when only one side has buttons.
export function alignScreenHeadings(root=document) {
 for(const header of root.querySelectorAll('.screen-heading')){
  const title=header.querySelector('h2');
  if(!title||header.querySelector('.heading-actions'))continue;
  const start=document.createElement('div'),end=document.createElement('div');
  start.className='heading-actions';end.className='heading-actions heading-actions-end';
  let afterTitle=false;
  for(const child of [...header.children]){
   if(child===title){afterTitle=true;continue;}
   (afterTitle?end:start).append(child);
  }
  header.replaceChildren(start,title,end);
  const measure=()=>header.style.setProperty('--heading-side',`${Math.max(start.getBoundingClientRect().width,end.getBoundingClientRect().width)}px`);
  const observer=new ResizeObserver(measure);observer.observe(start);observer.observe(end);measure();
 }
}
