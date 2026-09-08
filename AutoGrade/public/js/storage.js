/* ══ storage.js — ECA local storage persistence ══ */

const SK='eca_data_v2';
let _cache=null;
function _loadStore(){if(_cache!==null)return _cache;try{_cache=JSON.parse(localStorage.getItem(SK)||'{}');}catch{_cache={};}return _cache;}
function _saveStore(d){_cache=d;localStorage.setItem(SK,JSON.stringify(d));}
const ecaLoad=()=>_loadStore();
const ecaSave=d=>_saveStore(d);
const getSub=id=>{const s=ecaLoad();return s[id]||{status:'pending',grade:'',semester:'',teachers:'',materials:'',notes:'',realCode:'',realName:''};};
const setSub=(id,p)=>{const s=ecaLoad();s[id]={...getSub(id),...p};ecaSave(s);};

window.SK = SK;
window.getSub = getSub;
window.setSub = setSub;
window.ecaLoad = ecaLoad;
window.ecaSave = ecaSave;
