// Musical rests are geometry, so their display never needs a system music font.
const ns='http://www.w3.org/2000/svg';
const node=(tag,attrs)=>{const element=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))element.setAttribute(key,value);return element;};
export function restParts(startTick,durationTick){
 if(!Number.isInteger(startTick)||startTick<0||!Number.isInteger(durationTick)||durationTick<0)throw new RangeError('REST_TIME');
 const parts=[];let tick=startTick,end=startTick+durationTick;
 while(tick<end){const length=[16,8,4,2,1].find(n=>n<=end-tick&&tick%n===0);parts.push({startTick:tick,durationTick:length});tick+=length;}
 return parts;
}
export function createRestSymbol(durationTick,{x=0,y=0,staffSpace=8}={}){
 const kind=({16:'whole',8:'half',4:'quarter',2:'eighth',1:'sixteenth'})[durationTick];
 if(!kind)throw new RangeError('REST_DURATION');
 const group=node('g',{'data-rest-kind':kind,transform:`translate(${x} ${y}) scale(${staffSpace/8})`,role:'img','aria-label':`休符 ${durationTick/4}拍`});
 if(kind==='whole'||kind==='half')group.append(node('rect',{x:-4.5,y:kind==='whole'?-8:-4,width:9,height:4,fill:'currentColor',stroke:'none'}));
 else if(kind==='quarter')group.append(node('path',{d:'M-2-12 4-6 0-1 4 4C-3 1-4 6 0 10C-6 7-6 3-2 1L-6-4-1-9Z',fill:'currentColor',stroke:'none'}));
 else{
  const short=kind==='sixteenth';
  group.append(node('path',{d:short?'M0-8Q4-5 6-12L-1 13M-3-1Q1 2 4-5':'M-2-4Q2-1 5-8L-1 11',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round'}));
  group.append(node('circle',{cx:short?0:-2,cy:short?-8:-4,r:2.4,fill:'currentColor',stroke:'none'}));
  if(short)group.append(node('circle',{cx:-3,cy:-1,r:2.4,fill:'currentColor',stroke:'none'}));
 }
 return group;
}
