// Optional breaks go between phrases, never inside a Japanese action phrase.
const phrases=[
 ['いまと','同じ'],['このフレーズを','編集する'],['つづきを','つくる'],['コピーして','直す'],
 ['この拍の','変更を外す'],['空白のため','無音'],['▶ 曲を','はじめから聴く'],['▶ このコードを','きく'],['▶ このフレーズを','聴く'],['▶ このパーツを','聴く'],['▶ この伴奏を','聴く'],
 ['並びに','入れる'],['オッケー済みを','並びに入れる'],['この並びを','つかう'],['この伴奏を','つかう'],
 ['コードの並びを','変える'],['イメージで','作り直す'],['手直しを外して ','おまかせ'],
 ['伴奏の','鳴らし方'],['伴奏の','鳴らし方','（OFF）'],['もとに','もどす'],
 ['▶ いまを','聴く'],['▶ 候補を','聴く'],['外して','候補をつくる'],
 ['フレーズを','つくる'],['フレーズを','登録'],['このパーツで','曲をつくる'],
 ['イメージから ','つくる'],['ハナウタで ','つくる'],['もうひとつ ','つくる'],
 ['修正中の場所に','もどる'],['ここだけ','直す'],['この修正を','取消'],['場所選びを','取消'],['パーツを','選び直す'],
 ['未保存分を','捨てて','トップへ'],['つづきから ','つくる'],['つくりかけを ','けす'],
 ['もういちど ','ほぞん'],['つくるのを ','つづける'],['ほぞんせず ','やめる'],
 ['自分の曲に','する'],['4小節に','延ばす'],['8小節に','延ばす'],
 ['よくつかうに','登録'],['この枠を','クリア'],['サンプルで','ためす'],['記録を','読み込む'],['おてほんを','聴く'],
 ['この音列を','編集する'],['← 16分','まえ'],['16分','あと →'],['くり返して','8小節'],['4小節にする','候補'],
 ['全体 ','＋1','オクターブ'],['全体 ','−1','オクターブ'],['自動推定に','戻す'],
 ['1オクターブ','上に表示'],['1オクターブ','下に表示'],['全体を','半音上げる'],['全体を','半音下げる'],
 ['変更候補を','作る'],['分割候補を','作る'],['次の音と','結合候補を','作る'],['頭の休符を','詰める'],
 ['仮の変更を','戻す'],['仮の変更を','捨てて','おわる'],['音の置き方・','声の使い方'],['このジャンルを','つかう'],
 ['この場所の','修正をつづける'],['▶ 並びを','聴く'],['おわり：','追加なし'],['ならべた音を','聴く'],['候補を','とりけす'],
 ['今回の','比較設定に','する'],['オッケー・','破棄する'],['おすすめに','戻す'],['これを','アレンジ'],
 ['もういちど ','聴く'],['つくる','画面へ →'],['このきょくを ','けす'],['この名前に','する'],
];
const labels=new Map(phrases.map(chunks=>[chunks.join(''),chunks]));
export function formatActionLabels(root=document){
 for(const node of root.querySelectorAll('button,#progression-title')){
  const chunks=labels.get(node.textContent);if(!chunks||node.querySelector('svg,br,small,input'))continue;
  const existing=[...node.querySelectorAll('.action-label-unit')];
  if(existing.length===chunks.length&&existing.every((n,i)=>n.textContent===chunks[i]))continue;
  const text=document.createElement('span');text.className='action-label';
  chunks.forEach((value,index)=>{if(index)text.append(document.createElement('wbr'));const unit=document.createElement('span');unit.className='action-label-unit';unit.textContent=value;text.append(unit);});
  node.replaceChildren(text);
 }
}
