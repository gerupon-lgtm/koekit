export const RULES_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const PLAYBACK = Object.freeze({startMs:400,stepMs:750,deliveryMs:1200,goalPauseMs:250,resultMs:2200});
export const LEVELS = Object.freeze([3,5,7,9].map((size,i)=>Object.freeze({id:i+1,size,packageCount:i+1,stages:3,multipleRoutes:i>0})));
export const TITLES = Object.freeze(['おつかいルーキー','おつかいじょうず','おつかいめいじん','おつかいマスター'].map((title,i)=>({level:i+1,title,medal:['bronze','silver','gold','platinum'][i]})));
export const SEARCH_CONFIG = Object.freeze({generationAttempts:100,timeoutMs:5000,easyMargin:0.5,hardMargin:0.15});
export const DIRECTIONS = Object.freeze({up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]});
export const DIRECTION_LABELS = Object.freeze({up:'うえ',down:'した',left:'ひだり',right:'みぎ'});
