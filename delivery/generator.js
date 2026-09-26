import { LEVELS, SEARCH_CONFIG } from './config.js';
import { solve } from './solver.js';
export const GENERATOR_VERSION = 1;
export function seededRandom(seed){let value=typeof seed==='number'?seed>>>0:[...String(seed)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);return ()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(array,rng){const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function neighbors(cell,size){const row=Math.floor(cell/size),col=cell%size;return [[row-1,col],[row+1,col],[row,col-1],[row,col+1]].filter(([r,c])=>r>=0&&c>=0&&r<size&&c<size).map(([r,c])=>r*size+c);}
function pathBetween(stage,target,removed=null){const queue=[stage.start],parents=new Map([[stage.start,null]]);for(let i=0;i<queue.length;i++){
  const cell=queue[i];if(cell===target){const path=[];for(let c=cell;c!=null;c=parents.get(c))path.push(c);return path.reverse();}
  for(const next of neighbors(cell,stage.size)){if(stage.blocked.includes(next)||parents.has(next)||(removed&&((cell===removed[0]&&next===removed[1])||(cell===removed[1]&&next===removed[0]))))continue;parents.set(next,cell);queue.push(next);}}
  return null;
}
export function hasMultipleRelevantRoutes(stage){for(const target of [stage.destination,...stage.packages.map(p=>p.cell)]){const path=pathBetween(stage,target);if(!path)continue;for(let i=1;i<path.length;i++)if(pathBetween(stage,target,[path[i-1],path[i]]))return true;}return false;}
function uniqueCorridor(size,rng){const start=Math.floor(rng()*size**2),path=[start],visited=new Set(path);function dfs(){
  if(path.length>=4)return true;
  for(const next of shuffle(neighbors(path.at(-1),size),rng)){
    if(visited.has(next)||neighbors(next,size).filter(c=>visited.has(c)).length!==1)continue;
    path.push(next);visited.add(next);if(dfs())return true;path.pop();visited.delete(next);
  }return false;}
  return dfs()?path:null;
}
function maze(size,rng){const open=new Set([0]),rooms=new Set([0]),stack=[0];while(stack.length){const cell=stack.at(-1),r=Math.floor(cell/size),c=cell%size;
  const candidates=shuffle([[r-2,c],[r+2,c],[r,c-2],[r,c+2]].filter(([r,c])=>r>=0&&c>=0&&r<size&&c<size).map(([r,c])=>r*size+c).filter(n=>!rooms.has(n)),rng);
  if(!candidates.length){stack.pop();continue;}const next=candidates[0];rooms.add(next);open.add(next);open.add((next+cell)/2);stack.push(next);
  }
  const connectors=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++){const cell=r*size+c;if(open.has(cell))continue;if((r%2===0&&c%2===1)||(r%2===1&&c%2===0))connectors.push(cell);}
  const extra=shuffle(connectors,rng).slice(0,Math.max(1,Math.ceil(size/3)));extra.forEach(c=>open.add(c));return [...open];
}
export function generate(seed,level,options={}) {
  const config=typeof level==='object'?level:LEVELS.find(l=>l.id===Number(level));if(!config)throw Object.assign(new Error('INVALID_LEVEL'),{code:'INVALID_LEVEL'});
  const rng=seededRandom(seed),started=performance.now(),attempts=options.generationAttempts??SEARCH_CONFIG.generationAttempts,timeout=options.timeoutMs??SEARCH_CONFIG.timeoutMs;
  for(let attempt=0;attempt<attempts;attempt++){
    if(options.isCancelled?.())throw Object.assign(new Error('CANCELLED'),{code:'CANCELLED'});
    if(performance.now()-started>=timeout)throw Object.assign(new Error('SEARCH_TIMEOUT'),{code:'SEARCH_TIMEOUT'});
    const cells=config.multipleRoutes?shuffle(maze(config.size,rng),rng):uniqueCorridor(config.size,rng);if(!cells||cells.length<config.packageCount+2)continue;
    const start=cells[0],destination=config.multipleRoutes?cells[1]:cells.at(-1),packageCells=config.multipleRoutes?cells.slice(2,2+config.packageCount):[cells[Math.floor(cells.length/2)]];
    const open=new Set(cells),stage={id:`generated-${seed}-${config.id}`,revision:1,size:config.size,blocked:Array.from({length:config.size**2},(_,i)=>i).filter(i=>!open.has(i)),start,destination,packages:packageCells.map((cell,i)=>({id:`package-${i}`,cell})),stepLimit:null,seed,generatorVersion:GENERATOR_VERSION};
    if(hasMultipleRelevantRoutes(stage)!==config.multipleRoutes)continue;
    const result=solve(stage,undefined,{timeoutMs:Math.max(0,timeout-(performance.now()-started)),isCancelled:options.isCancelled});
    if(result.status==='timeout')throw Object.assign(new Error('SEARCH_TIMEOUT'),{code:'SEARCH_TIMEOUT'});
    if(result.status==='cancelled')throw Object.assign(new Error('CANCELLED'),{code:'CANCELLED'});
    if(result.status!=='solved')continue;
    const margin=options.difficulty==='hard'?(options.hardMargin??SEARCH_CONFIG.hardMargin):(options.easyMargin??SEARCH_CONFIG.easyMargin);
    stage.minSteps=result.minSteps;stage.stepLimit=result.minSteps+Math.ceil(result.minSteps*margin);return stage;
  }
  throw Object.assign(new Error('GENERATION_FAILED'),{code:'GENERATION_FAILED'});
}
