/* 스칼렛의 크루즈 플래너 — 앱 로직 (서버 없이 동작, 저장은 이 기기 브라우저에만) */
(function(){
"use strict";
const $app = document.getElementById("app");
const SAVE_KEY = "scarlett_cruise_plans_v1";
const fits = (r,w) => !w || !WHO[w] || r.who.includes(WHO[w].fit);
const isGroup = s => WHO[s.w] && WHO[s.w].g && (s.a+s.k)>=4;

/* ---------- 공통 ---------- */
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2600); }
function routeLine(r){
  return r.days.map((c,i)=> (i? "<i>›</i>":"") + (c==="-" ? '<span class="sea">바다</span>' : "<span>"+esc(portName(c))+"</span>")).join("");
}
function upcomingMonths(){ // 다음 달부터 12개월
  const out=[], d=new Date(); d.setDate(1);
  for(let i=1;i<=12;i++){ const x=new Date(d.getFullYear(), d.getMonth()+i, 1); out.push({y:x.getFullYear(), m:x.getMonth()+1, k:x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")}); }
  return out;
}
function fromPrice(r){ // 인사이드 2인 기준 1인 크루즈 요금(항만세·팁 포함) 시작가
  const n=nights(r), c=COST[r.rg];
  return [r.tier[0]*n + c.tax[0] + 2*n, r.tier[1]*n + c.tax[1] + 2.6*n];
}
function getSaved(){ try{ return JSON.parse(localStorage.getItem(SAVE_KEY)||"[]"); }catch(e){ return []; } }
function setSaved(a){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(a)); return true; }catch(e){ return false; } }

/* ---------- 플랜 상태 ---------- */
let st = null; // 현재 만드는 플랜
function newState(rid, who){
  const r=R[rid], ms=upcomingMonths().filter(x=>r.months.includes(x.m));
  const w = (who && WHO[who]) ? who : "couple";
  const s={ v:1, r:rid, w, a: WHO[w].a, k: WHO[w].k, req:[], m: ms[0]?ms[0].k:"", cab:"balcony",
    fl: r.fly?1:0, ap:"ICN", pre: r.fly?1:0, post: r.fly?1:0, tours:{}, x:{}, nm:"" };
  r.days.forEach((c,i)=>{ if(isTourDay(r,i)) s.tours[i] = "free"; });
  return s;
}


/* ---------- 라우터 ---------- */
function parse(){
  const h=location.hash.replace(/^#/,"")||"/";
  const [path,qs]=h.split("?"); const q=Object.fromEntries(new URLSearchParams(qs||""));
  return { parts:path.split("/").filter(Boolean), q };
}
function setTab(t){ document.querySelectorAll(".tabbar a[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===t)); }
function render(){
  const {parts,q}=parse(); window.scrollTo(0,0);
  const p=parts[0]||"";
  if(p==="explore"){ setTab("explore"); return viewExplore(q); }
  if(p==="cruise" && R[parts[1]]){ setTab("explore"); return viewCruise(R[parts[1]]); }
  if(p==="find"){ setTab("explore"); return viewFind(); }
  if(p==="build" && R[parts[1]]){ setTab("explore"); return viewBuild(parts[1], +(parts[2]||1), q); }
  if(p==="plan"){ setTab("saved"); if(!st) { location.hash="#/saved"; return; } return viewPlan(); }
  if(p==="p"){ const s=decode(parts[1]||""); setTab("saved"); if(!s){ $app.innerHTML='<div class="empty">링크가 올바르지 않아요.<br><br><a class="btn out" href="#/">홈으로</a></div>'; return; } st=s; return viewPlan(!s._id); }
  if(p==="q"){ const Q=decodeQuote(parts[1]||""); setTab("saved"); if(!Q){ $app.innerHTML='<div class="empty">견적서 링크가 올바르지 않아요.<br><br><a class="btn out" href="#/">홈으로</a></div>'; return; } return viewQuote(Q); }
  if(p==="saved"){ setTab("saved"); return viewSaved(); }
  setTab("home"); viewHome();
}
window.addEventListener("hashchange", render);

/* ---------- 홈 ---------- */
function cruiseCard(r){
  const fp=fromPrice(r);
  return `<a class="ccard" href="#/cruise/${r.id}">
    <div class="ph"><img src="${r.img||REGIONS[r.rg].img}" alt="" loading="lazy"><span class="tag">${esc(REGIONS[r.rg].n)} · ${nights(r)}박</span></div>
    <div class="body"><h3>${esc(r.t)}</h3><div class="ship">${esc(r.line)} · ${esc(r.ship)}</div>
      <div class="route">${routeLine(r)}</div>
      <div class="foot"><div class="price"><small>1인 크루즈 예상 (인사이드·2인 1실)</small><b>${rng(fp[0],fp[1])}</b></div><span class="more">플랜 짜기 ›</span></div>
    </div></a>`;
}
document.addEventListener("click", e=>{ const a=e.target.closest("[data-who]"); if(a) findAns.who=a.dataset.who; });
function viewHome(){
  const saved=getSaved();
  const picks=["bsn-jp4","kel-ok4","bcn-med7","sea-ak7"].map(id=>R[id]);
  $app.innerHTML = `
  <section class="hero"><img src="img/ship_port.jpg" alt="항구에 정박한 크루즈">
    <div class="in"><div class="eyebrow">Plan your own voyage</div>
      <h1>우리 모임 크루즈,<br>직접 그려 보세요</h1>
      <p>부부동반·동창·회사·동호회까지. 배를 고르고 앞뒤 항공·호텔과 기항지를 더하면 예상 경비까지 한 장의 플랜이 돼요.</p>
      <div class="btns"><a class="btn pri" href="#/find">3분 만에 찾기</a><a class="btn sec2" href="#/explore">크루즈 둘러보기</a></div>
      <div class="free">회원가입 없이 무료 · 완성한 플랜은 스칼렛에게 바로 상담</div>
    </div></section>

  <section class="sec"><div class="eyebrow">Who's going</div><h2>어떤 모임이세요?</h2><p class="lead">모임을 고르면 어울리는 일정부터 보여 드려요.</p>
    <div class="chipwrap">${Object.entries(WHO).map(([k,w])=>`<a class="chip" href="#/explore?who=${k}" data-who="${k}">${w.e} ${esc(w.n)}</a>`).join("")}</div>
  </section>

  <section class="sec"><div class="eyebrow">How it works</div><h2>이렇게 만들어요</h2><p class="lead">처음 타는 크루즈도 세 단계면 그림이 그려져요.</p>
    <div class="steps">
      <div class="step"><div class="n">1</div><div><b>크루즈 고르기</b><span>지역·기간·일행에 맞는 대표 일정을 둘러봐요.</span></div></div>
      <div class="step"><div class="n">2</div><div><b>내 여행으로 채우기</b><span>객실, 앞뒤 호텔·항공, 기항지마다 투어 방식을 골라요.</span></div></div>
      <div class="step"><div class="n">3</div><div><b>저장하고 상담받기</b><span>예상 경비가 담긴 플랜을 저장·공유하고, 스칼렛이 실제 요금으로 맞춰 드려요.</span></div></div>
    </div></section>

  <section class="sec"><div class="eyebrow">Where to</div><h2>어디로 떠나 볼까요?</h2><p class="lead">지역을 누르면 대표 일정이 나와요.</p>
    <div class="rgrid">${Object.entries(REGIONS).map(([k,g])=>`<a class="rcard" href="#/explore?rg=${k}"><img src="${g.img}" alt="" loading="lazy"><div><b>${esc(g.n)}</b><span>${esc(g.sub)}</span></div></a>`).join("")}</div>
  </section>

  ${saved.length? `<section class="sec"><h2>이어서 보기</h2><p class="lead">이 기기에 저장한 플랜 ${saved.length}개</p><div class="list">${saved.slice(0,2).map(savedRow).join("")}</div></section>`:""}

  <section class="sec"><div class="eyebrow">Scarlett's picks</div><h2>스칼렛이 먼저 권하는 일정</h2><p class="lead">처음이라면 여기서 시작해 보세요.</p>
    <div class="list">${picks.map(cruiseCard).join("")}</div>
    <div style="margin-top:12px"><a class="btn out block" href="#/explore">전체 ${ROUTES.length}개 일정 보기</a></div>
  </section>

  <div class="cta"><h3>단체 견적은 카톡으로 바로</h3><p>인원·희망 시기만 알려 주셔도 크루즈마스터 스칼렛이 직접 답해 드려요.</p><a class="btn kakao block" href="${CHAT_URL}" target="_blank" rel="noopener">💬 카카오톡 채널로 상담하기</a></div>

  <section class="sec"><h2>자주 묻는 것</h2><p class="lead"></p>
    <details class="faq"><summary>단체로 가면 뭐가 달라요?</summary><p>일정 객실 수 이상 모이면 단체 요금이나 혜택을 주는 선사가 많고, 객실 위치 묶기·단체 정찬·행사 공간 같은 요청도 함께 조율할 수 있어요. 기준과 혜택은 선사·시기마다 달라서 상담 때 확인해 드려요.</p></details>
    <details class="faq"><summary>여기 나온 가격으로 예약할 수 있나요?</summary><p>아니요. 화면의 금액은 ${PRICE_BASIS}을 바탕으로 한 <b>참고용 추정 범위</b>예요. 실제 요금은 출발일·객실 위치·프로모션에 따라 크게 달라지니, 완성한 플랜을 보내 주시면 스칼렛이 실제 견적으로 맞춰 드려요.</p></details>
    <details class="faq"><summary>회원가입이 필요한가요?</summary><p>필요 없어요. 플랜은 지금 쓰는 휴대폰 브라우저에 저장되고, 링크나 이미지로 가족·친구와 나눌 수 있어요.</p></details>
    <details class="faq"><summary>배와 일정은 실제로 운항하나요?</summary><p>각 선사가 해당 지역에서 운항해 온 대표적인 일정 예시예요. 선박 배치와 기항지는 시즌마다 바뀌므로, 원하시는 달의 실제 출항편은 상담 때 확인해 드려요.</p></details>
    <details class="faq"><summary>이미 크루즈를 예약했어도 쓸 수 있나요?</summary><p>네. 같은 지역·일정을 골라 앞뒤 호텔과 기항지 계획, 예산 정리용으로 쓰셔도 좋아요.</p></details>
  </section>
  ${footer()}`;
}
function footer(){
  return `<footer class="foot"><span class="mark">ÉCLAT PASSAGE</span>크루즈마스터 스칼렛 · 크루즈 상담<br>
  모든 금액은 참고용 추정치이며 예약·결제 기능은 없습니다.
  <details><summary>사진 출처 (CC 라이선스)</summary><ul id="credits"><li>불러오는 중…</li></ul></details></footer>`;
}
function loadCredits(){
  const ul=document.getElementById("credits"); if(!ul||ul.dataset.ok) return;
  fetch("img/credits.json").then(r=>r.json()).then(j=>{
    const rows=[]; Object.values(j).forEach(v=>(Array.isArray(v)?v:[v]).forEach(c=>rows.push(c)));
    ul.innerHTML=rows.map(c=>`<li><a href="${esc(c.src)}" target="_blank" rel="noopener">${esc(c.title)}</a> — ${esc(c.creator)}, ${esc(c.license)}</li>`).join("");
    ul.dataset.ok=1;
  }).catch(()=>{ ul.innerHTML="<li>img/credits.json 참고</li>"; });
}
document.addEventListener("toggle", e=>{ if(e.target.matches("footer details")) loadCredits(); }, true);

/* ---------- 3분 찾기 ---------- */
const findAns={};
function viewFind(){
  const Q=[
    {k:"who", t:"누구와, 어떤 모임으로 떠나세요?", o:Object.entries(WHO).map(([k,w])=>[k,w.e+" "+w.n,w.sub])},
    {k:"len", t:"며칠 정도 생각하세요?", o:[["short","짧게 3~5박","휴가 하루이틀만 내고"],["long","제대로 7박","한 번 갈 때 길게"],["any","상관없어요",""]]},
    {k:"far", t:"얼마나 멀리 가 볼까요?", o:[["near","가까운 아시아","비행 2~6시간, 시차 적음"],["far","유럽·미주","인생 크루즈, 장거리 비행"],["any","둘 다 보여 주세요",""]]}
  ];
  const done = Q.every(x=>findAns[x.k]);
  $app.innerHTML = `<a class="back" href="#/">‹ 홈</a>
    <div class="bhead"><small>3분 만에 찾기</small><h2>몇 가지만 골라 주세요</h2><p>답에 맞는 대표 일정을 추려 드려요.</p></div>
    ${Q.map(x=>`<div class="qa"><h3>${x.t}</h3>${x.o.map(([v,l,s])=>`<button class="opt ${findAns[x.k]===v?"on":""}" data-k="${x.k}" data-v="${v}"><b>${l}</b>${s?`<small>${s}</small>`:""}</button>`).join("")}</div>`).join("")}
    <div class="wrap" style="margin:8px 0 24px"><button class="btn pri block" id="go" ${done?"":"disabled style='opacity:.4'"}>맞는 크루즈 보기</button></div>`;
  $app.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{ findAns[b.dataset.k]=b.dataset.v; const y=window.scrollY; viewFind(); window.scrollTo(0,y); });
  const go=document.getElementById("go"); if(go) go.onclick=()=>{ if(!done) return; location.hash=`#/explore?who=${findAns.who}&len=${findAns.len}&far=${findAns.far}`; };
}

/* ---------- 둘러보기 ---------- */
function viewExplore(q){
  if(q.who && WHO[q.who]) findAns.who=q.who;
  const near=["japan","taiwan","sea"];
  let list=ROUTES.filter(r=>{
    if(q.rg && r.rg!==q.rg) return false;
    if(q.who && !fits(r,q.who)) return false;
    if(q.len==="short" && nights(r)>5) return false;
    if(q.len==="long" && nights(r)<7) return false;
    if(q.far==="near" && !near.includes(r.rg)) return false;
    if(q.far==="far" && near.includes(r.rg)) return false;
    return true;
  });
  const chip=(k,v,l)=>{ const on=(q[k]||"")===v; const nq={...q}; if(v) nq[k]=v; else delete nq[k]; return `<a class="chip ${on?"on":""}" href="#/explore?${new URLSearchParams(nq)}">${l}</a>`; };
  $app.innerHTML = `<section class="sec"><div class="eyebrow">Explore</div><h2>크루즈 둘러보기</h2><p class="lead">대표 일정 ${list.length}개 · 가격은 참고용 추정 범위예요.</p>
    <div class="chips">${chip("rg","","전체 지역")}${Object.entries(REGIONS).map(([k,g])=>chip("rg",k,g.n)).join("")}</div>
    <div class="chips">${chip("who","","모임 · 전체")}${Object.entries(WHO).map(([k,w])=>chip("who",k,w.e+" "+w.n)).join("")}</div>
    <div class="chips">${chip("len","","기간 · 전체")}${chip("len","short","3~5박")}${chip("len","long","7박")}</div>
    <div class="list">${list.length? list.map(cruiseCard).join("") : `<div class="empty">조건에 맞는 일정이 없어요.<br>필터를 하나 풀어 보세요.<br><br><a class="btn out" href="#/explore">필터 초기화</a></div>`}</div>
    <div class="note" style="margin:16px 0">찾는 일정이 없나요? 원하는 지역·날짜를 스칼렛에게 말씀해 주시면 실제 출항편을 찾아 드려요. <a href="${CHAT_URL}" target="_blank" rel="noopener" style="color:var(--teal);font-weight:700">카카오톡 문의 ›</a></div>
  </section>${footer()}`;
}

/* ---------- 크루즈 상세 ---------- */
function viewCruise(r){
  const fp=fromPrice(r), n=nights(r), ms=r.months.map(m=>m+"월").join(" · ");
  $app.innerHTML = `<div class="dhero"><img src="${r.img||REGIONS[r.rg].img}" alt=""><div class="in"><p>${esc(REGIONS[r.rg].n)} · ${n}박 ${n+1}일</p><h1>${esc(r.t)}</h1><p>${esc(r.line)} · ${esc(r.ship)}</p></div></div>
  <a class="back" href="#/explore?rg=${r.rg}">‹ ${esc(REGIONS[r.rg].n)} 일정 목록</a>
  <div class="wrap">
    <div class="facts"><div class="fact"><small>기간</small><b>${n}박 ${n+1}일</b></div><div class="fact"><small>기항지</small><b>${r.days.filter((c,i)=>isTourDay(r,i)).length}곳</b></div><div class="fact"><small>해상일</small><b>${r.days.filter(c=>c==="-").length}일</b></div></div>
    <div class="hl">${esc(r.hl)}</div>
    <div class="box" style="margin:0 0 12px"><h3>운항 시기</h3><p style="font-size:14px">${ms}</p><p style="font-size:12px;color:var(--mute);margin-top:4px">해마다 운항 달과 선박이 바뀔 수 있어요.</p></div>
    <div class="box" style="margin:0 0 12px"><h3>1인 크루즈 예상 (2인 1실, 항만세·팁 포함)</h3>
      ${Object.entries(CABINS).map(([k,c])=>{ const lo=r.tier[0]*c.m[0]*n+COST[r.rg].tax[0]+2*n, hi=r.tier[1]*c.m[1]*n+COST[r.rg].tax[1]+2.6*n; return `<div class="row"><span>${c.n}</span><b style="color:var(--amber)">${rng(lo,hi)}</b></div>`; }).join("")}
      <p style="font-size:11.5px;color:var(--mute);margin-top:8px">${PRICE_BASIS} 참고 범위 · 항공·호텔 별도 · 실제 요금은 상담 시 확인</p></div>
    <h3 style="color:var(--deep);margin:18px 0 10px">날짜별 일정 (예시)</h3>
    <div class="tl">${r.days.map((c,i)=>dayItem(r,c,i,null)).join("")}</div>
    <div style="height:90px"></div>
  </div>
  <div class="bar"><div class="in"><div class="sum"><small>이 크루즈로 내 여행 만들기</small><b>${rng(fp[0],fp[1])}~</b></div><a class="btn pri" href="#/build/${r.id}/1">플랜 짜기 ›</a></div></div>`;
}
function dayItem(r,c,i,tour){
  const last=r.days.length-1;
  if(c==="-") return `<div class="tli sea"><div class="d">${i+1}일차</div><b>종일 항해</b><p>바다 위의 하루 — 수영장·스파·공연을 마음껏</p></div>`;
  const P=PORTS[c];
  const when = i===0? "승선 · 오후 출항" : i===last? "아침 하선" : P.cruising? "선상 관람" : "기항";
  let extra="";
  if(tour){
    extra = `<span class="badge">${TOUR_TYPES[tour].n}</span>`;
  }
  const plan = (tour==="ship") ? `<div class="plan"><div class="tip">🎫 선사 투어는 출발 전 선사 앱·홈페이지에서 고르고, 종류가 많아 상담 때 일행에 맞는 코스를 골라 드려요.</div></div>` : ((tour==="free"||tour==="private") && P.plan) ? `<div class="plan">${P.plan.map(([t,x])=>`<div><span>${t}</span><span>${esc(x)}</span></div>`).join("")}${P.tip?`<div class="tip">💡 ${esc(P.tip)}</div>`:""}</div>` : "";
  return `<div class="tli"><div class="d">${i+1}일차 · ${when}</div><b>${esc(P.n)}</b> <small style="color:var(--mute);font-size:12px">${esc(P.c)}</small>${extra}<p>${esc(P.d)}</p>${plan}</div>`;
}

/* ---------- 플랜 만들기 ---------- */
const STEPS=["일행·시기·객실","앞뒤 일정","기항지","선택 옵션"];
function viewBuild(rid, step, q){
  if(!st || st.r!==rid) st=newState(rid, findAns.who);
  const r=R[rid];
  step=Math.min(Math.max(step,1),STEPS.length);
  let body="";
  if(step===1){
    const ms=upcomingMonths();
    body=`<div class="box"><h3>누구와, 어떤 모임으로 가세요?</h3><div class="chipwrap">${Object.entries(WHO).map(([k,w])=>`<button class="chip ${st.w===k?"on":""}" data-act="who" data-v="${k}">${w.e} ${w.n}</button>`).join("")}</div></div>
    <div class="box"><h3>인원</h3>
      ${stepper("a","성인","만 12세 이상",1,80)}${stepper("k","어린이","3·4번째 침대 요금 적용 가정",0,20)}
      ${st.a+st.k>=8? `<p style="font-size:12px;color:var(--teal);margin-top:8px">👥 ${st.a+st.k}명 단체 — 일정 객실 수 이상이면 단체 요금·혜택을 주는 선사가 많아요. 기준은 선사마다 달라 상담 때 확인해 드려요.</p>`:""}</div>
    ${WHO[st.w].g? `<div class="box"><h3>모임 요청사항 <small style="font-weight:400;color:var(--mute);font-size:12px">· 상담 때 전달돼요</small></h3><div class="chipwrap">${GROUP_REQ.map(v=>`<button class="chip ${(st.req||[]).includes(v)?"on":""}" data-act="req" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div></div>`:""}
    <div class="box"><h3>출발 시기</h3><div class="chipwrap">${ms.map(x=>`<button class="chip ${st.m===x.k?"on":""}" data-act="m" data-v="${x.k}" ${r.months.includes(x.m)?"":"disabled"}>${x.y!==ms[0].y && x.m===1? x.y+"년 ":""}${x.m}월</button>`).join("")}</div>
      <p style="font-size:12px;color:var(--mute);margin-top:8px">흐린 달은 이 일정이 보통 운항하지 않는 달이에요.</p></div>
    <div class="box"><h3>객실</h3><div class="cabins">${Object.entries(CABINS).map(([k,c])=>`<button class="cab ${st.cab===k?"on":""}" data-act="cab" data-v="${k}"><img src="${c.img}" alt=""><div><b>${c.n}</b><p>${c.d}</p></div></button>`).join("")}</div></div>`;
  }
  if(step===2){
    const g=REGIONS[r.rg].n;
    body=`<div class="box"><h3>${r.fly? "항공":"부산항까지 이동"}</h3>
      <div class="row"><div>${r.fly? "왕복 항공 포함하기":"KTX·택시 등 교통비 포함"}<small>${r.fly? esc(portName(r.days[0]))+" 왕복 · 이코노미 기준":"부산에 사시면 끄세요"}</small></div><button class="toggle ${st.fl?"on":""}" data-act="fl" aria-label="포함 여부"></button></div>
      ${r.fly && st.fl? `<div class="row"><div>출발 공항</div><select data-act="ap">${Object.entries(AIRPORTS).map(([k,v])=>`<option value="${k}" ${st.ap===k?"selected":""}>${v}</option>`).join("")}</select></div>`:""}
    </div>
    <div class="box"><h3>호텔</h3>
      ${stepper("pre","승선 전 "+esc(portName(r.days[0]))+" 숙박","항공 지연에도 안전하게 전날 도착",0,4)}
      ${stepper("post","하선 후 "+esc(portName(r.days[r.days.length-1]))+" 숙박","하선 당일 아침 비행기가 빠듯할 때",0,4)}
    </div>
    <div class="note">💡 ${r.fly? "해외 출발 크루즈는 <b>승선 전날 도착 1박</b>을 권해요. 비행기가 늦어도 배는 기다려 주지 않아요." : "부산 출발은 당일 승선도 가능해요. 다른 지역에서 오시면 전날 부산 1박이 여유로워요."}</div>`;
  }
  if(step===3){
    const tds=r.days.map((c,i)=>i).filter(i=>isTourDay(r,i));
    body=`<div class="box"><h3>기항지마다 어떻게 보낼까요?</h3>
      ${tds.length? tds.map(i=>{ const P=PORTS[r.days[i]]; return `<div class="port"><div class="ph"><b>${esc(P.n)}</b><small>${i+1}일차 · ${esc(P.c)}</small></div><div class="desc">${esc(P.d)}</div>
        <div class="seg">${Object.entries(TOUR_TYPES).map(([k,t])=>`<button class="${st.tours[i]===k?"on":""}" data-act="tour" data-i="${i}" data-v="${k}">${k==="private"&&st.a+st.k>=12?"전용 버스":t.n}</button>`).join("")}</div></div>`; }).join("")
      : `<p style="font-size:14px">이 일정은 기항지 없이 바다 위에서만 보내요. 배 자체가 여행지예요!</p>`}
    </div>
    <div class="note">${Object.entries(TOUR_TYPES).map(([k,t])=>`<b>${t.n}</b> — ${t.d}`).join("<br>")}</div>
    <div class="note">👥 ${esc(WHO[st.w].tip)}</div>`;
  }
  if(step===4){
    body=`<div class="box"><h3>있으면 좋은 선택 옵션</h3>${Object.entries(EXTRAS).map(([k,e])=>`<div class="row"><div>${e.n}<small>${e.d}</small></div><button class="toggle ${st.x[k]?"on":""}" data-act="x" data-v="${k}" aria-label="${e.n}"></button></div>`).join("")}</div>
    <div class="box"><h3>플랜 이름</h3><input type="text" maxlength="30" data-act="nm" value="${esc(st.nm)}" placeholder="예: OO고 32회 동창 크루즈 · 엄마 칠순 크루즈"></div>`;
  }
  const cc=calc(st);
  $app.innerHTML = `<div class="has-bar"><div class="prog">${STEPS.map((_,i)=>`<span class="${i<step?"on":""}"></span>`).join("")}</div>
    <a class="back" href="${step>1?`#/build/${rid}/${step-1}`:`#/cruise/${rid}`}">‹ ${step>1? "이전 단계":"크루즈 정보"}</a>
    <div class="bhead"><small>${step} / ${STEPS.length} · ${esc(r.t)}</small><h2>${STEPS[step-1]}</h2></div>
    ${body}
    <div class="note">금액은 ${PRICE_BASIS}을 바탕으로 한 참고용 추정 범위예요. 실제 요금·운항은 상담 시 확인해 드려요.</div>
  </div>
  <div class="bar"><div class="in"><div class="sum"><small>총 예상 (${cc.pax}명)</small><b id="barsum">${rng(cc.lo,cc.hi)}</b></div>
    ${step<STEPS.length? `<a class="btn pri" href="#/build/${rid}/${step+1}">다음 ›</a>` : `<button class="btn pri" id="finish">플랜 완성 ›</button>`}</div></div>`;
  bindBuild(rid, step);
}
function stepper(k,label,sub,min,max){
  return `<div class="row"><div>${label}<small>${sub}</small></div><div class="stepper"><button data-act="dec" data-k="${k}" data-min="${min}" aria-label="${label} 줄이기">−</button><b>${st[k]}</b><button data-act="inc" data-k="${k}" data-max="${max}" aria-label="${label} 늘리기">+</button></div></div>`;
}
function bindBuild(rid, step){
  const rerender=()=>{ const y=window.scrollY; viewBuild(rid, step); window.scrollTo(0,y); };
  $app.querySelectorAll("[data-act]").forEach(el=>{
    const a=el.dataset.act;
    if(a==="ap"){ el.onchange=()=>{ st.ap=el.value; rerender(); }; return; }
    if(a==="nm"){ el.oninput=()=>{ st.nm=el.value; }; return; }
    el.onclick=()=>{
      if(a==="who"){ st.w=el.dataset.v; st.a=WHO[st.w].a; st.k=WHO[st.w].k; }
      if(a==="req"){ st.req=st.req||[]; const v=el.dataset.v, i=st.req.indexOf(v); if(i>=0) st.req.splice(i,1); else st.req.push(v); }
      if(a==="m") st.m=el.dataset.v;
      if(a==="cab") st.cab=el.dataset.v;
      if(a==="fl") st.fl=st.fl?0:1;
      if(a==="tour") st.tours[el.dataset.i]=el.dataset.v;
      if(a==="x") st.x[el.dataset.v]=st.x[el.dataset.v]?0:1;
      if(a==="dec"){ const k=el.dataset.k; st[k]=Math.max(+el.dataset.min, st[k]-1); }
      if(a==="inc"){ const k=el.dataset.k; st[k]=Math.min(+el.dataset.max, st[k]+1); }
      rerender();
    };
  });
  const f=document.getElementById("finish"); if(f) f.onclick=()=>{ location.hash="#/plan"; };
}

/* ---------- 완성 플랜 ---------- */
function viewPlan(shared){
  const s=st, r=R[s.r], cc=calc(s), n=nights(r), P0=portName(r.days[0]), PL=portName(r.days[r.days.length-1]);
  const maxHi=Math.max(...cc.items.map(i=>i.hi));
  const tl=[];
  if(s.fl && r.fly) tl.push(`<div class="tli land"><div class="d">출발</div><b>${AIRPORTS[s.ap]} → ${esc(P0)} 항공</b><p>${s.pre? "승선 "+s.pre+"일 전 도착":"승선 당일 도착 — 시간 여유를 꼭 확인하세요"}</p></div>`);
  if(s.fl && !r.fly) tl.push(`<div class="tli land"><div class="d">출발</div><b>부산항으로 이동</b><p>KTX·택시 등</p></div>`);
  if(s.pre) tl.push(`<div class="tli land"><div class="d">승선 전 ${s.pre}박</div><b>${esc(P0)} 호텔</b><p>${PORTS[r.days[0]].plan? "남는 시간엔 아래 1일차 코스를 미리 둘러봐도 좋아요":esc(PORTS[r.days[0]].d)}</p></div>`);
  r.days.forEach((c,i)=>tl.push(dayItem(r,c,i, s.tours[i]||null)));
  if(s.post) tl.push(`<div class="tli land"><div class="d">하선 후 ${s.post}박</div><b>${esc(PL)} 호텔</b><p>하선 날은 짐이 많아요 — 호텔에 맡기고 가볍게 시내 산책</p></div>`);
  if(s.fl && r.fly) tl.push(`<div class="tli land"><div class="d">귀국</div><b>${esc(PL)} → ${AIRPORTS[s.ap]} 항공</b><p>하선은 보통 오전 7~10시 사이예요</p></div>`);
  const total = n + 1 + s.pre + s.post;
  $app.innerHTML = `
  ${shared? `<div class="note" style="margin-top:14px">누군가 공유한 크루즈 플랜이에요. 마음에 들면 저장하거나 고쳐서 내 플랜으로 만들 수 있어요.</div>`:""}
  <div class="card-share" id="shareCard">
    <div class="ph"><img src="${r.img||REGIONS[r.rg].img}" alt=""></div>
    <div class="in"><span class="mark">ÉCLAT PASSAGE · MY CRUISE PLAN</span>
      <h2>${esc(planTitle(s))}</h2>
      <div class="meta">${esc(r.line)} ${esc(r.ship)} · ${monthLabel(s.m)} · 총 ${total}일<br>${WHO[s.w].e} ${esc(WHO[s.w].n)} · 성인 ${s.a}${s.k?` · 어린이 ${s.k}`:""} · ${CABINS[s.cab].n}</div>
      <div class="route">${routeLine(r)}</div>
      <div class="tot"><div><small>총 예상 경비 (참고용 범위)</small><b>${rng(cc.lo,cc.hi)}</b><small>1인 약 ${rng(cc.per[0],cc.per[1])}</small></div><div class="by">크루즈마스터<br>스칼렛</div></div>
    </div>
  </div>

  <div class="actions">
    <button class="btn deep" id="aSave">${shared? "내 플랜으로 저장":"이 기기에 저장"}</button>
    <button class="btn out" id="aLink">링크 복사</button>
    <button class="btn out" id="aImg">이미지로 저장</button>
    <a class="btn out" href="#/build/${r.id}/1">고치기</a>
  </div>

  <div class="cta"><h3>이 플랜, 실제 요금으로 받아 보세요</h3>
    <p>버튼을 누르면 플랜 내용이 복사되고 스칼렛의 카카오톡 채팅이 열려요. 붙여넣기만 하면 원하는 달의 실제 출항편·객실 요금·항공을 찾아 드려요.</p>
    <button class="btn kakao block" id="aKakao">💬 스칼렛에게 상담받기</button></div>

  <section class="sec"><h2>여행 일정</h2><p class="lead">${esc(r.t)} · 날짜별 흐름 (예시)</p><div class="tl">${tl.join("")}</div>
    <div class="note" style="margin:8px 0">👥 ${esc(WHO[s.w].tip)}</div></section>

  <section class="sec"><h2>예상 경비</h2><p class="lead">${cc.pax}명 기준 · 단위 만원 · 참고용 범위</p>
    <div class="box" style="margin:0"><div class="bud">${cc.items.map(i=>`<div class="bi"><div class="t"><span>${i.name}<small>${esc(i.sub)}</small></span><span>${rng(i.lo,i.hi)}</span></div><div class="b"><span style="width:${Math.max(4,i.hi/maxHi*100)}%"></span></div></div>`).join("")}</div>
    <div class="total"><span>합계</span><b>${rng(cc.lo,cc.hi)}</b></div></div>
    <div class="note" style="margin:12px 0">이 금액은 ${PRICE_BASIS}을 바탕으로 계산한 <b>추정 범위</b>이며 실제 판매가·예약 가능 여부가 아니에요. 환율·출발일·객실 위치·프로모션에 따라 달라지고, 비자·여행자보험·개인 쇼핑은 포함하지 않았어요.</div>
  </section>
  ${footer()}`;
  document.getElementById("aSave").onclick=savePlan;
  document.getElementById("aLink").onclick=()=>copy(shareUrl(), "공유 링크를 복사했어요");
  document.getElementById("aImg").onclick=saveImage;
  document.getElementById("aKakao").onclick=toKakao;
}
function shareUrl(){ const {_id,savedAt,...s}=st; return location.href.split("#")[0]+"#/p/"+encode(s); }
function savePlan(){
  const a=getSaved(); const id = st._id || ("p"+Date.now().toString(36));
  const s={...st, _id:id}; st=s;
  const i=a.findIndex(x=>x._id===id); const row={...s, savedAt:Date.now()};
  if(i>=0) a[i]=row; else a.unshift(row);
  if(setSaved(a.slice(0,30))) toast("이 기기에 저장했어요 · 내 플랜에서 다시 볼 수 있어요"); else toast("이 브라우저에선 저장이 안 돼요. 링크 복사를 이용해 주세요");
}
function summaryText(){
  const s=st, r=R[s.r], cc=calc(s);
  return [`[크루즈 플랜 상담 요청]`, `· ${planTitle(s)}`, `· ${r.t} (${r.line} ${r.ship})`, `· 시기: ${monthLabel(s.m)}`,
    `· 모임: ${WHO[s.w].n} / 성인 ${s.a}${s.k?`, 어린이 ${s.k}`:""}`, `· 객실: ${CABINS[s.cab].n}`,
    ...((s.req&&s.req.length)? [`· 요청사항: ${s.req.join(", ")}`]:[]),
    `· 항공: ${s.fl? (r.fly? AIRPORTS[s.ap]+" 출발":"부산항 교통 포함") : "불필요"} / 호텔: 승선 전 ${s.pre}박, 하선 후 ${s.post}박`,
    `· 플래너 예상: ${rng(cc.lo,cc.hi)}`, `· 플랜 보기: ${shareUrl()}`].join("\n");
}
function copy(text, msg){
  const done=()=>toast(msg);
  if(navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, ()=>fallback());
  else fallback();
  function fallback(){ const t=document.createElement("textarea"); t.value=text; t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t); t.select(); try{document.execCommand("copy"); done();}catch(e){ prompt("아래 내용을 복사해 주세요", text); } t.remove(); }
}
function toKakao(){
  const text=summaryText();
  const sh=document.createElement("div"); sh.className="sheet";
  sh.innerHTML=`<div class="sheet-in" role="dialog" aria-label="카카오톡 상담">
    <h3>스칼렛에게 이 플랜 보내기</h3>
    <ol><li><b>복사하고 카톡 열기</b>를 누르면 아래 내용이 복사되고 스칼렛 채널 채팅방이 열려요.</li><li>채팅 입력칸을 길게 눌러 <b>붙여넣기</b> → 보내기.</li></ol>
    <textarea readonly>${esc(text)}</textarea>
    <button class="btn kakao block" id="kGo">💬 복사하고 카톡 열기</button>
    <button class="btn out block" id="kClose" style="margin-top:8px">닫기</button></div>`;
  document.body.appendChild(sh);
  const close=()=>sh.remove();
  sh.onclick=e=>{ if(e.target===sh) close(); };
  sh.querySelector("#kClose").onclick=close;
  sh.querySelector("#kGo").onclick=()=>{ copy(text,"복사했어요 · 채팅창에 붙여넣어 보내 주세요"); setTimeout(()=>{ window.open(CHAT_URL,"_blank","noopener"); close(); },500); };
}
function saveImage(){
  if(!window.html2canvas){ toast("잠시 후 다시 눌러 주세요"); return; }
  const el=document.getElementById("shareCard"); toast("이미지를 만드는 중…");
  html2canvas(el,{scale:2,useCORS:true,backgroundColor:"#04465A"}).then(cv=>{
    cv.toBlob(b=>{
      const name="크루즈플랜_"+R[st.r].t.replace(/\s+/g,"")+".png";
      const file=new File([b],name,{type:"image/png"});
      if(navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({files:[file], title:"내 크루즈 플랜"}).catch(()=>{}); return; }
      const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); a.remove();
      toast("이미지를 저장했어요");
    });
  }).catch(()=>toast("이미지 저장에 실패했어요. 화면 캡처를 이용해 주세요"));
}

/* ---------- 스칼렛 견적서 (상담사가 보낸 링크) ---------- */
function viewQuote(Q){
  const s=Q.p, r=R[s.r], tot=quoteTotal(Q), pax=s.a+s.k;
  const expired = Q.vd && new Date(Q.vd+"T23:59:59") < new Date();
  $app.innerHTML = `
  <div class="card-share" id="shareCard">
    <div class="ph"><img src="${r.img||REGIONS[r.rg].img}" alt=""></div>
    <div class="in"><span class="mark">ÉCLAT PASSAGE · QUOTATION</span>
      <h2>${esc(planTitle(s))}</h2>
      <div class="meta">${esc(r.t)} · ${esc(r.line)} ${esc(r.ship)}<br>${monthLabel(s.m)} · ${WHO[s.w].e} ${esc(WHO[s.w].n)} · 성인 ${s.a}${s.k?` · 어린이 ${s.k}`:""} · ${CABINS[s.cab].n}</div>
      <div class="tot"><div><small>스칼렛 견적 합계</small><b>${won(tot)}</b><small>1인 약 ${won(tot/pax)}</small></div><div class="by">크루즈마스터<br>스칼렛</div></div>
    </div>
  </div>
  ${expired? `<div class="note" style="border-color:var(--amber);color:var(--amber)">유효기한(${esc(Q.vd)})이 지난 견적이에요. 요금이 바뀌었을 수 있으니 다시 문의해 주세요.</div>`:""}
  ${Q.nt? `<div class="cta" style="margin-top:4px"><h3>스칼렛이 드리는 말씀</h3><p style="white-space:pre-line;margin-bottom:0">${esc(Q.nt)}</p></div>`:""}
  <section class="sec"><h2>견적 내역</h2><p class="lead">발행 ${esc(Q.dt||"")}${Q.vd? " · 유효기한 "+esc(Q.vd):""}</p>
    <div class="box" style="margin:0"><div class="bud">${Q.it.map(i=>`<div class="bi"><div class="t"><span>${esc(i.n)}${i.m?`<small>${esc(i.m)}</small>`:""}</span><span>${won(+i.a||0)}</span></div></div>`).join("")}</div>
    <div class="total"><span>합계 (${pax}명)</span><b>${won(tot)}</b></div></div>
    ${Q.inc? `<div class="box" style="margin:12px 0 0"><h3>포함</h3><p style="font-size:13.5px;white-space:pre-line">${esc(Q.inc)}</p></div>`:""}
    ${Q.exc? `<div class="box" style="margin:12px 0 0"><h3>불포함</h3><p style="font-size:13.5px;white-space:pre-line">${esc(Q.exc)}</p></div>`:""}
    <div class="note" style="margin:12px 0">요금은 선사·항공 좌석 상황과 환율에 따라 바뀔 수 있어요. 예약 확정 전 카카오톡 대화에서 최종 금액을 다시 확인해 드려요.</div>
  </section>
  <div class="actions"><button class="btn out" id="qImg">이미지로 저장</button><a class="btn out" href="#/p/${encode(s)}">일정 자세히 보기</a></div>
  <div class="cta"><h3>이 견적으로 진행할까요?</h3><p>궁금한 점이나 바꾸고 싶은 부분을 편하게 말씀해 주세요.</p><a class="btn kakao block" href="${CHAT_URL}" target="_blank" rel="noopener">💬 스칼렛에게 답장하기</a></div>
  ${footer()}`;
  st=s; document.getElementById("qImg").onclick=saveImage;
}

/* ---------- 내 플랜 ---------- */
function savedRow(s){
  const r=R[s.r]; if(!r) return ""; const cc=calc(s);
  return `<div class="sv"><img src="${r.img||REGIONS[r.rg].img}" alt=""><a class="t" href="#/p/${encode(s)}"><b>${esc(planTitle(s))}</b><small>${monthLabel(s.m)} · ${CABINS[s.cab].n} · ${rng(cc.lo,cc.hi)}</small></a><button class="del" data-del="${s._id}">삭제</button></div>`;
}
function viewSaved(){
  const a=getSaved();
  $app.innerHTML = `<section class="sec"><div class="eyebrow">My plans</div><h2>내 플랜</h2><p class="lead">이 기기 브라우저에 저장된 플랜이에요. 다른 기기에서 보려면 링크를 복사해 두세요.</p>
    <div class="list">${a.length? a.map(savedRow).join("") : `<div class="empty">아직 저장한 플랜이 없어요.<br><br><a class="btn pri" href="#/find">첫 플랜 만들기</a></div>`}</div></section>${footer()}`;
  $app.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{ if(!confirm("이 플랜을 지울까요?")) return; setSaved(getSaved().filter(x=>x._id!==b.dataset.del)); viewSaved(); toast("지웠어요"); });
}

render();
})();
