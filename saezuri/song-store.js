export const SONG_LIMIT=10;
export const SONG_DATABASE='koekit-saezuri';
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const issue=code=>Object.assign(new Error(code),{code});

export class SongStore {
 constructor({database=SONG_DATABASE,limit=SONG_LIMIT}={}){this.database=database;this.limit=limit;}
 async open(){
  if(this.connection)return this.connection;
  if(!globalThis.indexedDB)throw issue('STORAGE_UNAVAILABLE');
  this.connection=new Promise((resolve,reject)=>{
   const req=indexedDB.open(this.database,1);
   req.onupgradeneeded=()=>{
    req.result.createObjectStore('songs',{keyPath:'id'});
    req.result.createObjectStore('deleted',{keyPath:'id'});
   };
   req.onerror=()=>{this.connection=null;reject(req.error);};
   req.onblocked=()=>{this.connection=null;reject(issue('STORAGE_BLOCKED'));};
   req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();this.connection=null;};resolve(db);};
  });return this.connection;
 }
 async read(action,mode='readonly'){
  const db=await this.open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['songs','deleted'],mode);let value,failure;
   tx.oncomplete=()=>resolve(value);
   tx.onabort=()=>reject(failure??tx.error??issue('STORAGE_FAILED'));
   tx.onerror=()=>{};
   Promise.resolve().then(()=>action(tx.objectStore('songs'),tx.objectStore('deleted'))).then(result=>{value=result;},error=>{failure=error;try{tx.abort();}catch{reject(error);}});
  });
 }
 list(){return this.read(async songs=>(await request(songs.getAll())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));}
 get(id){return this.read(songs=>request(songs.get(id)));}
 duplicate(id,expectedRevision){return this.read(async(songs,deleted)=>{
  const source=await request(songs.get(id));
  if(!source)throw issue('SONG_DELETED');if(source.revision!==expectedRevision)throw issue('SONG_CONFLICT');if(source.schemaVersion!==1)throw issue('SONG_SCHEMA');
  if(await request(songs.count())>=this.limit)throw issue('SONG_LIMIT');
  const title=`${source.title.slice(0,18)} のコピー`,now=new Date().toISOString();
  const record={...structuredClone(source),id:crypto.randomUUID(),title,revision:1,createdAt:now,updatedAt:now};record.data.title=title;
  await request(songs.add(record));return record;
 },'readwrite');}
 save(id,payload,expectedRevision=null){
  return this.read(async(songs,deleted)=>{
   const [previous,tombstone,count]=await Promise.all([request(songs.get(id)),request(deleted.get(id)),request(songs.count())]);
   if(tombstone || (expectedRevision!==null&&!previous))throw issue('SONG_DELETED');
   if(previous&&previous.schemaVersion!==1)throw issue('SONG_SCHEMA');
   if((previous?.revision??null)!==expectedRevision)throw issue('SONG_CONFLICT');
   if(!previous && count>=this.limit)throw issue('SONG_LIMIT');
   const now=new Date().toISOString();
   let title=String(payload.title??'').trim().slice(0,24)||previous?.title;
   if(!title){const used=new Set((await request(songs.getAll())).map(s=>s.title));let number=1;while(used.has(`わたしのきょく ${number}`))number++;title=`わたしのきょく ${number}`;}
   const record={id,schemaVersion:1,title,revision:(previous?.revision??0)+1,
    createdAt:previous?.createdAt??now,updatedAt:now,data:{...structuredClone(payload),title}};
   await request(songs.put(record));return record;
  },'readwrite');
 }
 remove(id,expectedRevision){return this.read(async(songs,deleted)=>{
  const previous=await request(songs.get(id));
  if(!previous)return;
  if(previous.revision!==expectedRevision)throw issue('SONG_CONFLICT');
  await request(deleted.put({id,deletedAt:new Date().toISOString()}));await request(songs.delete(id));
 },'readwrite');}
}
