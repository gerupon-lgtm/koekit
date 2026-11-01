// Keep the visible screen awake only while the audio workflow is active.
// A denied/revoked lock never prevents playback or starts a retry loop.
export class PlaybackScreenLock{
 constructor({navigator=globalThis.navigator,document=globalThis.document,window=globalThis.window,onChange=()=>{}}={}){
  Object.assign(this,{navigator,document,onChange});this.active=false;this.status='idle';this.revision=0;this.lock=null;this.pending=false;
  document?.addEventListener('visibilitychange',()=>{this.revision++;if(document.hidden){this.release();if(this.active)this.publish('hidden');}else this.ensure();});
  window?.addEventListener('pagehide',()=>this.setActive(false));
 }
 publish(status){this.status=status;this.onChange({status,active:this.active,supported:typeof this.navigator?.wakeLock?.request==='function'});}
 setActive(active){if(this.active===active)return;this.active=active;this.revision++;if(active)this.ensure();else{this.release();this.publish('idle');}}
 release(){const lock=this.lock;this.lock=null;if(lock)try{Promise.resolve(lock.release()).catch(()=>{});}catch{}}
 async ensure(){
  if(!this.active||this.document?.hidden||this.lock||this.pending)return;
  if(typeof this.navigator?.wakeLock?.request!=='function'){this.publish('unsupported');return;}
  const revision=this.revision;this.pending=true;this.publish('requesting');
  try{
   const lock=await this.navigator.wakeLock.request('screen');
   if(!this.active||this.document?.hidden||revision!==this.revision){await lock.release();return;}
   this.lock=lock;lock.addEventListener('release',()=>{if(this.lock!==lock)return;this.lock=null;if(this.active)this.publish('released');});this.publish('held');
  }catch{if(this.active&&revision===this.revision)this.publish('unavailable');}
  finally{this.pending=false;if(this.active&&revision!==this.revision&&!this.document?.hidden)this.ensure();}
 }
}
