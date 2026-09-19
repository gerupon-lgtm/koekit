import assert from 'node:assert/strict';
import {TEMPLATES,findTemplate,matchesTemplate} from '../irodori/templates.js';
assert.equal(new Set(TEMPLATES.map(t=>t.id)).size,12);
for(const t of TEMPLATES){assert.equal(t.cells.length,t.size*t.size);assert(t.cells.every(c=>c===null||Number.isInteger(c)&&c>=0&&c<=11));assert(t.cells.some(c=>c!==null));assert.equal(findTemplate(t.id,t.size),t);assert(matchesTemplate(t.cells.slice(),t));const wrong=t.cells.slice();const i=wrong.findIndex(c=>c!==null);wrong[i]=null;assert(!matchesTemplate(wrong,t));assert(!matchesTemplate(t.cells.slice(1),t));}
assert.equal(findTemplate('missing',9),null);assert.equal(findTemplate('heart-5',9),null);assert(!matchesTemplate([],null));
console.log('PASS 12 immutable templates, dimensions/colors, exact match, missing/mismatched template fallback');
