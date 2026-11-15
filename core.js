/* 공통 계산 — 고객 화면(app.js)과 상담사 도구가 같이 씀 */
const R = Object.fromEntries(ROUTES.map(r => [r.id, r]));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function man(n){ n=Math.round(n); if(n>=10000){ const e=Math.floor(n/10000), r=n%10000; return e+"억"+(r? " "+r.toLocaleString()+"만":"")+"원"; } return n.toLocaleString()+"만원"; }
function rng(a,b){ return man(a)+" ~ "+man(b); }
function nights(r){ return r.days.length-1; }
function portName(c){ return c==="-" ? "해상일" : PORTS[c].n.replace(/ \(.*\)$/,""); }
function monthLabel(k){ if(!k) return "시기 미정"; const [y,m]=k.split("-"); return y+"년 "+(+m)+"월"; }
function isTourDay(r,i){ const c=r.days[i]; return i>0 && i<r.days.length-1 && c!=="-" && !PORTS[c].cruising; }
function encode(s){ return btoa(unescape(encodeURIComponent(JSON.stringify(s)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function decode(code){ try{ const b=code.replace(/-/g,"+").replace(/_/g,"/"); const s=JSON.parse(decodeURIComponent(escape(atob(b)))); if(R[s.r] && !WHO[s.w]) s.w="couple"; return R[s.r]? s : null; }catch(e){ return null; } }
/* ---------- 경비 계산 (만원, [최소,최대]) ---------- */
function calc(s){
  const r=R[s.r], c=COST[r.rg], n=nights(r), pax=s.a+s.k, cab=CABINS[s.cab];
  const items=[];
  const add=(k,name,sub,lo,hi)=>{ if(hi>0) items.push({k,name,sub,lo,hi}); };
  let single = (s.a===1 && s.k===0) ? [1.5,2] : [1,1];
  const fareUnits = s.a + 0.5*s.k;
  add("fare","크루즈 객실 요금", cab.n+" · "+n+"박"+(single[0]>1?" · 1인 사용 할증 포함":""),
      r.tier[0]*cab.m[0]*n*fareUnits*single[0], r.tier[1]*cab.m[1]*n*fareUnits*single[1]);
  add("tax","항만세·부대비", pax+"명", c.tax[0]*pax, c.tax[1]*pax);
  add("tip","선내 팁(봉사료)", "1인 1박 기준 × "+n+"박", 2*n*pax, 2.6*n*pax);
  if(s.fl){
    if(r.fly) add("fly","왕복 항공", AIRPORTS[s.ap]+" 출발 · 이코노미 · "+pax+"명", c.fly[0]*pax, c.fly[1]*pax);
    else add("fly","부산항 왕복 교통", "KTX·택시 등 · "+pax+"명", 5*pax, 13*pax);
  }
  const hn = s.pre + s.post, rooms = Math.max(1, Math.ceil(s.a/2));
  if(hn){
    add("hotel","승선 전후 호텔", hn+"박 · 객실 "+rooms+"개", c.hotel[0]*hn*rooms, c.hotel[1]*hn*rooms);
    add("day","육지 체류 경비", "식비·교통 · "+hn+"일 × "+pax+"명", c.day[0]*hn*pax, c.day[1]*hn*pax);
  }
  let tlo=0, thi=0, tcount=0;
  Object.entries(s.tours||{}).forEach(([i,t])=>{
    if(t==="free"||t==="ship"){ tlo+=c.tour[t][0]*pax; thi+=c.tour[t][1]*pax; tcount++; }
    else if(t==="private"){ if(pax>=12){ const b=Math.ceil(pax/40); tlo+=c.priv[0]*2.5*b; thi+=c.priv[1]*2.5*b; } else { const g=Math.ceil(pax/6); tlo+=c.priv[0]*g; thi+=c.priv[1]*g; } tcount++; }
  });
  add("tour","기항지 투어", tcount+"곳", tlo, thi);
  let xlo=0, xhi=0; const xs=[];
  Object.keys(EXTRAS).forEach(k=>{
    if(!s.x||!s.x[k]) return; const e=EXTRAS[k];
    const mult = {adultNight:s.a*n, personNight:s.a*n, person:pax, adult:s.a, group:1}[e.u];
    xlo+=e.p[0]*mult; xhi+=e.p[1]*mult; xs.push(e.n);
  });
  add("extra","선택 옵션", xs.join(", "), xlo, xhi);
  const lo=items.reduce((a,b)=>a+b.lo,0), hi=items.reduce((a,b)=>a+b.hi,0);
  return { items, lo, hi, per:[lo/pax, hi/pax], pax };
}
function planTitle(s){ return s.nm || (WHO[s.w].n+" · "+R[s.r].t); }
/* 견적서 코드 */
function won(n){ return Math.round(n).toLocaleString()+"원"; }
function decodeAny(code){ try{ const b=code.replace(/-/g,"+").replace(/_/g,"/"); return JSON.parse(decodeURIComponent(escape(atob(b)))); }catch(e){ return null; } }
/* 견적서: {p:플랜, it:[{n:항목,a:금액(원),m:메모}], inc:포함, exc:불포함, vd:유효기한, nt:고객에게 한마디, dt:발행일} */
function decodeQuote(code){ const q=decodeAny(code); if(!q||!q.p||!R[q.p.r]) return null; if(!WHO[q.p.w]) q.p.w="couple"; q.it=(q.it||[]).filter(x=>x&&x.n); return q; }
function quoteTotal(q){ return q.it.reduce((a,b)=>a+(+b.a||0),0); }
