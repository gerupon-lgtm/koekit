// 手描きのドット見本。色番号はpalette.jsと同じ。IDは保存作品の参照に使うため変更しない。
export const CATEGORIES = { everyday: 'みぢかなもの', shapes: 'かたち', letters: 'もじ・すうじ', characters: 'キャラクター' };
const definitions = [
 ['flower-3', 'ちいさな はな', 'everyday', ['.5.','525','.4.']],
 ['plus-3', 'ぷらす', 'shapes', ['.6.','666','.6.']],
 ['signal-3', 'しんごう', 'everyday', ['BBB','420','BBB']],
 ['heart-5', 'はーと', 'shapes', ['.0.0.','00000','00000','.000.','..0..']],
 ['tree-5', 'き', 'everyday', ['..4..','.444.','44444','..9..','..9..']],
 ['letter-a-5', 'もじの A', 'letters', ['.666.','6...6','66666','6...6','6...6']],
 ['house-7', 'おうち', 'everyday', ['...0...','..000..','.00000.','0000000','.22222.','.22622.','.22622.']],
 ['fish-7', 'おさかな', 'everyday', ['..6....','.666.6.','6666666','66B6666','6666666','.666.6.','..6....']],
 ['star-7', 'ほし', 'shapes', ['...2...','..222..','2222222','.22222.','.22222.','.22.22.','.2...2.']],
 ['flare-9', 'ほしの とり フレア', 'characters', ['....7....','6..777..6','6.77777.6','627272726','622272226','662222266','.6622266.','..6.2.6..','....2....']],
 ['cat-9', 'ねこ', 'everyday', ['..9...9..','.999.999.','999999999','99B999B99','999959999','999BBB999','.9999999.','..99999..','.........']],
 ['rocket-9', 'ろけっと', 'everyday', ['....0....','...000...','...666...','...6A6...','...666...','..06660..','.0066600.','...727...','....2....']],
 ['eight-9', 'すうじの 8', 'letters', ['..33333..','..3...3..','..3...3..','..3...3..','..33333..','..3...3..','..3...3..','..3...3..','..33333..']],
];
export const TEMPLATES = Object.freeze(definitions.map(([id, name, category, rows]) => {
 const size = rows.length;
 if (![3,5,7,9].includes(size) || rows.some(r => r.length !== size || /[^.0-9AB]/.test(r))) throw Error('Invalid template: '+id);
 return Object.freeze({ id, name, category, size, cells: Object.freeze(rows.join('').split('').map(c => c === '.' ? null : parseInt(c, 12))) });
}));
// 旧「1」は新規選択から除外するが、保存済み作品の下絵参照は維持する。
const LEGACY_ONE=Object.freeze({id:'one-3',name:'すうじの 1',category:'letters',size:3,cells:Object.freeze([null,2,null,null,2,null,2,2,2])});
export function findTemplate(id, size) { return TEMPLATES.find(t => t.id === id && t.size === size) || (id === LEGACY_ONE.id && size === 3 ? LEGACY_ONE : null); }
export function matchesTemplate(cells, template) { return !!template && cells.length === template.cells.length && cells.every((c,i) => c === template.cells[i]); }
