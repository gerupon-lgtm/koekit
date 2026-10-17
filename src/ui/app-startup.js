// Keep the initial menu measurable while hiding unfinished controls from view.
(() => {
  const root=document.documentElement;
  let loaded=document.readyState==='complete',queued=false,finished=false,failed=false;
  const fail=()=>{if(finished)return;failed=true;clearTimeout(timeout);observer.disconnect();root.classList.add('app-startup-failed');};
  const check=()=>{
    const screen=document.getElementById('app-startup');
    if(!loaded||queued||finished||failed||!screen||!document.querySelector(screen.dataset.ready))return;
    queued=true;
    Promise.resolve(document.fonts?.ready).catch(()=>{}).then(()=>requestAnimationFrame(()=>{
      if(failed)return;
      finished=true;clearTimeout(timeout);observer.disconnect();
      screen.hidden=true;root.classList.remove('app-starting','app-startup-failed');root.dataset.appStartup='ready';
    }));
  };
  const observer=new MutationObserver(check);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-app-ui-ready']});
  // Slow connections offer retry, but can still finish without a reload.
  const timeout=setTimeout(()=>root.classList.add('app-startup-failed'),15000);
  addEventListener('error',event=>{if(event.error||event.target instanceof HTMLScriptElement)fail();},true);
  addEventListener('load',()=>{loaded=true;check();},{once:true});
  check();
})();
