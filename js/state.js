'use strict';

/* ── 전역 상태 ── */
const S = {
  tab:'my', sector:'전체', tf:'전체', q:'', gradeFilter:'all', themeFilter:'',
  ana:{}, judging:{}, aiSumF:{}, dartF:{},
  watchlist:[], portfolio:[], portAnalysis:{}, keywords:[],
  alertSettings:{surge:true,newIssue:true,keyword:true},
  dartKey:'', autoRefresh:true, _priceUpdatedAt:null,
  _cfWorkerUrl:'', _theme:'light', _tradeType:'buy'
};

let NEWS=[], PRICES={}, SUPPLY={}, STOCKS_LIST=[], QUANT={};

const CF_WORKER_URL = 'https://misty-glade-ddcf.namicoco80.workers.dev';
const BASE_URL = location.origin + location.pathname.replace(/\/?$/, '/');

const SRC = {
  official:{color:'#4338CA',label:'공시',bg:'#EEF2FF'},
  news:{color:'#166534',label:'뉴스',bg:'#F0FDF4'},
  analyst:{color:'#9A3412',label:'리포트',bg:'#FFF7ED'},
  rumor:{color:'#7E22CE',label:'루머',bg:'#FDF4FF'}
};
const SECTORS=['전체','반도체','IT','바이오','자동차','2차전지','화학','금융','지주'];
const THEMES_DATA=[
  {name:'AI·반도체',codes:['005930','000660'],icon:'🤖',news:0,avgImpact:0},
  {name:'2차전지',codes:['006400','051910'],icon:'🔋',news:0,avgImpact:0},
  {name:'바이오',codes:['207940','068270'],icon:'💊',news:0,avgImpact:0},
  {name:'전기차',codes:['005380','000270'],icon:'🚗',news:0,avgImpact:0},
  {name:'IT·플랫폼',codes:['035420','035720'],icon:'📱',news:0,avgImpact:0},
  {name:'금융',codes:['055550','003550'],icon:'🏦',news:0,avgImpact:0}
];

/* 기본 종목 목록 (prices.json 로드 전 fallback) */
const DEFAULT_STOCKS = [
  {"code":"005930","name":"삼성전자","sector":"반도체"},
  {"code":"000660","name":"SK하이닉스","sector":"반도체"},
  {"code":"035420","name":"NAVER","sector":"IT"},
  {"code":"035720","name":"카카오","sector":"IT"},
  {"code":"051910","name":"LG화학","sector":"화학"},
  {"code":"006400","name":"삼성SDI","sector":"2차전지"},
  {"code":"207940","name":"삼성바이오로직스","sector":"바이오"},
  {"code":"068270","name":"셀트리온","sector":"바이오"},
  {"code":"005380","name":"현대차","sector":"자동차"},
  {"code":"000270","name":"기아","sector":"자동차"},
  {"code":"003550","name":"LG","sector":"지주"},
  {"code":"055550","name":"신한지주","sector":"금융"},
  {"code":"105560","name":"KB금융","sector":"금융"},
  {"code":"012330","name":"현대모비스","sector":"자동차"},
  {"code":"028260","name":"삼성물산","sector":"지주"},
  {"code":"066570","name":"LG전자","sector":"전자"},
  {"code":"096770","name":"SK이노베이션","sector":"에너지"},
  {"code":"034730","name":"SK","sector":"지주"},
  {"code":"017670","name":"SK텔레콤","sector":"통신"},
  {"code":"030200","name":"KT","sector":"통신"}
];

/* ──