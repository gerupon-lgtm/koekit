// One number identifies one sounding note, including tied staff fragments.
// Numbers follow musical time; editing/deleting notes can change the numbering.
export const orderedNotes = notes => [...notes].sort((a,b)=>a.startTick-b.startTick);
export function selectionTarget(notes, selectedId, command) {
  const ordered=orderedNotes(notes);
  if(!ordered.length) return null;
  const index=ordered.findIndex(note=>note.id===selectedId);
  if(command==='first') return ordered[0].id;
  if(command==='last') return ordered.at(-1).id;
  if(command==='next' || command==='previous') return ordered[Math.max(0,Math.min(ordered.length-1,index+(command==='next'?1:-1)))].id;
  if(/^select:[1-9]\d*$/.test(command)) return ordered[Number(command.slice(7))-1]?.id ?? null;
  return null;
}
