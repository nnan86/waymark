import { useState, useEffect } from "react";

/* ══════════════════════════════════════
   waymark.
   It simply remembers.
   ══════════════════════════════════════ */

const SK = "waymark-v20";
const uid = () => crypto.randomUUID();
const todayStr = () => new Date().toISOString().split("T")[0];
const nowT = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/* ─── Design Tokens ─── */
const F = "'Outfit', 'Helvetica Neue', sans-serif";
const C = { bg: "#1e1d1b", bg2: "#252422", hi: "#e8e4db", tx: "#c8c3b8", mu: "#9e9a95", fa: "#6e6a66", dot: "#c8a87c" };

/* ─── Currency ─── */
const CURS = [
  { code: "INR", symbol: "₹" },{ code: "USD", symbol: "$" },{ code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },{ code: "THB", symbol: "฿" },{ code: "JPY", symbol: "¥" },
  { code: "AUD", symbol: "A$" },{ code: "SGD", symbol: "S$" },{ code: "AED", symbol: "د.إ" },{ code: "MYR", symbol: "RM" },
];
const sym = (c) => CURS.find(x => x.code === c)?.symbol || c;
const fmt = (n, c = "INR") => (!n || n === 0) ? "—" : `${sym(c)}${Number(n).toLocaleString("en-IN")}`;

/* ─── Time helpers ─── */
const to12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "pm" : "am"}`; };
const timeNarr = (t) => {
  if (!t) return ""; const h = parseInt(t.split(":")[0]);
  if (h < 6) return "before dawn"; if (h < 9) return "early morning"; if (h < 12) return "in the morning";
  if (h < 14) return "around midday"; if (h < 17) return "in the afternoon"; if (h < 20) return "in the evening"; return "at night";
};
const nw = (n) => ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve"][n] || String(n);
const fmtD = (d) => {
  if (d === todayStr()) return "Today";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d === y.toISOString().split("T")[0]) return "Yesterday";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long" });
};
const fmtDL = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

const CATS = ["EV Charging", "Toll", "Food & Drink", "Fuel", "Stay", "Scenic Stop", "Shopping", "Parking", "Other"];

/* ─── Reverse Geocode ─── */
async function rGeo(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=1`, { headers: { "Accept-Language": "en" } });
    const d = await r.json(); const a = d.address || {};
    return { place: a.amenity || a.shop || a.building || a.road || a.neighbourhood || d.name || "", area: [a.suburb || a.village || a.town || "", a.city || a.state_district || ""].filter(Boolean).join(", ") };
  } catch { return { place: "", area: "" }; }
}

/* ─── Settlement Calculator ─── */
function calcSettlements(stops, members, currency) {
  if (!members || members.length < 2) return { paid: {}, owes: {}, transfers: [] };
  const paid = {}; const owes = {};
  members.forEach(m => { paid[m] = 0; owes[m] = 0; });
  stops.forEach(s => {
    if (!s.amount || s.amount <= 0) return;
    const payer = s.addedBy || members[0];
    if (paid[payer] !== undefined) paid[payer] += s.amount;
    const splitAmong = (s.splitBetween && s.splitBetween.length > 0) ? s.splitBetween : members;
    const share = s.amount / splitAmong.length;
    splitAmong.forEach(m => { if (owes[m] !== undefined) owes[m] += share; });
  });
  const net = {};
  members.forEach(m => { net[m] = paid[m] - owes[m]; });
  const debtors = []; const creditors = [];
  members.forEach(m => {
    if (net[m] < -0.5) debtors.push({ name: m, amount: -net[m] });
    if (net[m] > 0.5) creditors.push({ name: m, amount: net[m] });
  });
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const amt = Math.min(debtors[di].amount, creditors[ci].amount);
    if (amt > 0.5) transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount: Math.round(amt) });
    debtors[di].amount -= amt; creditors[ci].amount -= amt;
    if (debtors[di].amount < 0.5) di++;
    if (creditors[ci].amount < 0.5) ci++;
  }
  return { paid, owes, transfers };
}

/* ─── Demo Data ─── */
const mkDemo = () => {
  const d1 = new Date(); d1.setDate(d1.getDate() - 1); const d1s = d1.toISOString().split("T")[0];
  const d5 = new Date(); d5.setDate(d5.getDate() - 8); const d5s = d5.toISOString().split("T")[0];
  const d6 = new Date(); d6.setDate(d6.getDate() - 9); const d6s = d6.toISOString().split("T")[0];
  return [
    {
      id: uid(), from: "Hyderabad", to: "Bengaluru", startDate: d1s, currency: "INR", note: "",
      group: { name: "Bengaluru Trip", code: "BLURU1", members: ["Naveen", "Rahul", "Priya"] },
      stops: [
        { id: uid(), name: "Tata EV Station", note: "Quick charge near the highway exit.", category: "EV Charging", amount: 280, date: d1s, time: "07:45", area: "Shamshabad", lat: 17.24, lng: 78.43, addedBy: "Naveen", splitBetween: [] },
        { id: uid(), name: "Lepakshi Temple", note: "A peaceful stop with ancient stone carvings.", category: "Scenic Stop", amount: 0, date: d1s, time: "09:20", area: "Lepakshi, AP", lat: 15.98, lng: 77.61, addedBy: "Priya", splitBetween: [] },
        { id: uid(), name: "Penukonda Toll", note: "NH44 toll booth.", category: "Toll", amount: 185, date: d1s, time: "10:05", area: "Penukonda", lat: 14.98, lng: 77.59, addedBy: "Naveen", splitBetween: [] },
        { id: uid(), name: "Highway Coffee House", note: "A good place to pause for tea.", category: "Food & Drink", amount: 420, date: d1s, time: "11:30", area: "Anantapur Highway", lat: 14.68, lng: 77.60, addedBy: "Rahul", splitBetween: [] },
        { id: uid(), name: "Electronic City Toll", note: "", category: "Toll", amount: 120, date: d1s, time: "15:40", area: "Bengaluru", lat: 12.85, lng: 77.67, addedBy: "Naveen", splitBetween: [] },
      ],
    },
    {
      id: uid(), from: "Hyderabad", to: "Srisailam", startDate: d5s, currency: "INR",
      note: "A weekend escape to the ghats.",
      group: null,
      stops: [
        { id: uid(), name: "Ather Grid", note: "Charged while having breakfast.", category: "EV Charging", amount: 150, date: d5s, time: "06:30", area: "Shamshabad", lat: 17.24, lng: 78.43, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Amrabad Tiger Reserve", note: "Entry fee. Spotted a few langurs.", category: "Scenic Stop", amount: 200, date: d5s, time: "09:15", area: "Amrabad", lat: 16.38, lng: 78.84, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Srisailam Dam", note: "Water thundering through the gates.", category: "Scenic Stop", amount: 0, date: d5s, time: "11:00", area: "Srisailam", lat: 15.85, lng: 78.87, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Temple Canteen", note: "Simple thali. Surprisingly good.", category: "Food & Drink", amount: 160, date: d6s, time: "12:30", area: "Srisailam Temple", lat: 15.86, lng: 78.87, addedBy: "You", splitBetween: [] },
      ],
    },
  ];
};

/* ─── Shared Components ─── */
const Rule = ({ m = "0" }) => <div style={{ height: 1, background: "rgba(200,195,185,0.08)", margin: m }} />;
const Logo = ({ size = 28, s }) => <span style={{ fontFamily: F, fontSize: size, fontWeight: 600, letterSpacing: 1.5, color: C.hi, ...s }}>waymark<span style={{ color: C.dot }}>.</span></span>;
const Back = ({ onClick }) => <button onClick={onClick} style={{ fontFamily: F, fontSize: 12, color: C.mu, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.5, fontWeight: 500 }}>← Back</button>;
const Btn = ({ children, onClick, disabled, small }) => <button onClick={onClick} disabled={disabled} style={{ fontFamily: F, fontSize: small ? 11 : 13, fontWeight: 600, letterSpacing: 1.8, textTransform: "uppercase", color: disabled ? C.fa : C.hi, background: "transparent", border: `1px solid ${disabled ? C.fa : C.mu}`, borderRadius: 0, padding: small ? "9px 20px" : "14px 36px", cursor: disabled ? "default" : "pointer" }}>{children}</button>;
const Lbl = ({ children }) => <label style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.mu, display: "block", marginBottom: 10 }}>{children}</label>;
const Inp = ({ large, ...p }) => <input {...p} style={{ width: "100%", fontFamily: F, fontSize: large ? 22 : 15, fontWeight: large ? 500 : 400, color: C.hi, background: "transparent", border: "none", borderBottom: `1px solid ${C.fa}`, borderRadius: 0, padding: "8px 0 12px", outline: "none", boxSizing: "border-box", letterSpacing: large ? 0.5 : 0.3, ...(p.style || {}) }} />;

const css = `*{box-sizing:border-box;margin:0;padding:0}input::placeholder{color:rgba(158,154,149,0.5)}input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}input[type=number]{-moz-appearance:textfield}select{appearance:none;-webkit-appearance:none}textarea::placeholder{color:rgba(158,154,149,0.5)}::-webkit-scrollbar{display:none}button:active{opacity:0.7}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fadeIn 0.35s ease both}`;

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
export default function Waymark() {
  /* ALL hooks declared at the top — never conditional */
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [obStep, setObStep] = useState(0);
  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [editStopId, setEditStopId] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [nj, setNj] = useState({ from: "", to: "", date: todayStr(), currency: "INR", groupName: "", myName: "", isGroup: false });
  const [ns, setNs] = useState({ name: "", note: "", category: "Food & Drink", amount: "", date: todayStr(), time: nowT(), lat: null, lng: null, area: "", splitBetween: [] });
  const [joinData, setJoinData] = useState({ code: "", name: "" });
  const [addMember, setAddMember] = useState("");

  useEffect(() => {
    (async () => {
      try { const ob = await window.storage.get("wm-ob-v3"); if (ob?.value === "1") setOnboarded(true); } catch {}
      try { const r = await window.storage.get(SK); setJourneys(r?.value ? JSON.parse(r.value) : mkDemo()); } catch { setJourneys(mkDemo()); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (!loading) window.storage.set(SK, JSON.stringify(journeys)).catch(() => {}); }, [journeys, loading]);

  /* ─── Derived ─── */
  const j = journeys.find(x => x.id === activeId);
  const jT = (j) => j.stops.reduce((s, st) => s + (st.amount || 0), 0);
  const isGrp = j?.group != null;
  const members = j?.group?.members || [];

  const jNarr = (j) => {
    const n = j.stops.length; if (!n) return "No stops yet.";
    const total = jT(j); const first = j.stops[0]?.time; const last = j.stops[n - 1]?.time;
    const days = [...new Set(j.stops.map(s => s.date))].length;
    let t = `You made ${nw(n)} ${n === 1 ? "stop" : "stops"} along the way.`;
    if (total > 0) t += ` You spent ${fmt(total, j.currency)} in total.`;
    if (first && last && days === 1) t += `\nYou set out ${timeNarr(first)} and arrived ${timeNarr(last)}.`;
    else if (days > 1) t += `\nThe journey spanned ${nw(days)} days.`;
    if (j.group) t += `\n${j.group.members.length} travellers.`;
    return t;
  };

  const stopsByDay = (j) => {
    const g = {}; j.stops.forEach(s => { const d = s.date || j.startDate; if (!g[d]) g[d] = []; g[d].push(s); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  };

  const catBreak = (j) => {
    const m = {}; j.stops.forEach(s => { if (s.amount > 0) m[s.category] = (m[s.category] || 0) + s.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  /* ─── Actions ─── */
  const resetNs = () => setNs({ name: "", note: "", category: "Food & Drink", amount: "", date: todayStr(), time: nowT(), lat: null, lng: null, area: "", splitBetween: [] });

  const createJourney = () => {
    if (!nj.from.trim() || !nj.to.trim()) return;
    const group = nj.isGroup && nj.groupName.trim() && nj.myName.trim()
      ? { name: nj.groupName.trim(), code: genCode(), members: [nj.myName.trim()] } : null;
    const newJ = { id: uid(), from: nj.from.trim(), to: nj.to.trim(), startDate: nj.date, currency: nj.currency, note: "", group, stops: [] };
    setJourneys(p => [newJ, ...p]); setActiveId(newJ.id);
    setNj({ from: "", to: "", date: todayStr(), currency: "INR", groupName: "", myName: "", isGroup: false });
    setScreen("journey");
  };

  const joinGroup = () => {
    if (!joinData.code.trim() || !joinData.name.trim()) return;
    const found = journeys.find(j => j.group?.code?.toUpperCase() === joinData.code.toUpperCase());
    if (found) {
      if (!found.group.members.includes(joinData.name.trim())) {
        setJourneys(p => p.map(j => j.id === found.id ? { ...j, group: { ...j.group, members: [...j.group.members, joinData.name.trim()] } } : j));
      }
      setActiveId(found.id); setScreen("journey");
    }
    setJoinData({ code: "", name: "" });
  };

  const addMemberToGroup = () => {
    if (!addMember.trim() || !j?.group) return;
    if (!j.group.members.includes(addMember.trim())) {
      setJourneys(p => p.map(x => x.id === activeId ? { ...x, group: { ...x.group, members: [...x.group.members, addMember.trim()] } } : x));
    }
    setAddMember("");
  };

  const captureLocation = async () => {
    if (!navigator.geolocation) return; setGeoLoading(true);
    try {
      const pos = await new Promise((r, j) => navigator.geolocation.getCurrentPosition(r, j, { enableHighAccuracy: true, timeout: 10000 }));
      const geo = await rGeo(pos.coords.latitude, pos.coords.longitude);
      setNs(p => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude, name: p.name || geo.place, area: geo.area }));
    } catch {} setGeoLoading(false);
  };

  const addStop = () => {
    if (!ns.name.trim()) return;
    const myName = j?.group?.members?.[0] || "You";
    const stop = { id: uid(), name: ns.name.trim(), note: ns.note.trim(), category: ns.category, amount: parseInt(ns.amount) || 0, date: ns.date, time: ns.time, area: ns.area, lat: ns.lat, lng: ns.lng, addedBy: myName, splitBetween: ns.splitBetween.length > 0 && ns.splitBetween.length < members.length ? ns.splitBetween : [] };
    setJourneys(p => p.map(x => x.id === activeId ? { ...x, stops: [...x.stops, stop] } : x));
    resetNs(); setScreen("journey");
  };

  const saveEdit = () => {
    if (!ns.name.trim()) return;
    setJourneys(p => p.map(x => x.id === activeId ? {
      ...x, stops: x.stops.map(s => s.id === editStopId ? { ...s, name: ns.name.trim(), note: ns.note.trim(), category: ns.category, amount: parseInt(ns.amount) || 0, date: ns.date, time: ns.time, area: ns.area, lat: ns.lat || s.lat, lng: ns.lng || s.lng, splitBetween: ns.splitBetween.length > 0 && ns.splitBetween.length < members.length ? ns.splitBetween : [] } : s)
    } : x));
    setEditStopId(null); resetNs(); setScreen("journey");
  };

  const removeStop = (sid) => { setJourneys(p => p.map(x => x.id === activeId ? { ...x, stops: x.stops.filter(s => s.id !== sid) } : x)); setDelConfirm(null); };
  const deleteJourney = () => { setJourneys(p => p.filter(x => x.id !== activeId)); setActiveId(null); setScreen("home"); };
  const updateNote = (note) => { setJourneys(p => p.map(x => x.id === activeId ? { ...x, note } : x)); };

  const openEdit = (stop) => {
    setEditStopId(stop.id);
    setNs({ name: stop.name, note: stop.note || "", category: stop.category, amount: stop.amount ? String(stop.amount) : "", date: stop.date, time: stop.time || nowT(), lat: stop.lat, lng: stop.lng, area: stop.area || "", splitBetween: stop.splitBetween || [] });
    setScreen("editStop");
  };

  const copyCode = () => {
    if (j?.group) {
      navigator.clipboard?.writeText(`Join my Waymark journey "${j.from} → ${j.to}"!\nGroup: ${j.group.name}\nCode: ${j.group.code}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleSplit = (name) => {
    setNs(p => {
      const sb = p.splitBetween.includes(name) ? p.splitBetween.filter(n => n !== name) : [...p.splitBetween, name];
      return { ...p, splitBetween: sb };
    });
  };

  const finishOb = () => { setOnboarded(true); window.storage.set("wm-ob-v3", "1").catch(() => {}); };

  /* ─── Wrapper ─── */
  const fl = <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />;
  const W = (ch) => <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, color: C.tx }}>{fl}{ch}<style>{css}</style></div>;

  /* ═══ LOADING ═══ */
  if (loading) return W(
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Logo size={24} s={{ opacity: 0.4 }} />
    </div>
  );

  /* ═══ ONBOARDING ═══ */
  if (!onboarded) {
    const slides = [
      { top: "waymark.", body: "remembers your journeys —\nwhere you went, what you spent,\nand what the day was like." },
      { top: "travel together", body: "share a journey with friends.\ntrack expenses as a group.\nsettle up when you're home." },
      { top: "look back", body: "on your trips\nlike flipping through\na travel diary." },
    ];
    const s = slides[obStep];
    return W(
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div className="fi" key={obStep} style={{ textAlign: "center", maxWidth: 320 }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: C.hi, letterSpacing: 1.5, marginBottom: 24 }}>
            {s.top === "waymark." ? <Logo size={32} /> : s.top}
          </h1>
          <p style={{ fontSize: 16, fontWeight: 300, color: C.mu, lineHeight: 1.8, whiteSpace: "pre-line", letterSpacing: 0.3 }}>{s.body}</p>
        </div>
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", gap: 8 }}>{slides.map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i === obStep ? C.dot : C.fa }} />)}</div>
          <Btn onClick={() => obStep < 2 ? setObStep(obStep + 1) : finishOb()}>{obStep < 2 ? "Continue" : "Begin"}</Btn>
        </div>
      </div>
    );
  }

  /* ═══ HOME ═══ */
  if (screen === "home") return W(
    <div>
      <div style={{ padding: "44px 0 0", textAlign: "center" }}><Logo size={28} /></div>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "28px 0 0", flexWrap: "wrap" }}>
        <Btn onClick={() => setScreen("newJourney")}>New journey</Btn>
        <Btn onClick={() => setScreen("joinGroup")}>Join group</Btn>
      </div>
      <Rule m="28px 40px 0" />
      <div style={{ padding: "0 28px", maxWidth: 520, margin: "0 auto" }}>
        {journeys.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p style={{ fontSize: 17, fontWeight: 300, color: C.mu }}>No journeys yet.</p>
            <p style={{ fontSize: 12, color: C.fa, marginTop: 12 }}>Start a journey or join a friend's group.</p>
          </div>
        ) : journeys.map(jrn => {
          const isExp = expanded === jrn.id;
          return (
            <div key={jrn.id} style={{ padding: "20px 0 0" }}>
              <div onClick={() => setExpanded(isExp ? null : jrn.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 500, color: C.hi, margin: 0, letterSpacing: 0.6, lineHeight: 1.3 }}>
                    {jrn.from} <span style={{ fontWeight: 300, color: C.fa }}>→</span> {jrn.to}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: C.mu }}>{fmtD(jrn.startDate)}</span>
                    {jrn.group && <><span style={{ fontSize: 11, color: C.fa }}>·</span><span style={{ fontSize: 11, fontWeight: 500, color: C.dot }}>{jrn.group.name}</span></>}
                    {jT(jrn) > 0 && <><span style={{ fontSize: 11, color: C.fa }}>·</span><span style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>{fmt(jT(jrn), jrn.currency)}</span></>}
                  </div>
                </div>
                <span style={{ fontSize: 14, color: C.fa, fontWeight: 300, marginLeft: 12, transition: "transform 0.2s", transform: isExp ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
              </div>
              {isExp && (
                <div className="fi" style={{ paddingTop: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 400, color: C.mu, lineHeight: 1.7, whiteSpace: "pre-line" }}>{jNarr(jrn)}</p>
                  <div style={{ marginTop: 14 }}>
                    <button onClick={() => { setActiveId(jrn.id); setScreen("journey"); setShowSettle(false); }} style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.dot, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.8 }}>
                      Open journey →
                    </button>
                  </div>
                </div>
              )}
              <Rule m="20px 0 0" />
            </div>
          );
        })}
      </div>
      <div style={{ height: 60 }} />
    </div>
  );

  /* ═══ JOIN GROUP ═══ */
  if (screen === "joinGroup") return W(
    <div>
      <div style={{ padding: "24px 28px 0" }}><Back onClick={() => setScreen("home")} /></div>
      <div style={{ padding: "44px 28px 0", maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 300, color: C.hi, margin: "0 0 44px" }}>Join a journey</h2>
        <div style={{ marginBottom: 28, textAlign: "left" }}><Lbl>Group code</Lbl>
          <Inp large placeholder="BLURU1" value={joinData.code} onChange={e => setJoinData({ ...joinData, code: e.target.value.toUpperCase() })} style={{ fontFamily: "monospace", letterSpacing: 4, textAlign: "center" }} />
        </div>
        <div style={{ marginBottom: 44, textAlign: "left" }}><Lbl>Your name</Lbl>
          <Inp large placeholder="Rahul" value={joinData.name} onChange={e => setJoinData({ ...joinData, name: e.target.value })} />
        </div>
        <Btn onClick={joinGroup} disabled={!joinData.code.trim() || !joinData.name.trim()}>Join</Btn>
      </div>
    </div>
  );

  /* ═══ NEW JOURNEY ═══ */
  if (screen === "newJourney") return W(
    <div>
      <div style={{ padding: "24px 28px 0" }}><Back onClick={() => setScreen("home")} /></div>
      <div style={{ padding: "44px 28px 0", maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 300, color: C.hi, margin: "0 0 40px" }}>Begin a journey</h2>
        <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>From</Lbl><Inp large placeholder="Hyderabad" value={nj.from} onChange={e => setNj({ ...nj, from: e.target.value })} /></div>
        <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>To</Lbl><Inp large placeholder="Bengaluru" value={nj.to} onChange={e => setNj({ ...nj, to: e.target.value })} /></div>
        <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>Date</Lbl><Inp value={nj.date} onChange={e => setNj({ ...nj, date: e.target.value })} type="date" style={{ colorScheme: "dark" }} /></div>
        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <Lbl>Currency</Lbl>
          <select value={nj.currency} onChange={e => setNj({ ...nj, currency: e.target.value })}
            style={{ width: "100%", fontFamily: F, fontSize: 15, fontWeight: 400, color: C.hi, background: "transparent", border: "none", borderBottom: `1px solid ${C.fa}`, padding: "8px 0 12px", outline: "none", cursor: "pointer" }}>
            {CURS.map(c => <option key={c.code} value={c.code} style={{ background: C.bg2 }}>{c.symbol} {c.code}</option>)}
          </select>
        </div>
        <Rule m="8px 0 24px" />
        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <button onClick={() => setNj({ ...nj, isGroup: !nj.isGroup })} style={{
            fontFamily: F, fontSize: 13, fontWeight: 500, color: nj.isGroup ? C.dot : C.mu,
            background: nj.isGroup ? `${C.dot}15` : "transparent",
            border: `1px solid ${nj.isGroup ? C.dot : C.fa}`, borderRadius: 0,
            padding: "10px 20px", cursor: "pointer", letterSpacing: 0.5, width: "100%", textAlign: "center",
          }}>
            {nj.isGroup ? "Travelling with a group ✓" : "Travelling with friends?"}
          </button>
        </div>
        {nj.isGroup && (
          <div className="fi">
            <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>Group name</Lbl><Inp placeholder="Sikkim Trip" value={nj.groupName} onChange={e => setNj({ ...nj, groupName: e.target.value })} /></div>
            <div style={{ marginBottom: 28, textAlign: "left" }}><Lbl>Your name</Lbl><Inp placeholder="Naveen" value={nj.myName} onChange={e => setNj({ ...nj, myName: e.target.value })} /></div>
          </div>
        )}
        <div style={{ paddingTop: 8 }}>
          <Btn onClick={createJourney} disabled={!nj.from.trim() || !nj.to.trim() || (nj.isGroup && (!nj.groupName.trim() || !nj.myName.trim()))}>Begin</Btn>
        </div>
      </div>
      <div style={{ height: 60 }} />
    </div>
  );

  /* ═══ JOURNEY DETAIL ═══ */
  if (screen === "journey" && j) {
    const total = jT(j);
    const days = stopsByDay(j);
    const cats = catBreak(j);
    const sett = isGrp ? calcSettlements(j.stops, members, j.currency) : null;

    return W(
      <div>
        <div style={{ padding: "24px 28px 0" }}><Back onClick={() => { setScreen("home"); setActiveId(null); }} /></div>
        <div style={{ padding: "28px 28px 0", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: C.mu, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>Along the way</div>
          <h2 style={{ fontSize: 26, fontWeight: 500, color: C.hi, margin: "0 0 6px", letterSpacing: 0.8 }}>
            {j.from} <span style={{ fontWeight: 300, color: C.fa }}>→</span> {j.to}
          </h2>
          <p style={{ fontSize: 12, color: C.mu, letterSpacing: 0.3, fontWeight: 400 }}>{fmtDL(j.startDate)}</p>
          {total > 0 && (
            <p style={{ fontSize: 28, fontWeight: 600, color: C.hi, margin: "16px 0 0", letterSpacing: 0.5 }}>
              {fmt(total, j.currency)}
              <span style={{ fontSize: 10, color: C.mu, marginLeft: 8, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>total</span>
              {isGrp && <span style={{ fontSize: 10, color: C.fa, marginLeft: 4 }}>· {fmt(Math.round(total / members.length), j.currency)} each</span>}
            </p>
          )}
          {isGrp && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {members.map((m, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", border: `1px solid ${C.fa}`, color: C.tx, letterSpacing: 0.3 }}>{m}</span>)}
              </div>
              <button onClick={copyCode} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: copied ? C.dot : C.mu, background: "none", border: "none", cursor: "pointer", letterSpacing: 0.5 }}>
                {copied ? "Copied!" : `Share code: ${j.group.code}`}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 28px 0", maxWidth: 520, margin: "0 auto" }}>
          <textarea value={j.note} onChange={e => updateNote(e.target.value)} placeholder="Add a note about this journey..." rows={2}
            style={{ width: "100%", fontFamily: F, fontSize: 13, fontWeight: 300, fontStyle: "italic", color: C.mu, background: "transparent", border: "none", outline: "none", resize: "vertical", lineHeight: 1.7, padding: 0, boxSizing: "border-box", textAlign: "center" }} />
        </div>

        <Rule m="20px 28px 0" />

        {isGrp && (
          <div style={{ padding: "16px 28px 0", maxWidth: 520, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Inp placeholder="Add a traveller..." value={addMember} onChange={e => setAddMember(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addMemberToGroup(); }}
                style={{ flex: 1, fontSize: 13, borderBottom: `1px solid ${C.fa}` }} />
              <Btn small onClick={addMemberToGroup} disabled={!addMember.trim()}>Add</Btn>
            </div>
          </div>
        )}

        <div style={{ padding: "0 28px", maxWidth: 520, margin: "0 auto" }}>
          {j.stops.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <p style={{ fontSize: 16, fontWeight: 300, color: C.mu }}>No stops recorded yet.</p>
            </div>
          ) : days.map(([date, stops], di) => (
            <div key={date}>
              {days.length > 1 && (
                <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.dot, letterSpacing: 2, textTransform: "uppercase" }}>{fmtDay(date)}</span>
                </div>
              )}
              {stops.map((stop, i) => (
                <div key={stop.id} style={{ padding: `${di === 0 && i === 0 && days.length <= 1 ? 22 : 16}px 0 0` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                    <h3 onClick={() => openEdit(stop)} style={{ fontSize: 18, fontWeight: 600, color: C.hi, margin: 0, lineHeight: 1.3, flex: 1, cursor: "pointer", letterSpacing: 0.3 }}>{stop.name}</h3>
                    <span style={{ fontSize: 16, fontWeight: 600, color: C.hi, flexShrink: 0, letterSpacing: 0.5 }}>{fmt(stop.amount, j.currency)}</span>
                  </div>
                  {stop.note && <p style={{ fontSize: 13, fontWeight: 400, color: C.mu, margin: "5px 0 0", lineHeight: 1.6 }}>{stop.note}</p>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 7 }}>
                    <p style={{ fontSize: 11, color: C.fa, letterSpacing: 0.5, margin: 0, fontWeight: 500 }}>
                      {[to12(stop.time), stop.category, stop.area, isGrp && stop.addedBy ? `by ${stop.addedBy}` : null, stop.splitBetween?.length > 0 ? `split ${stop.splitBetween.length}` : null].filter(Boolean).join("  ·  ")}
                    </p>
                    {delConfirm === stop.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => removeStop(stop.id)} style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: "#a87060", background: "none", border: "1px solid #a87060", padding: "3px 10px", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase" }}>Remove</button>
                        <button onClick={() => setDelConfirm(null)} style={{ fontFamily: F, fontSize: 10, color: C.fa, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDelConfirm(stop.id)} style={{ fontFamily: F, fontSize: 11, color: C.fa, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 300 }}>×</button>
                    )}
                  </div>
                  <Rule m="16px 0 0" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {cats.length > 0 && (
          <div style={{ padding: "18px 28px 0", maxWidth: 520, margin: "0 auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.mu, marginBottom: 10 }}>Breakdown</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cats.map(([cat, amt], i) => (
                <span key={cat} style={{ fontSize: 13, fontWeight: 400, color: C.tx }}>
                  {cat} <span style={{ fontWeight: 600 }}>{fmt(amt, j.currency)}</span>{i < cats.length - 1 ? <span style={{ color: C.fa, margin: "0 8px" }}>·</span> : ""}
                </span>
              ))}
            </div>
            <Rule m="18px 0 0" />
          </div>
        )}

        {isGrp && sett && (
          <div style={{ padding: "18px 28px 0", maxWidth: 520, margin: "0 auto" }}>
            <button onClick={() => setShowSettle(!showSettle)} style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.dot, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: showSettle ? 14 : 0 }}>
              {showSettle ? "Hide settlements ↑" : "View settlements ↓"}
            </button>
            {showSettle && (
              <div className="fi">
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.mu, marginBottom: 8 }}>Who paid</p>
                  {members.map(m => <p key={m} style={{ fontSize: 14, fontWeight: 400, color: C.tx, lineHeight: 1.8 }}>{m} paid <span style={{ fontWeight: 600 }}>{fmt(sett.paid[m], j.currency)}</span></p>)}
                </div>
                {sett.transfers.length > 0 ? (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.mu, marginBottom: 8 }}>To settle up</p>
                    {sett.transfers.map((t, i) => <p key={i} style={{ fontSize: 15, fontWeight: 500, color: C.hi, lineHeight: 1.9 }}>{t.from} owes {t.to} <span style={{ fontWeight: 600, color: C.dot }}>{fmt(t.amount, j.currency)}</span></p>)}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, fontWeight: 400, color: C.mu, fontStyle: "italic" }}>All settled up.</p>
                )}
                <Rule m="18px 0 0" />
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", padding: "28px 0 18px" }}>
          <Btn onClick={() => { resetNs(); setNs(p => ({ ...p, date: j.startDate })); setScreen("newStop"); }}>Add a stop</Btn>
        </div>
        <div style={{ textAlign: "center", paddingBottom: 60 }}>
          <button onClick={deleteJourney} style={{ fontFamily: F, fontSize: 11, fontWeight: 500, color: C.fa, background: "none", border: "none", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase", padding: "8px 16px" }}>Delete journey</button>
        </div>
      </div>
    );
  }

  /* ═══ NEW / EDIT STOP ═══ */
  if (screen === "newStop" || screen === "editStop") {
    const isEdit = screen === "editStop";
    return W(
      <div>
        <div style={{ padding: "24px 28px 0" }}><Back onClick={() => { setScreen("journey"); setEditStopId(null); }} /></div>
        <div style={{ padding: "36px 28px 0", maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <h2 style={{ fontSize: 24, fontWeight: 300, color: C.hi }}>{isEdit ? "Edit stop" : "Record a stop"}</h2>
          </div>

          <div style={{ marginBottom: 22, textAlign: "center" }}>
            {ns.lat ? (
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: C.dot, marginBottom: 4 }}>{ns.area || "Location captured"}</p>
                <button onClick={() => setNs({ ...ns, lat: null, lng: null, area: "" })} style={{ fontFamily: F, fontSize: 11, color: C.fa, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ) : (
              <Btn small onClick={captureLocation} disabled={geoLoading}>{geoLoading ? "Locating..." : "Capture location"}</Btn>
            )}
          </div>

          <Rule m="0 0 22px" />

          <div style={{ marginBottom: 20, textAlign: "left" }}><Lbl>Place name</Lbl><Inp large placeholder="Highway Coffee House" value={ns.name} onChange={e => setNs({ ...ns, name: e.target.value })} /></div>
          <div style={{ marginBottom: 20, textAlign: "left" }}><Lbl>A short note</Lbl><Inp placeholder="A good place to pause for tea." value={ns.note} onChange={e => setNs({ ...ns, note: e.target.value })} /></div>

          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, textAlign: "left" }}><Lbl>Amount</Lbl><Inp type="number" placeholder="0" value={ns.amount} onChange={e => setNs({ ...ns, amount: e.target.value })} style={{ letterSpacing: 1 }} /></div>
            <div style={{ flex: 1, textAlign: "left" }}><Lbl>Time</Lbl><Inp type="time" value={ns.time} onChange={e => setNs({ ...ns, time: e.target.value })} style={{ colorScheme: "dark" }} /></div>
          </div>

          <div style={{ marginBottom: 20, textAlign: "left" }}><Lbl>Date</Lbl><Inp type="date" value={ns.date} onChange={e => setNs({ ...ns, date: e.target.value })} style={{ colorScheme: "dark" }} /></div>

          <div style={{ marginBottom: 20, textAlign: "left" }}>
            <Lbl>Category</Lbl>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {CATS.map(cat => (
                <button key={cat} onClick={() => setNs({ ...ns, category: cat })} style={{
                  fontFamily: F, fontSize: 11, fontWeight: 500, letterSpacing: 0.5, padding: "7px 14px", cursor: "pointer",
                  background: ns.category === cat ? `${C.dot}18` : "transparent",
                  border: `1px solid ${ns.category === cat ? C.dot : C.fa}`,
                  color: ns.category === cat ? C.dot : C.mu, borderRadius: 0,
                }}>{cat}</button>
              ))}
            </div>
          </div>

          {isGrp && members.length > 1 && (
            <div style={{ marginBottom: 24, textAlign: "left" }}>
              <Lbl>Split between</Lbl>
              <p style={{ fontSize: 11, color: C.fa, marginBottom: 10, marginTop: -4 }}>Leave all unselected for equal split among everyone.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map(m => {
                  const sel = ns.splitBetween.includes(m);
                  return (
                    <button key={m} onClick={() => toggleSplit(m)} style={{
                      fontFamily: F, fontSize: 12, fontWeight: 500, letterSpacing: 0.3, padding: "7px 16px", cursor: "pointer",
                      background: sel ? `${C.dot}18` : "transparent",
                      border: `1px solid ${sel ? C.dot : C.fa}`,
                      color: sel ? C.dot : C.mu, borderRadius: 0,
                    }}>{m}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", paddingBottom: 60 }}>
            <Btn onClick={isEdit ? saveEdit : addStop} disabled={!ns.name.trim()}>
              {isEdit ? "Save changes" : "Add stop"}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
