export function songLibraryView(record){
 const data=record.data??{},patterns=Array.isArray(data.sequence?.patterns)?data.sequence.patterns:[],placements=Array.isArray(data.sequence?.placements)?data.sequence.placements:[];
 const parts=Array.isArray(data.project?.parts)?data.project.parts:[...patterns.map(pattern=>({patternId:pattern?.id})),...(data.checkpoint?[{checkpoint:data.checkpoint}]:[])];
 const draftCount=parts.filter(part=>part?.checkpoint?.draft).length;
 return {partCount:parts.length,placementCount:placements.length,draftCount,
  summary:`並び ${placements.length}こ・パーツ ${parts.length}こ${draftCount?`（つくりかけ ${draftCount}こ）`:''}`,
  listenLabel:placements.length?'▶ 曲の並び':'▶ パーツ',
  listenAria:placements.length?`${record.title}のオッケー済みの並びを聴く`:`${record.title}のパーツを選んで聴く`};
}
