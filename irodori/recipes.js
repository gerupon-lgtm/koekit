import {lineCells,rectCells} from './board.js';
// ハートを5回の確定で描く作例。表示をめくっても制作中の作品は変更しない。
const steps = [
 { title:'B1から B4へ あかい せん', words:['びー いち から','びー よん','せん','あか','オッケー'], tip:'Bは「びー」。ばしょと いろを みてから オッケー。', cells:lineCells(5,{row:0,col:1},{row:3,col:1}) },
 { title:'D1から D4へ せん', words:['でー いち から','でー よん','せん','オッケー'], tip:'Dは「でー」。いろは あかのまま。もういちど「せん」と いうよ。', cells:lineCells(5,{row:0,col:3},{row:3,col:3}) },
 { title:'A2から E3の はんい', words:['えい に から','いー さん','オッケー'], tip:'Aは「えい」、Eは「いー」。「せん」は いわず、しかくく ぬろう。', cells:rectCells(5,{row:1,col:0},{row:2,col:4}) },
 { title:'C4を ぬろう', words:['しー よん','オッケー'], tip:'Cは「しー」。まんなかの すきまを ひとマス ぬろう。', cells:[17] },
 { title:'ひとつ したを ぬろう', words:['した','オッケー'], tip:'C4から ひとつ したの C5へ。いどうの ことばも つかえるよ。', cells:[22] },
];
let cells=Array(25).fill(null);
export const HEART_RECIPE=Object.freeze(steps.map(step=>{cells=cells.slice();step.cells.forEach(i=>{cells[i]=0});return Object.freeze({...step,words:Object.freeze(step.words),cells:Object.freeze(step.cells),snapshot:Object.freeze(cells)});}));
