const NUMBERS={いち:1,一:1,に:2,二:2,さん:3,三:3,よん:4,し:4,四:4,ご:5,五:5,ろく:6,六:6,なな:7,しち:7,七:7,はち:8,八:8,きゅう:9,く:9,九:9,じゅう:10,十:10};
const DIRECTION_WORDS={うえ:'up',上:'up',した:'down',下:'down',ひだり:'left',左:'left',みぎ:'right',右:'right'};
const SIMPLE={もどす:'undo',戻す:'undo',やりなおし:'reset',やり直し:'reset',ヒント:'hint',ひんと:'hint',おわり:'end',終わり:'end',スタート:'retry',すたーと:'retry',オッケー:'confirm',おっけー:'confirm',オーケー:'confirm',おーけー:'confirm',つぎ:'next',次:'next'};
const normalized=raw=>String(raw??'').normalize('NFKC').replace(/[\s、。,.!！?？]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const number=word=>{
  if(/^\d+$/.test(word))return Number(word);
  if(NUMBERS[word]!=null)return NUMBERS[word];
  const hundred=word.match(/^(.*?)(?:ひゃく|百)(.*?)$/);
  if(hundred){const hundreds=hundred[1]===''?1:NUMBERS[hundred[1]],rest=hundred[2]===''?0:number(hundred[2]);if(hundreds>=1&&hundreds<=9&&rest>=0&&rest<100)return hundreds*100+rest;return undefined;}
  const match=word.match(/^(.*?)(?:じゅう|十)(.*?)$/);
  if(match){const tens=match[1]===''?1:NUMBERS[match[1]],units=match[2]===''?0:NUMBERS[match[2]];
    if(tens>=1&&tens<=9&&units>=0&&units<=9)return tens*10+units;}
  return undefined;
};
export function parseUtterance(raw,{phase='editing',maxRows=Infinity}={}){
  const text=normalized(raw),error=code=>({type:'error',code});
  if(phase==='executing'||phase==='preparing')return error('INVALID_COMMAND');
  const simple=Object.entries(SIMPLE).find(([word])=>normalized(word)===text)?.[1];
  if(simple){let type=simple;
    if(type==='confirm'&&['hint','tutorial','help','cleared','award','paused'].includes(phase))type='next';
    const allowed=phase==='editing'?['undo','reset','hint','confirm','end']:phase==='failed'?['retry','end']:phase==='paused'?['next','end']:['next','end'];
    return allowed.includes(type)?{type}:error('INVALID_COMMAND');
  }
  if(phase!=='editing')return error('INVALID_COMMAND');
  if(DIRECTION_WORDS[text])return {type:'direction',direction:DIRECTION_WORDS[text]};
  const row=text.match(/^(.+?)(?:ばん|番)$/);if(row){const index=number(row[1])-1;return Number.isInteger(index)&&index>=0&&index<maxRows?{type:'select',index}:error('INVALID_ROW');}
  const hits=Object.keys(DIRECTION_WORDS).filter(word=>text.includes(word));
  const directions=text.match(/うえ|上|した|下|ひだり|左|みぎ|右/g)??[];if(directions.length>1)return error('MULTIPLE_COMMANDS');
  for(const word of hits){if(!text.startsWith(word))continue;const count=number(text.slice(word.length));if(Number.isInteger(count)&&count>0&&count<=999)return {type:'move',direction:DIRECTION_WORDS[word],count};}
  return error('INVALID_COMMAND');
}
export function vocabulary({phase='editing',maxRows=30}={}){
  // Vosk splits grammar phrases at spaces. Joined strings such as みぎ2 and
  // Arabic digits are absent from the Japanese model's words.txt.
  const digits=['','一','二','三','四','五','六','七','八','九'];
  const spokenNumber=n=>{const hundreds=Math.floor(n/100),tens=Math.floor(n%100/10),units=n%10;return [hundreds?(hundreds>1?digits[hundreds]+' ':'')+'百':'',tens?(tens>1?digits[tens]+' ':'')+'十':'',digits[units]].filter(Boolean).join(' ')};
  const directions=['上','下','左','右'];
  if(phase==='editing')return [...directions,...directions.flatMap(d=>Array.from({length:30},(_,i)=>`${d} ${spokenNumber(i+1)}`)),...Array.from({length:Math.min(maxRows,999)},(_,i)=>`${spokenNumber(i+1)} 番`),'もどす','やりなおし','ヒント','オッケー','オーケー','おわり'];
  if(phase==='failed')return ['スタート','おわり'];if(phase==='executing'||phase==='preparing')return [];
  return ['つぎ','オッケー','オーケー','おわり'];
}
