import { SEARCH_CONFIG } from './config.js';
export class SearchClient {
  constructor({workerFactory,timeoutMs=SEARCH_CONFIG.timeoutMs}={}){this.workerFactory=workerFactory??(()=>new Worker(new URL('./search-worker.js',import.meta.url),{type:'module'}));this.timeoutMs=timeoutMs;this.pending=null;this.generation=0;this.disposed=false;}
  run(type,payload,{timeoutMs=this.timeoutMs,signal}={}){
    this.cancel();if(this.disposed||signal?.aborted)return Promise.resolve({status:'cancelled'});
    const id=++this.generation;return new Promise(resolve=>{
      let worker;try{worker=this.workerFactory();}catch{return resolve({status:'error',code:'WORKER_UNAVAILABLE'});}
      let timer;const abort=()=>finish({status:'cancelled'});
      const finish=result=>{if(this.pending?.id!==id)return;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();this.pending=null;resolve(result);};
      this.pending={id,worker,finish};
      worker.onmessage=({data})=>{if(data.id===id)finish(data.result);};
      worker.onerror=()=>finish({status:'error',code:'SEARCH_ERROR'});
      timer=setTimeout(()=>finish({status:'timeout',code:'SEARCH_TIMEOUT'}),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      try{worker.postMessage({id,type,payload});}catch{finish({status:'error',code:'SEARCH_ERROR'});}
    });
  }
  cancel(){this.pending?.finish({status:'cancelled'});this.generation++;}
  dispose(){this.cancel();this.disposed=true;}
}
