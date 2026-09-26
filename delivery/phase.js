import { createSpeechInput } from '../src/speech/index.js';
import { publicMethod } from '../src/speech/public-method.js';
// An adapter lives across turns, but every input interval gets its own generation.
export class DeliverySpeech {
  constructor({onText,onState,method,factory,startupTimeoutMs=60000}={}) {Object.assign(this,{onText,onState,method,startupTimeoutMs});this.factory=factory||(()=>createSpeechInput(publicMethod(this.method)));this.generation=0;this.adapter=null;this.handlers={};this.key=null;this.disposed=false;this.failed=false;}
  open(words,context,key) {
    if(this.disposed)return;
    if(this.failed){this.onState('denied');return;}
    if(key===this.key)return;
    this.close();if(!words.length)return;
    this.key=key;const generation=this.generation,valid=()=>this.generation===generation&&!this.disposed;
    try {
      this.adapter ||= this.factory();
      const fail=()=>{if(!valid())return;this.close();this.failed=true;try{this.adapter?.dispose?.()}catch{}this.adapter=null;this.onState('denied');};
      this.handlers={result:(raw,elapsed,eventId)=>{if(valid()&&raw){if(eventId!=null&&eventId===this.lastEvent)return;this.lastEvent=eventId;this.onText(raw,context)}},error:fail,restart:()=>{if(valid())this.onState('restarting')},end:()=>{
        if(!valid())return;this.onState('restarting');clearTimeout(this.restartTimer);
        this.restartTimer=setTimeout(()=>{if(valid()){this.key=null;this.open(words,context,key)}},300);
      }};
      for(const [event,fn]of Object.entries(this.handlers))this.adapter.on(event,fn);
      this.onState('restarting');
      this.startupTimer=setTimeout(fail,this.startupTimeoutMs);
      Promise.resolve(this.adapter.start(words)).then(()=>{if(valid()){clearTimeout(this.startupTimer);this.onState('listening')}}).catch(fail);
    }catch{if(valid()){this.close();this.failed=true;this.onState('denied')}}
  }
  retry(){this.failed=false;this.key=null;}
  close(){this.generation++;this.key=null;this.lastEvent=undefined;clearTimeout(this.restartTimer);clearTimeout(this.startupTimer);for(const [e,f]of Object.entries(this.handlers))this.adapter?.off?.(e,f);this.handlers={};try{this.adapter?.stop()}catch{}this.onState('idle');}
  dispose(){this.close();this.disposed=true;try{this.adapter?.dispose?.()}catch{}this.adapter=null;}
}
