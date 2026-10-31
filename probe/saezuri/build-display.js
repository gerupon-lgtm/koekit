// Cache identifiers stay UTC; only the visible build time is presented in JST.
export function formatBuildTime(build){
 const digits=String(build).match(/-(\d{14})(?:-|$)/)?.[1];
 if(!digits)return 'ローカル版';
 const instant=new Date(`${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}T${digits.slice(8,10)}:${digits.slice(10,12)}:${digits.slice(12,14)}Z`);
 if(!Number.isFinite(instant.getTime()))return 'ローカル版';
 const parts=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${value.year}/${value.month}/${value.day} ${value.hour}:${value.minute}:${value.second} JST`;
}
