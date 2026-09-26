import { solve, hint } from './solver.js';
import { generate } from './generator.js';
self.onmessage=({data})=>{
  const {id,type,payload}=data;
  try{
    let result;
    if(type==='solve')result=solve(payload.stage,payload.runtime,payload.options);
    else if(type==='hint')result=hint(payload.stage,payload.runtime,payload.options);
    else if(type==='generate')result=generate(payload.seed,payload.level,payload.options);
    else result={status:'error',code:'INVALID_SEARCH'};
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,result:{status:error.code==='SEARCH_TIMEOUT'?'timeout':'error',code:error.code??'SEARCH_ERROR'}});}
};
