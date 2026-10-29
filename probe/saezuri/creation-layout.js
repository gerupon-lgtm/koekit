const $=id=>document.getElementById(id);

// Move only setup controls. The score, keys and their held pointers stay alive.
export class CreationLayout{
 constructor({editor,shell}){
  Object.assign(this,{editor,shell});this.focus=false;this.revision=0;
  this.parts=['phrase-shape','phrase-shape-hint','creation-displays'].map(id=>$(id));this.parts.push(document.querySelector('.editor-voice'));
  this.homes=this.parts.map(node=>{const home=document.createComment('creation layout');node.before(home);return home;});
  this.setup=document.createElement('div');this.setup.id='creation-setup';
  this.setup.innerHTML='<button id="creation-options-toggle" aria-expanded="false" aria-controls="creation-options">表示・声 ▾</button><div id="creation-options" hidden></div>';
  $('creation-tabs').after(this.setup);this.toggle=$('creation-options-toggle');this.options=$('creation-options');
  this.toggle.onclick=()=>{this.options.hidden=!this.options.hidden;this.toggle.setAttribute('aria-expanded',String(!this.options.hidden));};
  this.phrase=document.createElement('details');this.phrase.id='phrase-tools';this.phrase.innerHTML='<summary>フレーズをつなげる</summary>';
  this.register=document.querySelector('.phrase-register');this.registerHome=document.createComment('phrase registration');this.register.before(this.registerHome,this.phrase);
 }
 render(){
  const free=this.editor.isOpen&&this.shell.screen==='create'&&!document.body.classList.contains('image-mode')&&!this.shell.learning?.active;
  document.body.classList.toggle('free-creation',free);
  if(free!==this.free){
   this.free=free;
   if(free){this.toggle.before(this.parts[0]);this.options.append(this.parts[2],this.parts[3]);this.setup.append(this.parts[1]);this.phrase.append(this.register);}
   else{this.parts.forEach((node,i)=>{if(this.setup.contains(node))this.homes[i].after(node);});this.registerHome.after(this.register);}
  }
  this.setup.hidden=!free;
  this.phrase.hidden=!free;
  document.body.dataset.editCandidate=String(this.editor.pending);
  const focus=this.shell.screen==='create'&&!this.shell.learning?.active&&(document.body.classList.contains('keyboard-recording')||document.body.classList.contains('keyboard-humming'));
  if(focus&&!this.focus)this.scroll=scrollY;
  document.body.classList.toggle('recording-focus',focus);
  if(focus!==this.focus){
   this.focus=focus;const revision=++this.revision;
   // Let the collapsed layout settle once; never run a second playback clock.
   requestAnimationFrame(()=>{if(revision===this.revision)window.scrollTo({top:focus?0:this.scroll??0,behavior:'instant'});});
  }
 }
}
