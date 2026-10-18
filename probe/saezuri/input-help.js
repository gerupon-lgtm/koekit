export const inputSteps='<ol class="input-rule"><li><strong>① 長さ</strong><span>どれだけ音をのばす？</span></li><li><strong>② 音の高さ</strong><span>ド・レ・ミをえらぶ</span></li><li><strong>③ オッケー</strong><span>音を置いて、次の場所へ</span></li></ol>';
export function createInputHelp(){
 const dialog=document.createElement('dialog');dialog.id='input-help';dialog.setAttribute('aria-labelledby','input-help-title');
 dialog.innerHTML='<div class="screen-heading"><h2 id="input-help-title">音の置き方</h2><button id="input-help-close">とじる</button></div>'+inputSteps+'<p>長さを先にえらび、音の高さを押すと、その音が鳴ります。まだ候補なので、<strong>オッケーで決めよう。</strong>次の音を置く場所へ、自動で進みます。</p><h3>声でも つくれるよ</h3><p>「声 OFF」を押して「声 ON」に。<strong>「声を受け付けています」</strong>と出てから話そう。</p><p class="input-voice-example">「ド いっぱく」 → 候補をたしかめる → 「オッケー」</p><p>音と長さを一緒に言おう。「レ はんぱく」「ミ ふてんいっぱく」「やすみ いっぱく」も使えます。</p><p>聴くときは「きく」か「もういちど」。試聴から戻るときは「とじる」。段階ができたら「つぎ」で進みます。</p><button id="input-help-ready">わかった</button>';
 document.querySelector('main').append(dialog);
 for(const id of ['input-help-close','input-help-ready'])dialog.querySelector('#'+id).onclick=()=>dialog.close();
 return dialog;
}
