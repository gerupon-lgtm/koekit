import assert from 'node:assert/strict';
import {TEMPLATES,findTemplate,matchesTemplate} from '../irodori/templates.js';
assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,14);
for(const t of TEMPLATES){assert.equal(t.cells.length,t.size*t.size);assert(t.cells.every(c=>c===null||Number.isInteger(c)&&c>=0&&c<=11));assert(t.cells.some(c=>c!==null));assert.equal(findTemplate(t.id,t.size),t);assert(matchesTemplate(t.cells.slice(),t));const wrong=t.cells.slice();const i=wrong.findIndex(c=>c!==null);wrong[i]=null;assert(!matchesTemplate(wrong,t));assert(!matchesTemplate(t.cells.slice(1),t));}
assert.equal(findTemplate('missing',9),null);assert.equal(findTemplate('heart-5',9),null);assert(!matchesTemplate([],null));
console.log('PASS 14 immutable templates, dimensions/colors, exact match, missing/mismatched template fallback');

// 新規選択から旧題材を外しても、保存済み作品の参照は失わない。
assert(!TEMPLATES.some(t=>t.id==='one-3'));
assert.equal(findTemplate('one-3',3).name,'すうじの 1');
assert.equal(findTemplate('one-3',5),null);
assert(TEMPLATES.some(t=>t.id==='signal-3'));
const {HEART_RECIPE}=await import('../irodori/recipes.js');
assert.equal(HEART_RECIPE.length,5);
let painted=Array(25).fill(null);
for(const step of HEART_RECIPE){
 assert(Object.isFrozen(step.snapshot));
 for(const i of step.cells){assert(i>=0&&i<25);painted[i]=0;}
 assert.deepEqual(step.snapshot,painted);
}
assert.deepEqual(painted,findTemplate('heart-5',5).cells);
console.log('PASS legacy saved template compatibility and five-step heart recipe');

assert.deepEqual(findTemplate('signal-3',3).cells,[11,11,11,4,2,0,11,11,11]);
