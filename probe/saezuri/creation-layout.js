const $=id=>document.getElementById(id);

// Reuse the existing controls and audio handlers when changing the layout.
export class CreationLayout{
 constructor({editor,shell,keyboard}){
  Object.assign(this,{editor,shell,keyboard});this.focus=false;this.revision=0;
  this.parts=['phrase-shape','phrase-shape-hint','creation-displays'].map(id=>$(id));this.parts.push(document.querySelector('.editor-voice'));
  this.homes=this.parts.map(node=>{const home=document.createComment('creation layout');node.before(home);return home;});
  this.setup=document.createElement('div');this.setup.id='creation-setup';
  this.setup.innerHTML='<button id="creation-options-toggle" aria-expanded="false" aria-controls="creation-options">表示・声 ▾</button><div id="creation-options" hidden></div>';
  $('creation-tabs').after(this.setup);this.toggle=$('creation-options-toggle');this.options=$('creation-options');
  this.toggle.onclick=()=>{this.options.hidden=!this.options.hidden;this.toggle.setAttribute('aria-expanded',String(!this.options.hidden));};
  this.phrase=document.createElement('details');this.phrase.id='phrase-tools';this.phrase.innerHTML='<summary>フレーズをつなげる</summary>';
  this.register=document.querySelector('.phrase-register');this.registerHome=document.createComment('phrase registration');this.register.before(this.registerHome,this.phrase);
  this.panel=$('live-keyboard');this.panelHome=document.createComment('keyboard workspace');this.panel.before(this.panelHome);
  this.instrument=$('keyboard-instrument');this.instrumentHome=document.createComment('front instrument');this.instrument.before(this.instrumentHome);
  this.keyboardOptions=$('keyboard-options');this.keyboardOptionsHome=document.createComment('keyboard settings');this.keyboardOptions.before(this.keyboardOptionsHome);
  this.performance=document.createElement('details');this.performance.id='keyboard-practice-tools';this.performance.innerHTML='<summary>鍵盤で れんしゅう・録音</summary>';this.panel.before(this.performance);
  this.performance.addEventListener('toggle',()=>{if(!this.performance.open&&!this.focus)this.keyboard.release();});
 }
 render(){
  const scrollBefore=scrollY;
  const free=this.editor.isOpen&&this.shell.screen==='create'&&!document.body.classList.contains('image-mode')&&!this.shell.learning?.active;
  document.body.classList.toggle('free-creation',free);
  if(free!==this.free){
   this.free=free;
   if(free){this.toggle.before(this.parts[0]);this.options.append(this.parts[2],this.parts[3]);this.setup.append(this.parts[1]);this.phrase.append(this.register);}
   else{this.parts.forEach((node,i)=>{if(this.setup.contains(node))this.homes[i].after(node);});this.registerHome.after(this.register);}
  }
  // Card input keeps pitch, duration and OK together. Secondary controls stay
  // behind the existing display/settings button, with their original handlers.
  this.cardNodes??=['composer-help','composer-other-lengths','composer-candidate','capture-edit-status'].map(id=>$(id));
  this.cardHomes??=this.cardNodes.map(node=>{const anchor=document.createComment('card input layout');node.before(anchor);return anchor;});
  this.listenHome??=(()=>{const anchor=document.createComment('listen actions');document.querySelector('.listen-actions').before(anchor);return anchor;})();
  const cards=free&&this.shell.mode==='input'&&document.body.dataset.inputDisplay==='cards';
  if(cards!==this.cards){this.cards=cards;const listen=document.querySelector('.listen-actions');
   if(cards){this.options.append(this.cardNodes[0],this.cardNodes[1]);$('composer-panel').append(this.cardNodes[2],listen,this.cardNodes[3]);}
   else{this.cardNodes.forEach((node,i)=>this.cardHomes[i].after(node));this.listenHome.after(listen);}
  }
  this.setup.hidden=!free;
  this.phrase.hidden=!free;
  document.body.dataset.editCandidate=String(this.editor.pending);
  document.body.dataset.hasMelody=String(!!this.editor.previewPattern?.notes.length);
  const focus=this.shell.screen==='create'&&!this.shell.learning?.active&&(document.body.classList.contains('keyboard-recording')||document.body.classList.contains('keyboard-humming'));
  const fold=free&&(this.shell.mode!=='input'||document.body.dataset.inputDisplay==='cards'),context=`${free}:${this.shell.mode}:${this.shell.mode==='input'?document.body.dataset.inputDisplay:''}`;
  if(fold!==this.fold){
   this.fold=fold;
   if(fold){this.performance.append(this.panel);document.querySelector('.listen-actions').before(this.instrument);}
   else{this.panelHome.after(this.panel);this.instrumentHome.after(this.instrument);}
  }
  if(fold&&this.shell.mode!=='input'){if(this.keyboardOptions.parentNode!==this.performance)this.performance.append(this.keyboardOptions);}
  else if(this.performance.contains(this.keyboardOptions))this.keyboardOptionsHome.after(this.keyboardOptions);
  if(cards){if(this.instrument.parentNode!==this.options)this.options.append(this.instrument);}
  else if(fold){if(this.instrument.parentNode!==document.querySelector('.edit-toolbar'))document.querySelector('.listen-actions').before(this.instrument);}
  else if(this.instrument.parentNode!==this.instrumentHome.parentNode)this.instrumentHome.after(this.instrument);
  this.performance.hidden=!fold;
  if(fold&&context!==this.toolContext&&!focus){this.performance.open=false;this.keyboard.release();}
  this.toolContext=context;
  if(fold&&focus){if(!this.focus)this.performanceWasOpen=this.performance.open;this.performance.open=true;}
  else if(fold&&this.focus)this.performance.open=!!this.performanceWasOpen;
  if(focus&&!this.focus)this.scroll=scrollBefore;
  document.body.classList.toggle('recording-focus',focus);
  if(focus!==this.focus){
   this.focus=focus;const revision=++this.revision;
   // Let the collapsed layout settle once; never run a second playback clock.
   requestAnimationFrame(()=>{if(revision===this.revision)window.scrollTo({top:focus?0:this.scroll??0,behavior:'instant'});});
  }
 }
}
