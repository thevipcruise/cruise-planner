/* 기항지 투어 플래너 — 장소 고르기 · 동선 · 안내 책자
   데이터: places.js (SHORE). 이 기기 저장: localStorage. */
"use strict";

const CHAT = "https://pf.kakao.com/_yrixbX/chat";
const CATS = {
  food:  { n:"식당",        g:"식", c:"#D9541E" },
  well:  { n:"웰니스·뷰티", g:"웰", c:"#7A4FA3" },
  cafe:  { n:"카페",        g:"카", c:"#8A5A2B" },
  rest:  { n:"휴식",        g:"쉼", c:"#1F8A5B" },
  photo: { n:"포토 스팟",   g:"포", c:"#C2255C" }
};
const KEY = "shore_planner_v1";
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

/* ---------- 저장 ---------- */
function load(){ try{ return JSON.parse(localStorage.getItem(KEY)); }catch(e){ return null; } }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){} }
let db = Object.assign({ cur:null, plans:{}, custom:{}, ports:{}, info:{}, caps:{} }, load() || {});
let tab = "places", catFilter = "all", picking = null;

const allPorts = () => Object.assign({}, SHORE.ports, db.ports);
const port = () => allPorts()[db.cur];
const places = () => (port().places || []).concat(db.custom[db.cur] || []);
const placeById = id => places().find(p => p.id === id);
function plan(){
  const p = db.plans[db.cur] || (db.plans[db.cur] = { t0:"09:00", t1:"16:00", stops:[], legs:{} });
  p.stops = p.stops.filter(s => placeById(s.id));
  return p;
}
/* 수용 인원: 내가 고친 값 > 직접 추가한 장소의 값 > 어림값. n=0 은 야외·공공장소 */
const X = () => (typeof SHORE_X !== "undefined" && SHORE_X[db.cur]) || { tours:[], move:[] };
function capOf(p){
  const o = db.caps[p.id]; if(o != null) return { n:o, mine:true };
  if(p.cap != null) return { n:p.cap, mine:true };
  const c = typeof SHORE_CAP !== "undefined" ? SHORE_CAP[p.id] : null; return c == null ? null : { n:c };
}
function capText(p){ const c = capOf(p); return !c ? "확인 필요" : c.n === 0 ? "제한 없음 (야외·공공장소)" : "약 " + c.n + "명 " + (c.mine ? "(직접 확인)" : "(어림)"); }
const pax = () => plan().pax || 2;
const capOver = p => { const c = capOf(p); return !!c && c.n > 0 && pax() > c.n; };
const inPlan = id => plan().stops.some(s => s.id === id);

/* ---------- 시간·거리 ---------- */
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
const toHM = m => { m = Math.round(m); const d = Math.floor(m / 1440); m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + (d > 0 ? " (+1일)" : ""); };
const dur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return (h ? h + "시간" : "") + (r || !h ? (h ? " " : "") + r + "분" : ""); };
function hav(a, b){
  const R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/* 직선거리 × 1.35 를 실제 길로 보고, 1km 이하는 걷기(시속 4.2km), 그보다 멀면 차(시속 24km + 타고 내리는 5분) */
function est(a, b){
  const km = hav(a, b) * 1.35;
  if(km <= 1) return { min: Math.max(3, Math.round(km / 4.2 * 60)), mode:"도보", km };
  return { min: Math.round(5 + km / 24 * 60), mode:"차", km };
}
function leg(fromId, toId){
  const T = port().terminal.ll, a = fromId === "T" ? T : placeById(fromId).ll, b = toId === "T" ? T : placeById(toId).ll;
  const e = est(a, b), o = plan().legs[fromId + ">" + toId];
  return o != null ? { min:o, mode:e.mode, km:e.km, edited:true } : e;
}
function schedule(){
  const pl = plan(); let t = toMin(pl.t0), prev = "T", travel = 0, stay = 0;
  const rows = pl.stops.map(s => {
    const l = leg(prev, s.id); t += l.min; travel += l.min;
    const row = { p: placeById(s.id), leg:l, from:prev, arr:t, stay:s.stay };
    t += s.stay; stay += s.stay; row.dep = t; prev = s.id; return row;
  });
  const backLeg = leg(prev, "T"); if(pl.stops.length){ t += backLeg.min; travel += backLeg.min; }
  return { rows, backLeg, backFrom:prev, back:t, travel, stay, slack: toMin(pl.t1) - t, window: toMin(pl.t1) - toMin(pl.t0) };
}
function travelSum(ids){ let s = 0, prev = "T"; ids.forEach(id => { s += leg(prev, id).min; prev = id; }); return s + (ids.length ? leg(prev, "T").min : 0); }
function optimize(){
  const pl = plan(); let ids = pl.stops.map(s => s.id); if(ids.length < 2) return;
  const out = []; let prev = "T", rest = ids.slice();
  while(rest.length){ rest.sort((x, y) => leg(prev, x).min - leg(prev, y).min); prev = rest.shift(); out.push(prev); }
  ids = out;
  for(let improved = true; improved; ){
    improved = false;
    for(let i = 0; i < ids.length - 1; i++) for(let j = i + 1; j < ids.length; j++){
      const c = ids.slice(0, i).concat(ids.slice(i, j + 1).reverse(), ids.slice(j + 1));
      if(travelSum(c) < travelSum(ids)){ ids = c; improved = true; }
    }
  }
  pl.stops = ids.map(id => pl.stops.find(s => s.id === id));
}
/* 시간 안에 들어가는 만큼, 카테고리별로 터미널에서 가까운 곳을 하나씩 */
function autoCourse(){
  const pl = plan(), T = port().terminal.ll; pl.stops = [];
  ["photo", "food", "well", "cafe", "rest"].forEach(cat => {
    const c = places().filter(p => p.cat === cat && !p.far).sort((a, b) => hav(T, a.ll) - hav(T, b.ll))[0];
    if(!c) return;
    pl.stops.push({ id:c.id, stay:c.stay || 60 }); optimize();
    if(schedule().slack < 0) pl.stops = pl.stops.filter(s => s.id !== c.id);
  });
}

/* ---------- 지도 ---------- */
let map, markerLayer, routeLayer, bookMap;
const TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자';
function pin(p, n){
  const c = CATS[p.cat];
  return L.divIcon({ className:"", iconSize:[32, 32], iconAnchor:[16, 16], popupAnchor:[0, -14],
    html:`<div class="pin${n ? " sel" : ""}" style="--c:${c.c}">${n || c.g}</div>` });
}
const anchorIcon = () => L.divIcon({ className:"", iconSize:[36, 36], iconAnchor:[18, 18], popupAnchor:[0, -16], html:'<div class="pin term">⚓</div>' });
function initMap(){
  map = L.map("map", { zoomControl:true, scrollWheelZoom:true }).setView([33.6, 130.4], 12);
  L.tileLayer(TILE, { maxZoom:19, attribution:ATTR }).addTo(map);
  routeLayer = L.layerGroup().addTo(map); markerLayer = L.layerGroup().addTo(map);
  map.on("click", e => { if(picking){ const cb = picking; stopPick(); cb([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]); } });
}
function popupHtml(p){
  return `<div class="pop"><span class="cat" style="--c:${CATS[p.cat].c}">${CATS[p.cat].n}</span><b>${esc(p.n)}</b>
    <p>${esc(p.d || "")}</p><div class="popacts"><button type="button" data-act="toggle" data-id="${esc(p.id)}">${inPlan(p.id) ? "동선에서 빼기" : "동선에 담기"}</button><button type="button" data-act="show" data-id="${esc(p.id)}">자세히</button></div></div>`;
}
function drawMap(fit){
  if(!map) return;
  markerLayer.clearLayers(); routeLayer.clearLayers();
  const po = port(), pl = plan(), T = po.terminal.ll, pts = [T];
  L.marker(T, { icon:anchorIcon(), zIndexOffset:500 }).bindPopup(`<div class="pop"><b>${esc(po.terminal.n)}</b><p>배가 서는 곳 · 출발과 도착 지점</p></div>`).addTo(markerLayer);
  places().forEach(p => {
    const idx = pl.stops.findIndex(s => s.id === p.id);
    if(idx < 0 && tab === "places" && catFilter !== "all" && p.cat !== catFilter) return;
    const m = L.marker(p.ll, { icon:pin(p, idx >= 0 ? idx + 1 : 0), zIndexOffset: idx >= 0 ? 300 : 0 }).bindPopup(() => popupHtml(p), { minWidth:210 });
    m._pid = p.id; m.addTo(markerLayer);
    if(idx >= 0 || !p.far) pts.push(p.ll);
  });
  if(pl.stops.length){
    const line = [T].concat(pl.stops.map(s => placeById(s.id).ll), [T]);
    L.polyline(line, { color:"#04465A", weight:4, opacity:.75, dashArray:"1 9", lineCap:"round" }).addTo(routeLayer);
  }
  if(fit) map.fitBounds(L.latLngBounds(pts).pad(.12), { maxZoom:15 });
}
function focusPlace(id){
  const p = placeById(id); if(!p) return;
  $(".s-map").scrollIntoView({ behavior:"smooth", block:"start" });
  map.setView(p.ll, Math.max(map.getZoom(), 15));
  markerLayer.eachLayer(m => { if(m._pid === id) m.openPopup(); });
}
function startPick(cb){ picking = cb; $("#pickbar").hidden = false; $("#sheet").classList.add("away"); $(".s-map").scrollIntoView({ behavior:"smooth", block:"start" }); $("#map").classList.add("picking"); }
function stopPick(){ picking = null; $("#pickbar").hidden = true; $("#sheet").classList.remove("away"); $("#map").classList.remove("picking"); }

/* ---------- 링크 ---------- */
const gq = p => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.custom ? p.ll.join(",") : (p.en || p.n) + " " + (port().q || port().n));
function dirUrl(){
  const T = port().terminal.ll.join(","), w = plan().stops.map(s => placeById(s.id).ll.join(",")).join("|");
  return "https://www.google.com/maps/dir/?api=1&origin=" + T + "&destination=" + T + (w ? "&waypoints=" + encodeURIComponent(w) : "");
}
const b64 = { enc: o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
              dec: s => { try{ return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))))); }catch(e){ return null; } } };
function shareUrl(){
  const pl = plan(), o = { v:1, port:db.cur, plan:pl, info:db.info };
  if(db.ports[db.cur]) o.cport = db.ports[db.cur];
  const cp = (db.custom[db.cur] || []).filter(p => inPlan(p.id)); if(cp.length) o.cp = cp;
  return location.href.split("#")[0] + "#p/" + b64.enc(o);
}
function openShared(){
  const m = location.hash.match(/^#p\/(.+)/); if(!m) return false;
  const o = b64.dec(m[1]); history.replaceState(null, "", location.pathname + location.search);
  if(!o || !o.port || !o.plan) return false;
  if(o.cport) db.ports[o.port] = o.cport;
  if(!allPorts()[o.port]) return false;
  (o.cp || []).forEach(p => { const a = db.custom[o.port] || (db.custom[o.port] = []); if(!a.some(x => x.id === p.id)) a.push(p); });
  db.cur = o.port; db.plans[o.port] = o.plan; if(o.info) db.info = o.info; tab = "route"; save(); return true;
}
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600); }
function copy(text, msg){
  const done = () => toast(msg);
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); else fallbackCopy(text, done);
}
function fallbackCopy(text, done){ const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); done(); }catch(e){ toast("복사하지 못했어요. 길게 눌러 직접 복사해 주세요."); } ta.remove(); }

/* ---------- 화면: 기항지 ---------- */
function renderPorts(){
  const ps = allPorts(), groups = SHORE.regions.map(r => ({ r, ids: Object.keys(SHORE.ports).filter(id => SHORE.ports[id].rg === r.id) }));
  const mine = Object.keys(db.ports);
  $("#ports").innerHTML = `<label class="lbl" for="portsel">어느 기항지인가요?</label>
    <div class="portrow"><select id="portsel">${groups.map(g => `<optgroup label="${esc(g.r.n)}">${g.ids.map(id => `<option value="${id}"${id === db.cur ? " selected" : ""}>${esc(ps[id].n)} · ${esc(ps[id].c)}</option>`).join("")}</optgroup>`).join("")}
      ${mine.length ? `<optgroup label="내가 만든 기항지">${mine.map(id => `<option value="${id}"${id === db.cur ? " selected" : ""}>${esc(ps[id].n)}${ps[id].c ? " · " + esc(ps[id].c) : ""}</option>`).join("")}</optgroup>` : ""}</select>
      <button type="button" class="mini" data-act="new-port">＋ 다른 기항지</button></div>`;
  const po = port();
  $("#portinfo").innerHTML = `<div class="pinfo"><div><small>배가 서는 곳</small><b>${esc(po.terminal.n)}</b></div>
    ${po.move ? `<div><small>시내 이동</small><span>${esc(po.move)}</span></div>` : ""}
    ${po.cur ? `<div><small>통화</small><span>${esc(po.cur)}</span></div>` : ""}
    ${po.emergency ? `<div><small>긴급 전화</small><span>${esc(po.emergency)}</span></div>` : ""}
    ${db.ports[db.cur] ? `<div><button type="button" class="link danger" data-act="del-port">이 기항지 지우기</button></div>` : ""}</div>`;
}

/* ---------- 화면: 장소 ---------- */
function contactHtml(p){
  const tel = p.tel ? `<span class="tel"><a href="tel:${esc(p.tel.replace(/[^+\d]/g, ""))}">☎ ${esc(p.tel)}</a><button type="button" class="link" data-act="copy" data-text="${esc(p.tel)}">복사</button></span>` : `<span class="tel none">전화번호는 구글 지도에서 확인</span>`;
  return `<div class="contact">${tel}${p.web ? `<a href="${esc(p.web)}" target="_blank" rel="noopener">홈페이지</a>` : ""}<a href="${gq(p)}" target="_blank" rel="noopener">구글 지도</a></div>`;
}
function metaHtml(p){
  const rows = [["머무는 시간", "약 " + dur(p.stay || 60)], ["영업", p.hours], ["예산", p.price], ["예약", p.book], ["주소", p.addr]].filter(r => r[1]);
  return `<dl class="meta">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join("")}
    <div><dt>수용 인원</dt><dd>${esc(capText(p))} <button type="button" class="link" data-act="cap" data-id="${esc(p.id)}">고치기</button>${capOver(p) ? `<span class="over">일행 ${pax()}명은 한 번에 어려워요. 나눠 들어가거나 미리 문의하세요.</span>` : ""}</dd></div></dl>`;
}
function placeCard(p){
  const e = est(port().terminal.ll, p.ll), on = inPlan(p.id), c = CATS[p.cat];
  return `<article class="pcard${on ? " on" : ""}" id="pc-${esc(p.id)}">
    <div class="phead"><span class="cat" style="--c:${c.c}">${c.n}</span>${p.far ? '<span class="tag far">먼 거리</span>' : ""}${p.custom ? '<span class="tag">내가 추가</span>' : (p.verified === false ? '<span class="tag">방문 전 확인</span>' : "")}${p.llApprox ? '<span class="tag">위치 어림</span>' : ""}
      <span class="dist">터미널에서 ${e.mode} 약 ${dur(e.min)}</span></div>
    <h3>${esc(p.n)}</h3>${p.en ? `<div class="en">${esc(p.en)}</div>` : ""}
    ${p.d ? `<p>${esc(p.d)}</p>` : ""}${p.pick ? `<p class="pick">${esc(p.pick)}</p>` : ""}
    ${metaHtml(p)}${contactHtml(p)}
    <div class="acts"><button type="button" class="mini" data-act="focus" data-id="${esc(p.id)}">지도에서 보기</button>
      ${p.custom ? `<button type="button" class="mini" data-act="del-place" data-id="${esc(p.id)}">지우기</button>` : ""}
      <button type="button" class="mini ${on ? "rm" : "add"}" data-act="toggle" data-id="${esc(p.id)}">${on ? "✓ 담김 · 빼기" : "＋ 동선에 담기"}</button></div>
  </article>`;
}
function paneplaces(){
  const all = places(), T = port().terminal.ll;
  const list = all.filter(p => catFilter === "all" || p.cat === catFilter).sort((a, b) => (a.far ? 1 : 0) - (b.far ? 1 : 0) || hav(T, a.ll) - hav(T, b.ll));
  const count = k => all.filter(p => p.cat === k).length;
  return `<div class="chipwrap cats"><button type="button" class="chip${catFilter === "all" ? " on" : ""}" data-cat="all">전체 ${all.length}</button>
    ${Object.entries(CATS).map(([k, c]) => `<button type="button" class="chip${catFilter === k ? " on" : ""}" data-cat="${k}"><i style="background:${c.c}"></i>${c.n} ${count(k)}</button>`).join("")}</div>
    ${list.length ? `<div class="plist">${list.map(placeCard).join("")}</div>` : `<div class="empty"><b>아직 장소가 없어요</b><p>아래 버튼으로 가고 싶은 곳을 직접 추가해 보세요. 이름으로 찾거나 지도에서 위치를 찍을 수 있어요.</p></div>`}
    <button type="button" class="btn out block" data-act="new-place">＋ 내가 아는 장소 직접 추가</button>`;
}

/* ---------- 화면: 투어·교통 ---------- */
function panetours(){
  const x = X(), po = port(), q = po.q || po.n, e = encodeURIComponent;
  const finds = [["구글에서 한국어로 찾기", "https://www.google.com/search?q=" + e(po.n + " 기항지 투어 크루즈")], ["구글에서 영어로 찾기", "https://www.google.com/search?q=" + e(q + " cruise port shore excursions")],
    ["클룩", "https://www.klook.com/ko/search/result/?query=" + e(q)], ["겟유어가이드", "https://www.getyourguide.com/s/?q=" + e(q + " shore excursion")], ["비아터", "https://www.viator.com/searchResults/all?text=" + e(q + " shore excursion")]];
  const moves = [["터미널에서 시내 가는 법 검색", "https://www.google.com/search?q=" + e(po.n + " 크루즈 터미널 시내 이동 방법")], ["구글 지도에서 터미널 주변 보기", "https://www.google.com/maps/search/?api=1&query=" + po.terminal.ll.join(",")]];
  return `<h2 class="sh">선사·여행사가 자주 하는 투어</h2>
    ${x.tours.length ? `<div class="plist">${x.tours.map((t, i) => { const ids = (t.stops || []).filter(placeById);
      return `<article class="pcard tour"><div class="phead"><span class="tag far">${esc(t.h)}</span><span class="dist">${esc(t.by)}</span></div><h3>${esc(t.n)}</h3><p>${esc(t.d)}</p>
        ${ids.length ? `<div class="tstops">${ids.map(id => `<button type="button" class="chip" data-act="show" data-id="${esc(id)}">${esc(placeById(id).n)}</button>`).join("")}</div>
        <div class="acts"><button type="button" class="mini add" data-act="tour" data-i="${i}">이 코스 장소를 동선에 담기</button></div>` : `<p class="tnone">이 사이트 장소 목록 밖의 코스예요. 아래 링크에서 실제 상품을 찾아보세요.</p>`}</article>`; }).join("")}</div>`
      : `<div class="empty"><b>정리된 투어가 아직 없어요</b><p>직접 만든 기항지예요. 아래 링크로 실제 판매 중인 투어를 찾아보세요.</p></div>`}
    <div class="finds"><b>지금 팔리는 투어 찾아보기</b><div>${finds.map(f => `<a href="${f[1]}" target="_blank" rel="noopener">${f[0]}</a>`).join("")}</div>
      <p>선사 투어는 예약한 선사의 앱·홈페이지 ‘Shore Excursions’ 메뉴에서 내 항차 기준으로 볼 수 있어요.</p></div>
    <h2 class="sh">이동수단</h2>
    ${x.move.length ? `<ul class="moves">${x.move.map(m => `<li><div><b>${esc(m.m)}</b>${m.fit ? `<span class="tag">${esc(m.fit)}</span>` : ""}</div><p>${esc(m.d)}</p></li>`).join("")}</ul>` : (po.move ? `<p class="lead">${esc(po.move)}</p>` : "")}
    <div class="finds"><b>이동 방법 더 찾아보기</b><div>${moves.map(f => `<a href="${f[1]}" target="_blank" rel="noopener">${f[0]}</a>`).join("")}</div>
      <p>‘내 동선’의 구간마다 있는 ‘가는 법’을 누르면 구글 지도에서 그 구간의 대중교통·도보 길을 볼 수 있어요.</p></div>`;
}

/* ---------- 화면: 동선 ---------- */
function legHtml(l, from, to){
  const T = port().terminal.ll, a = from === "T" ? T : placeById(from).ll, b = to === "T" ? T : placeById(to).ll;
  const href = "https://www.google.com/maps/dir/?api=1&origin=" + a.join(",") + "&destination=" + b.join(",") + "&travelmode=" + (l.mode === "도보" ? "walking" : "transit");
  return `<li class="leg"><span>${l.mode === "도보" ? "🚶" : "🚕"} ${l.mode} 약 ${dur(l.min)}${l.edited ? " (직접 입력)" : ""} <a class="link" href="${href}" target="_blank" rel="noopener">가는 법</a></span>
    <span class="stepper sm"><button type="button" data-act="leg" data-k="${esc(from + ">" + to)}" data-d="-5" aria-label="이동 시간 5분 줄이기">−</button><button type="button" data-act="leg" data-k="${esc(from + ">" + to)}" data-d="5" aria-label="이동 시간 5분 늘리기">＋</button></span></li>`;
}
function paneroute(){
  const pl = plan(), s = schedule(), po = port();
  const times = `<div class="times"><label>하선 시각<input type="time" id="t0" value="${esc(pl.t0)}"></label><label>귀선 마감<input type="time" id="t1" value="${esc(pl.t1)}"></label><label>일행 수<input type="number" id="pax" min="1" max="999" inputmode="numeric" value="${pax()}"></label>
    <p>귀선 마감은 출항 시각이 아니라 <b>배에 돌아와 있어야 하는 시각</b>이에요. 선내 신문의 All Aboard 시각을 넣어 주세요.</p></div>`;
  if(!pl.stops.length) return times + `<div class="empty"><b>아직 담은 장소가 없어요</b><p>‘장소 고르기’에서 가고 싶은 곳을 담거나, 시간에 맞는 코스를 한 번에 받아 보세요.</p>
    ${places().length ? `<button type="button" class="btn pri block" data-act="auto">시간에 맞춰 추천 코스 받기</button>` : ""}</div>`;
  const state = s.slack < 0 ? "bad" : s.slack < 30 ? "warn" : "ok";
  const msg = s.slack < 0 ? `귀선 마감보다 ${dur(-s.slack)} 늦어요. 장소를 줄이거나 머무는 시간을 줄여 주세요.`
    : s.slack < 30 ? `귀선 마감까지 여유가 ${dur(s.slack)}뿐이에요. 30분 이상 남기는 걸 권해요.` : `귀선 마감까지 ${dur(s.slack)} 여유가 있어요.`;
  return times + `<div class="sum ${state}"><div class="nums"><div><small>장소</small><b>${pl.stops.length}곳</b></div><div><small>머무는 시간</small><b>${dur(s.stay)}</b></div><div><small>이동</small><b>${dur(s.travel)}</b></div><div><small>터미널 도착</small><b>${toHM(s.back)}</b></div></div><p>${msg}</p>${s.rows.some(r => capOver(r.p)) ? `<p class="capw">일행 ${pax()}명이 한 번에 들어가기 어려운 곳이 ${s.rows.filter(r => capOver(r.p)).length}곳 있어요. 아래 표시를 확인하세요.</p>` : ""}</div>
    <div class="rtools"><button type="button" class="mini" data-act="opt">가까운 순서로 정리</button><button type="button" class="mini" data-act="auto">추천 코스로 다시</button><button type="button" class="mini" data-act="clear">모두 비우기</button></div>
    <ol class="rt">
      <li class="node term"><span class="tm">${toHM(toMin(pl.t0))}</span><div><b>${esc(po.terminal.n)}</b><small>하선 · 출발</small></div></li>
      ${s.rows.map((r, i) => legHtml(r.leg, r.from, r.p.id) + `<li class="node" style="--c:${CATS[r.p.cat].c}"><span class="tm">${toHM(r.arr)}</span><span class="no">${i + 1}</span>
        <div><b>${esc(r.p.n)}</b><small>${CATS[r.p.cat].n}${r.p.hours ? " · " + esc(r.p.hours) : ""}</small>
          <div class="ctl"><span class="stepper sm"><button type="button" data-act="stay" data-id="${esc(r.p.id)}" data-d="-15" aria-label="머무는 시간 15분 줄이기">−</button><em>${dur(r.stay)} 머묾</em><button type="button" data-act="stay" data-id="${esc(r.p.id)}" data-d="15" aria-label="머무는 시간 15분 늘리기">＋</button></span>
            <span class="mv"><button type="button" data-act="up" data-id="${esc(r.p.id)}"${i === 0 ? " disabled" : ""} aria-label="앞으로">↑</button><button type="button" data-act="down" data-id="${esc(r.p.id)}"${i === s.rows.length - 1 ? " disabled" : ""} aria-label="뒤로">↓</button><button type="button" data-act="focus" data-id="${esc(r.p.id)}" aria-label="지도에서 보기">지도</button><button type="button" data-act="toggle" data-id="${esc(r.p.id)}" aria-label="빼기">빼기</button></span></div>
          <small class="capline${capOver(r.p) ? " over" : ""}">수용 ${esc(capText(r.p))}${capOver(r.p) ? " · 일행 " + pax() + "명은 나눠 입장·사전 문의" : ""}</small>
          ${r.p.tel ? `<a class="rtel" href="tel:${esc(r.p.tel.replace(/[^+\d]/g, ""))}">☎ ${esc(r.p.tel)}</a>` : ""}</div></li>`).join("")}
      ${legHtml(s.backLeg, s.backFrom, "T")}
      <li class="node term"><span class="tm">${toHM(s.back)}</span><div><b>${esc(po.terminal.n)}</b><small>귀선 · 마감 ${toHM(toMin(pl.t1))}</small></div></li>
    </ol>
    <div class="btns col"><a class="btn deep block" href="${dirUrl()}" target="_blank" rel="noopener">구글 지도 길찾기로 열기</a>
      <button type="button" class="btn out block" data-act="share">이 동선 링크 복사</button>
      <button type="button" class="btn pri block" data-tabgo="book">안내 책자 만들기</button></div>`;
}

/* ---------- 화면: 책자 ---------- */
const INFO = [["title", "책자 제목", "예) 후쿠오카 기항지 투어 안내"], ["group", "모임 이름", "예) ○○고 30회 동창회"], ["date", "날짜", "예) 2027년 4월 12일(월)"], ["ship", "배 이름", "예) 스펙트럼 오브 더 시즈"],
  ["guide", "인솔자", "예) 크루즈마스터 스칼렛"], ["gtel", "인솔자 연락처", "예) 010-0000-0000"], ["meet", "모이는 곳·시각", "예) 08:40 4층 로비"], ["note", "한마디", "예) 편한 신발, 여권 사본, 선내 카드 꼭 챙기세요"]];
function panebook(){
  const n = plan().stops.length, i = db.info;
  return `<div class="bookform"><p class="lead">표지와 연락처에 들어갈 내용을 적어 주세요. 비워 둔 칸은 책자에서 빠져요.</p>
    ${INFO.map(([k, l, ph]) => `<label>${l}<input type="text" id="bi-${k}" data-info="${k}" value="${esc(i[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}
    <label class="chk"><input type="checkbox" id="bi-qr" data-info="qr"${i.qr === false ? "" : " checked"}> 장소마다 구글 지도 QR 넣기</label>
    ${n ? `<button type="button" class="btn pri block" data-act="book">안내 책자 보기 · 인쇄</button><p class="hint">인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 보관하거나 카톡으로 보낼 수 있어요.</p>`
        : `<div class="empty"><b>동선을 먼저 짜 주세요</b><p>책자에는 내 동선에 담은 장소가 순서대로 들어가요.</p><button type="button" class="btn out block" data-tabgo="places">장소 고르러 가기</button></div>`}</div>`;
}
function qrSvg(url){ try{ const q = qrcode(0, "M"); q.addData(url); q.make(); return q.createSvgTag({ cellSize:2, margin:0, scalable:true }); }catch(e){ return ""; } }
function openBook(){
  const po = port(), pl = plan(), s = schedule(), i = db.info, title = i.title || po.n + " 기항지 투어 안내";
  const facts = [["날짜", i.date], ["배", i.ship], ["모이는 곳", i.meet], ["인솔자", [i.guide, i.gtel].filter(Boolean).join(" · ")]].filter(f => f[1]);
  const tl = [`<tr class="t"><td>${toHM(toMin(pl.t0))}</td><td>⚓</td><td><b>${esc(po.terminal.n)}</b> 하선 · 출발</td></tr>`]
    .concat(s.rows.map((r, k) => `<tr class="bmv"><td></td><td></td><td>${r.leg.mode} 약 ${dur(r.leg.min)}</td></tr><tr><td>${toHM(r.arr)}</td><td><span class="no" style="--c:${CATS[r.p.cat].c}">${k + 1}</span></td><td><b>${esc(r.p.n)}</b> <em>${CATS[r.p.cat].n} · ${dur(r.stay)}</em></td></tr>`))
    .concat([`<tr class="bmv"><td></td><td></td><td>${s.backLeg.mode} 약 ${dur(s.backLeg.min)}</td></tr><tr class="t"><td>${toHM(s.back)}</td><td>⚓</td><td><b>${esc(po.terminal.n)}</b> 귀선</td></tr>`]).join("");
  const cards = s.rows.map((r, k) => { const p = r.p, rows = [["전화", p.tel], ["수용", capText(p)], ["주소", p.addr], ["영업", p.hours], ["예산", p.price], ["예약", p.book], ["홈페이지", p.web && p.web.replace(/^https?:\/\//, "").replace(/\/$/, "")]].filter(x => x[1]);
    return `<section class="bcard"><div class="bno" style="--c:${CATS[p.cat].c}">${k + 1}</div><div class="bmain"><div class="btime">${toHM(r.arr)} 도착 · ${dur(r.stay)} · ${CATS[p.cat].n}</div><h3>${esc(p.n)}</h3>${p.en ? `<div class="en">${esc(p.en)}</div>` : ""}
      ${p.d ? `<p>${esc(p.d)}</p>` : ""}${p.pick ? `<p class="pick">${esc(p.pick)}</p>` : ""}<dl>${rows.map(x => `<div><dt>${x[0]}</dt><dd>${esc(x[1])}</dd></div>`).join("")}</dl></div>
      ${i.qr === false ? "" : `<div class="bqr">${qrSvg(gq(p))}<small>구글 지도</small></div>`}</section>`; }).join("");
  $("#book").innerHTML = `<div class="bbar"><button type="button" class="btn out" data-act="book-close">← 돌아가기</button><button type="button" class="btn pri" data-act="print">인쇄 · PDF로 저장</button></div>
  <div class="sheets">
    <div class="page cover"><div class="mark">ÉCLAT PASSAGE</div><div class="ceyebrow">Shore Excursion Guide</div><h1>${esc(title)}</h1>
      ${i.group ? `<p class="cgroup">${esc(i.group)}</p>` : ""}<p class="cport">${esc(po.n)}${po.c ? " · " + esc(po.c) : ""}</p>
      <div class="cbig"><div><small>하선</small><b>${toHM(toMin(pl.t0))}</b></div><div class="must"><small>귀선 마감</small><b>${toHM(toMin(pl.t1))}</b></div><div><small>들르는 곳</small><b>${pl.stops.length}곳</b></div></div>
      ${facts.length ? `<dl class="cfacts">${facts.map(f => `<div><dt>${f[0]}</dt><dd>${esc(f[1])}</dd></div>`).join("")}</dl>` : ""}
      ${i.note ? `<p class="cnote">${esc(i.note)}</p>` : ""}
      <div class="cfoot">크루즈마스터 스칼렛 · 기항지 투어 플래너</div></div>
    <div class="page"><h2>한눈에 보는 동선</h2><div id="bookmap"></div><p class="bfine">지도 © OpenStreetMap 기여자 · 번호는 들르는 순서</p>
      <table class="btl">${tl}</table></div>
    <div class="page flow"><h2>장소별 안내와 연락처</h2>${cards}
      <section class="bhelp"><h2>꼭 기억해 주세요</h2>
        <div class="taxi"><small>길을 잃었을 때 택시 기사님께 보여 주세요</small><b>Please take me to the cruise ship terminal.</b><span>${esc(po.terminal.en || po.terminal.n)}</span></div>
        <ul><li>귀선 마감 <b>${toHM(toMin(pl.t1))}</b>까지 배에 돌아와 있어야 해요. 배는 기다려 주지 않아요.</li>
          <li>선내 카드(승선 카드)와 여권 사본, 현지 통화${po.cur ? "(" + esc(po.cur) + ")" : ""}를 챙기세요.</li>
          ${po.emergency ? `<li>현지 긴급 전화: ${esc(po.emergency)}</li>` : ""}
          ${i.guide || i.gtel ? `<li>인솔자: ${esc([i.guide, i.gtel].filter(Boolean).join(" · "))}</li>` : ""}
          <li>일행 ${pax()}명 기준이에요. 수용 인원은 어림값이니 단체는 미리 전화로 확인하세요.</li>
          <li>선사 항구 대리점 연락처는 그날 선내 신문에 적혀 있어요. 사진으로 찍어 두세요.</li></ul>
        ${X().move.length ? `<h2 class="bmoveh">이동수단</h2><dl class="bmove">${X().move.map(m => `<div><dt>${esc(m.m)}</dt><dd>${esc(m.d)}</dd></div>`).join("")}</dl>` : ""}
        <p class="bfine">영업시간·요금은 바뀔 수 있어요. 이동 시간은 어림값이에요.</p></section></div>
  </div>`;
  $("#book").hidden = false; document.body.classList.add("booking"); $("#book").scrollTop = 0;
  if(bookMap){ bookMap.remove(); bookMap = null; }
  bookMap = L.map("bookmap", { zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false, touchZoom:false, boxZoom:false, keyboard:false });
  L.tileLayer(TILE, { maxZoom:19 }).addTo(bookMap);
  const T = po.terminal.ll, line = [T].concat(s.rows.map(r => r.p.ll), [T]);
  L.polyline(line, { color:"#04465A", weight:4, opacity:.8, dashArray:"1 9", lineCap:"round" }).addTo(bookMap);
  L.marker(T, { icon:anchorIcon(), interactive:false }).addTo(bookMap);
  s.rows.forEach((r, k) => L.marker(r.p.ll, { icon:pin(r.p, k + 1), interactive:false }).addTo(bookMap));
  bookMap.fitBounds(L.latLngBounds(line).pad(.15), { maxZoom:16, animate:false });
}
function closeBook(){ $("#book").hidden = true; document.body.classList.remove("booking"); if(bookMap){ bookMap.remove(); bookMap = null; } }

/* ---------- 직접 추가 (장소·기항지) ---------- */
let draft = null;
function sheet(html){ const s = $("#sheet"); s.innerHTML = `<div class="sbox" role="dialog" aria-modal="true">${html}</div>`; s.hidden = false; }
function closeSheet(){ $("#sheet").hidden = true; $("#sheet").innerHTML = ""; draft = null; stopPick(); }
function locHtml(){
  return `<div class="loc"><b>위치</b>
    <div class="locrow"><input type="text" id="f-q" placeholder="이름이나 주소로 찾기 (영문·현지어가 잘 찾아져요)"><button type="button" class="mini" data-act="geo">찾기</button></div>
    <div id="f-res"></div>
    <button type="button" class="mini" data-act="pick">지도에서 직접 찍기</button>
    <p id="f-ll" class="${draft.ll ? "ok" : ""}">${draft.ll ? "위치를 정했어요 (" + draft.ll.join(", ") + ")" : "아직 위치를 정하지 않았어요"}</p></div>`;
}
function placeForm(){
  draft = draft || { kind:"place", cat:"food", stay:60 };
  sheet(`<h2>내가 아는 장소 추가</h2><p class="lead">${esc(port().n)}에 추가돼요. 이 기기에 저장되고, 동선 링크로 함께 공유돼요.</p>
    <label>이름<input type="text" id="f-n" value="${esc(draft.n || "")}" placeholder="예) 단골 우동집"></label>
    <label>종류<select id="f-cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}"${draft.cat === k ? " selected" : ""}>${c.n}</option>`).join("")}</select></label>
    ${locHtml()}
    <label>전화번호<input type="text" id="f-tel" value="${esc(draft.tel || "")}" placeholder="예) +81-92-000-0000" inputmode="tel"></label>
    <label>홈페이지<input type="text" id="f-web" value="${esc(draft.web || "")}" placeholder="https://"></label>
    <label>메모<input type="text" id="f-d" value="${esc(draft.d || "")}" placeholder="무엇이 좋은지, 꼭 먹을 것 등"></label>
    <label>수용 인원(명, 모르면 비워 두세요)<input type="text" id="f-cap" value="${esc(draft.cap || "")}" inputmode="numeric"></label>
    <label>머무는 시간(분)<input type="text" id="f-stay" value="${esc(draft.stay)}" inputmode="numeric"></label>
    <div class="btns"><button type="button" class="btn out" data-act="sheet-close">취소</button><button type="button" class="btn pri" data-act="save-place">추가</button></div>`);
}
function portForm(){
  draft = draft || { kind:"port" };
  sheet(`<h2>다른 기항지 만들기</h2><p class="lead">목록에 없는 항구는 직접 만들 수 있어요. 배가 서는 터미널 위치만 정하면 돼요.</p>
    <label>기항지 이름<input type="text" id="f-n" value="${esc(draft.n || "")}" placeholder="예) 하코다테"></label>
    <label>나라<input type="text" id="f-c" value="${esc(draft.c || "")}" placeholder="예) 일본"></label>
    <label>터미널 이름<input type="text" id="f-tn" value="${esc(draft.tn || "")}" placeholder="예) 하코다테항 와카마쓰 부두"></label>
    ${locHtml()}
    <div class="btns"><button type="button" class="btn out" data-act="sheet-close">취소</button><button type="button" class="btn pri" data-act="save-port">만들기</button></div>`);
}
function readDraft(){ ["n", "c", "tn", "tel", "web", "d", "stay", "cat", "q", "cap"].forEach(k => { const el = $("#f-" + k); if(el) draft[k] = el.value.trim(); }); }
function reform(){ draft.kind === "port" ? portForm() : placeForm(); }
async function geocode(){
  readDraft(); const q = draft.q; if(!q){ toast("찾을 이름이나 주소를 적어 주세요."); return; }
  const res = $("#f-res"); res.innerHTML = '<p class="hint">찾는 중…</p>';
  let url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ko,en&q=" + encodeURIComponent(q);
  if(draft.kind === "place"){ const [a, b] = port().terminal.ll; url += `&viewbox=${b - .6},${a + .6},${b + .6},${a - .6}`; }
  try{
    const r = await fetch(url, { headers:{ Accept:"application/json" } }); if(!r.ok) throw 0;
    const list = await r.json();
    res.innerHTML = list.length ? list.map(x => `<button type="button" class="geo" data-act="geo-pick" data-lat="${esc(x.lat)}" data-lon="${esc(x.lon)}">${esc(x.display_name)}</button>`).join("")
      : '<p class="hint">찾지 못했어요. 영문 이름으로 다시 찾거나 지도에서 직접 찍어 주세요.</p>';
  }catch(e){ res.innerHTML = '<p class="hint">지금은 검색이 안 돼요. 지도에서 직접 찍어 주세요.</p>'; }
}
function setDraftLL(ll){ draft.ll = ll; reform(); if(map){ map.setView(ll, 15); } }
const t0i = el => el.dataset.i;
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/* ---------- 그리기 ---------- */
function renderPane(){
  document.querySelectorAll(".tabs button").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
  $("#cnt").textContent = plan().stops.length;
  $("#pane").innerHTML = { places:paneplaces, tours:panetours, route:paneroute, book:panebook }[tab]();
}
function render(fit){ renderPorts(); renderPane(); drawMap(fit); save(); }
function refresh(){ renderPane(); drawMap(false); save(); }

/* ---------- 이벤트 ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-act],[data-tab],[data-tabgo],[data-cat]"); if(!t) return;
  if(t.dataset.tab || t.dataset.tabgo){ tab = t.dataset.tab || t.dataset.tabgo; refresh(); if(t.dataset.tabgo) $(".tabs").scrollIntoView({ behavior:"smooth", block:"start" }); return; }
  if(t.dataset.cat){ catFilter = t.dataset.cat; refresh(); return; }
  const a = t.dataset.act, id = t.dataset.id, pl = plan();
  const idx = id ? pl.stops.findIndex(s => s.id === id) : -1;
  switch(a){
    case "toggle": {
      if(idx >= 0){ pl.stops.splice(idx, 1); toast("동선에서 뺐어요."); }
      else { const p = placeById(id); if(!p) return; pl.stops.push({ id, stay:p.stay || 60 }); const s = schedule(); toast(s.slack < 0 ? "담았어요. 다만 귀선 마감을 " + dur(-s.slack) + " 넘겨요." : "동선에 담았어요."); }
      map.closePopup(); refresh(); break; }
    case "focus": focusPlace(id); break;
    case "show": tab = "places"; catFilter = "all"; refresh(); map.closePopup(); { const el = document.getElementById("pc-" + id); if(el){ el.scrollIntoView({ behavior:"smooth", block:"center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } } break;
    case "copy": copy(t.dataset.text, "전화번호를 복사했어요."); break;
    case "stay": pl.stops[idx].stay = Math.max(15, Math.min(480, pl.stops[idx].stay + +t.dataset.d)); refresh(); break;
    case "leg": { const [f, to] = t.dataset.k.split(">"); pl.legs[t.dataset.k] = Math.max(1, leg(f, to).min + +t.dataset.d); refresh(); break; }
    case "up": case "down": { const j = idx + (a === "up" ? -1 : 1); if(j < 0 || j >= pl.stops.length) return; [pl.stops[idx], pl.stops[j]] = [pl.stops[j], pl.stops[idx]]; refresh(); break; }
    case "opt": optimize(); refresh(); toast("이동이 가장 짧은 순서로 정리했어요."); break;
    case "tour": { const tr = X().tours[+t0i(t)]; if(!tr) return; let n = 0; (tr.stops || []).forEach(sid => { const p = placeById(sid); if(p && !inPlan(sid)){ pl.stops.push({ id:sid, stay:p.stay || 60 }); n++; } });
      optimize(); tab = "route"; refresh(); drawMap(true); const sl = schedule().slack; toast(n ? (sl < 0 ? "담았어요. 다만 귀선 마감을 " + dur(-sl) + " 넘겨요." : n + "곳을 동선에 담았어요.") : "이미 모두 담겨 있어요."); break; }
    case "cap": { const p = placeById(id); if(!p) return; const c = capOf(p);
      sheet(`<h2>수용 인원 고치기</h2><p class="lead">${esc(p.n)} · 전화로 확인한 인원을 적어 두면 이 기기에 저장돼요. 야외·공공장소처럼 제한이 없으면 0을 적어 주세요.</p>
        <label>한 번에 함께 이용할 수 있는 인원(명)<input type="text" id="f-capv" inputmode="numeric" value="${c ? c.n : ""}"></label>
        <div class="btns"><button type="button" class="btn out" data-act="sheet-close">취소</button>${db.caps[id] != null ? `<button type="button" class="btn out" data-act="cap-reset" data-id="${esc(id)}">어림값으로 되돌리기</button>` : ""}<button type="button" class="btn pri" data-act="cap-save" data-id="${esc(id)}">저장</button></div>`); break; }
    case "cap-save": { const v = $("#f-capv").value.trim(); if(!/^\d{1,4}$/.test(v)){ toast("숫자로 적어 주세요."); return; } db.caps[id] = +v; closeSheet(); refresh(); toast("수용 인원을 저장했어요."); break; }
    case "cap-reset": delete db.caps[id]; closeSheet(); refresh(); break;
    case "auto": autoCourse(); tab = "route"; refresh(); drawMap(true); toast(pl.stops.length ? "시간에 맞는 코스를 담았어요. 마음대로 바꿔 보세요." : "시간 안에 들어가는 장소가 없어요. 시각을 확인해 주세요."); break;
    case "clear": pl.stops = []; pl.legs = {}; refresh(); toast("동선을 비웠어요."); break;
    case "share": copy(shareUrl(), "동선 링크를 복사했어요. 카톡에 붙여 넣어 보내세요."); break;
    case "book": openBook(); break;
    case "book-close": closeBook(); break;
    case "print": window.print(); break;
    case "new-place": draft = null; placeForm(); break;
    case "new-port": draft = null; portForm(); break;
    case "sheet-close": closeSheet(); break;
    case "geo": geocode(); break;
    case "geo-pick": readDraft(); setDraftLL([+(+t.dataset.lat).toFixed(5), +(+t.dataset.lon).toFixed(5)]); break;
    case "pick": readDraft(); startPick(ll => setDraftLL(ll)); break;
    case "pick-cancel": stopPick(); break;
    case "save-place": {
      readDraft(); if(!draft.n){ toast("이름을 적어 주세요."); return; } if(!draft.ll){ toast("위치를 정해 주세요. 찾기나 지도 찍기를 써 보세요."); return; }
      const web = draft.web && !/^https?:\/\//i.test(draft.web) ? "https://" + draft.web : draft.web;
      const p = { id:uid("c-"), custom:true, cat:draft.cat, n:draft.n, ll:draft.ll, d:draft.d || "", tel:draft.tel || null, web:web || null, cap:/^\d+$/.test(draft.cap || "") ? +draft.cap : null, stay:Math.max(15, Math.min(480, parseInt(draft.stay, 10) || 60)) };
      (db.custom[db.cur] || (db.custom[db.cur] = [])).push(p); closeSheet(); catFilter = "all"; tab = "places"; refresh(); toast("장소를 추가했어요."); break; }
    case "del-place": db.custom[db.cur] = (db.custom[db.cur] || []).filter(p => p.id !== id); refresh(); toast("장소를 지웠어요."); break;
    case "save-port": {
      readDraft(); if(!draft.n){ toast("기항지 이름을 적어 주세요."); return; } if(!draft.ll){ toast("터미널 위치를 정해 주세요."); return; }
      const pid = uid("my-"); db.ports[pid] = { n:draft.n, c:draft.c || "", custom:true, terminal:{ n:draft.tn || draft.n + " 크루즈 터미널", ll:draft.ll }, places:[] };
      db.cur = pid; closeSheet(); tab = "places"; catFilter = "all"; render(true); toast("기항지를 만들었어요. 이제 장소를 추가해 보세요."); break; }
    case "del-port": { const k = db.cur; delete db.ports[k]; delete db.plans[k]; delete db.custom[k]; db.cur = Object.keys(SHORE.ports)[0]; render(true); toast("기항지를 지웠어요."); break; }
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if(t.id === "portsel"){ db.cur = t.value; catFilter = "all"; render(true); }
  else if(t.id === "pax"){ const v = Math.max(1, Math.min(999, parseInt(t.value, 10) || 1)); plan().pax = v; refresh(); }
  else if(t.id === "t0" || t.id === "t1"){ if(t.value){ plan()[t.id] = t.value; refresh(); } }
  else if(t.dataset.info === "qr"){ db.info.qr = t.checked; save(); }
});
document.addEventListener("input", e => { const k = e.target.dataset && e.target.dataset.info; if(k && k !== "qr"){ db.info[k] = e.target.value; save(); } });
document.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.id === "f-q"){ e.preventDefault(); geocode(); }
  if(e.key === "Escape"){ if(picking) stopPick(); else if(!$("#sheet").hidden) closeSheet(); else if(!$("#book").hidden) closeBook(); }
});

/* ---------- 시작 ---------- */
(function start(){
  const shared = openShared();
  const first = !db.cur;
  if(!db.cur || !allPorts()[db.cur]) db.cur = Object.keys(SHORE.ports)[0];
  initMap();
  if(first && !shared) autoCourse();   // 처음엔 예시 코스를 담아 보여 줌
  render(true);
  if(shared) toast("공유받은 동선을 열었어요.");
  else if(first && plan().stops.length) toast("예시 코스를 담아 두었어요. 마음대로 바꿔 보세요.");
})();
