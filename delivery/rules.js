import { DIRECTIONS } from './config.js';
export const bitCount = mask => {let n=0;for(let m=mask;m;m&=m-1)n++;return n;};
export const allPackagesMask = stage => (1<<stage.packages.length)-1;
export function validateStage(stage,{draft=false}={}) {
  const fail=code=>({ok:false,code});
  if(!stage || ![3,5,7,9].includes(stage.size) || !Array.isArray(stage.blocked) || !Array.isArray(stage.packages))return fail('INVALID_STAGE');
  const validCell=c=>Number.isInteger(c)&&c>=0&&c<stage.size**2;
  if(stage.blocked.some(c=>!validCell(c))||new Set(stage.blocked).size!==stage.blocked.length)return fail('INVALID_CELL');
  if(stage.packages.length>4||stage.packages.some(p=>!p||typeof p.id!=='string'||!validCell(p.cell))||new Set(stage.packages.map(p=>p.id)).size!==stage.packages.length)return fail('INVALID_PACKAGES');
  const positions=[stage.start,stage.destination,...stage.packages.map(p=>p.cell)].filter(c=>c!=null);
  if(positions.some(c=>!validCell(c)||stage.blocked.includes(c))||new Set(positions).size!==positions.length)return fail('OVERLAPPING_CELLS');
  if(!draft&&(stage.start==null||stage.destination==null||stage.packages.length<1))return fail('INCOMPLETE');
  if(stage.stepLimit!=null&&(!Number.isInteger(stage.stepLimit)||stage.stepLimit<0))return fail('INVALID_STEP_LIMIT');
  return {ok:true};
}
export const initialRuntime = stage => ({position:stage.start,heldMask:0,deliveredMask:0,usedSteps:0});
export function validateRuntime(stage,state) {
  const mask=allPackagesMask(stage);
  return !!state&&Number.isInteger(state.position)&&state.position>=0&&state.position<stage.size**2&&!stage.blocked.includes(state.position)&&Number.isSafeInteger(state.usedSteps)&&state.usedSteps>=0&&Number.isInteger(state.heldMask)&&Number.isInteger(state.deliveredMask)&&state.heldMask>=0&&state.deliveredMask>=0&&state.heldMask<=mask&&state.deliveredMask<=mask&&((state.heldMask|state.deliveredMask)&~mask)===0&&(state.heldMask&state.deliveredMask)===0&&bitCount(state.heldMask)<=2;
}
export function step(stage,state,direction,{ignoreBudget=false}={}) {
  const fail=code=>({state:{...state},events:[],status:'failed',code});
  if(!DIRECTIONS[direction]||!validateRuntime(stage,state))return fail('INVALID_STATE');
  if(state.deliveredMask===allPackagesMask(stage))return {state:{...state},events:[],status:'cleared'};
  if(!ignoreBudget&&stage.stepLimit!=null&&state.usedSteps>=stage.stepLimit)return fail('STEP_LIMIT');
  const [dr,dc]=DIRECTIONS[direction],row=Math.floor(state.position/stage.size)+dr,col=state.position%stage.size+dc;
  if(row<0||col<0||row>=stage.size||col>=stage.size)return fail('OUT_OF_BOUNDS');
  const position=row*stage.size+col;if(stage.blocked.includes(position))return fail('BLOCKED');
  const next={...state,position,usedSteps:state.usedSteps+1},events=[{type:'move',direction,from:state.position,to:position}];
  stage.packages.forEach((p,i)=>{const bit=1<<i;if(p.cell!==position||((next.heldMask|next.deliveredMask)&bit))return;
    if(bitCount(next.heldMask)<2){next.heldMask|=bit;events.push({type:'pickup',packageId:p.id,index:i,cell:position});}
    else events.push({type:'full',cell:position});
  });
  if(position===stage.destination&&next.heldMask){const mask=next.heldMask;next.deliveredMask|=mask;next.heldMask=0;events.push({type:'deliver',mask,count:bitCount(mask),cell:position});}
  if(next.deliveredMask===allPackagesMask(stage)){events.push({type:'clear'});return {state:next,events,status:'cleared'};}
  return {state:next,events,status:'moved'};
}
