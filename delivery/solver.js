import { DIRECTIONS, SEARCH_CONFIG } from './config.js';
import { allPackagesMask, initialRuntime, step, validateStage, validateRuntime } from './rules.js';
export function solve(stage,state=initialRuntime(stage),options={}) {
  const valid=validateStage(stage);if(!valid.ok||!validateRuntime(stage,state))return {status:'invalid',code:valid.code??'INVALID_STATE',minSteps:null,path:[]};
  const now=options.now??(()=>performance.now()),start=now(),timeout=options.timeoutMs??SEARCH_CONFIG.timeoutMs;
  const nodes=[{state:{...state},parent:-1,direction:null}],key=s=>`${s.position}:${s.heldMask}:${s.deliveredMask}`,seen=new Set([key(state)]);
  for(let cursor=0;cursor<nodes.length;cursor++){
    if(options.isCancelled?.())return {status:'cancelled',minSteps:null,path:[]};
    if(now()-start>=timeout)return {status:'timeout',minSteps:null,path:[]};
    const node=nodes[cursor];
    if(node.state.deliveredMask===allPackagesMask(stage)){
      const path=[];for(let i=cursor;nodes[i].parent!==-1;i=nodes[i].parent)path.push(nodes[i].direction);
      path.reverse();return {status:'solved',minSteps:path.length,path,visited:seen.size};
    }
    for(const direction of Object.keys(DIRECTIONS)){
      const result=step(stage,node.state,direction,{ignoreBudget:true});if(result.status==='failed')continue;
      const id=key(result.state);if(seen.has(id))continue;seen.add(id);nodes.push({state:result.state,parent:cursor,direction});
    }
  }
  return {status:'no-solution',minSteps:null,path:[],visited:seen.size};
}
export function hint(stage,state=initialRuntime(stage),options={}) {
  const result=solve(stage,state,options);if(result.status!=='solved')return result;
  let current=state,target=null,kind=null;
  for(const direction of result.path){const next=step(stage,current,direction,{ignoreBudget:true});current=next.state;
    const event=next.events.find(e=>e.type==='pickup'||e.type==='deliver');if(event){target=current.position;kind=event.type;break;}}
  // Full solution stays inside the Worker; hints expose only the requested target and first step.
  return {status:'solved',target,kind,direction:result.path[0]??null,minSteps:result.minSteps,withinBudget:stage.stepLimit==null||result.minSteps<=stage.stepLimit-state.usedSteps};
}
