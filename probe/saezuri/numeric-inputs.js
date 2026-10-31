// Select once on entry; a second tap keeps the browser's normal caret editing.
const bindings=new WeakMap();
export function bindNumericSelectAll(root=document){
 if(bindings.has(root))return bindings.get(root);
 const timers=new Map(),view=root.ownerDocument?.defaultView??root.defaultView??window;
 const cancel=input=>{clearTimeout(timers.get(input));timers.delete(input);};
 const cancelAll=()=>{for(const input of timers.keys())cancel(input);};
 const numeric=input=>input?.matches?.('input[type="number"]')&&!input.readOnly&&!input.disabled;
 const focus=event=>{const input=event.target;if(!numeric(input))return;cancel(input);const value=input.value;
  timers.set(input,setTimeout(()=>{timers.delete(input);if(input.isConnected&&input.ownerDocument.activeElement===input&&numeric(input)&&input.value===value&&input.getClientRects().length)input.select();},50));
 };
 const cancelEvent=event=>cancel(event.target);
 const pointer=event=>{if(event.target===event.target.ownerDocument?.activeElement)cancel(event.target);};
 const visibility=()=>{if(root.hidden)cancelAll();};
 const events=[['focusin',focus],['focusout',cancelEvent],['beforeinput',cancelEvent],['input',cancelEvent],['compositionstart',cancelEvent],['keydown',cancelEvent],['pointerdown',pointer],['close',cancelAll],['visibilitychange',visibility]];
 for(const [name,handler] of events)root.addEventListener(name,handler,true);
 view.addEventListener('blur',cancelAll);view.addEventListener('pagehide',cancelAll);
 const dispose=()=>{cancelAll();for(const [name,handler] of events)root.removeEventListener(name,handler,true);view.removeEventListener('blur',cancelAll);view.removeEventListener('pagehide',cancelAll);bindings.delete(root);};
 bindings.set(root,dispose);return dispose;
}
