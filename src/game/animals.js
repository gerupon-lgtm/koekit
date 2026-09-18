// 動物画像のマニフェスト（assets/animals/ に置いたファイル名を列挙）。
// 静的ホスティングでディレクトリ一覧は取れないため、ここに列挙する。増減したらこの配列を更新する。
export const ANIMAL_FILES = [
  'Lion.png', 'dog.png', 'elephant.png', 'giraffe.png', 'monaka.png',
  'monkey.png', 'panda.png', 'pingu.png', 'rabbit.png', 'tabi1.png', 'tabi2.png',
];

/** ファイル名 → 画像URL（/koekit/ 配下でも import.meta.url 基準で正しく解決）。 */
export function animalUrl(file) {
  return new URL('../../assets/animals/' + file, import.meta.url).href;
}

/** カード等に差し込む <img> を作る（縦横比維持は CSS .card .front img で担保）。 */
export function animalImg(file) {
  const img = document.createElement('img');
  img.src = animalUrl(file);
  img.alt = '';
  img.decoding = 'async';
  return img;
}
