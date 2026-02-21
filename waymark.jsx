import { useState, useEffect } from "react";

/* ══════════════════════════════════════
   waymark.
   It simply remembers.
   ══════════════════════════════════════ */

const SK = "waymark-v30";
const uid = () => crypto.randomUUID();
const todayStr = () => new Date().toISOString().split("T")[0];
const nowT = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

/* ─── Design Tokens ─── */
const F = "'Outfit', 'Helvetica Neue', sans-serif";
const C = { bg: "#1e1d1b", bg2: "#252422", hi: "#e8e4db", tx: "#c8c3b8", mu: "#9e9a95", fa: "#6e6a66", dot: "#c8a87c" };

/* ─── Currency ─── */
const CURS = [
  { code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" }, { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" }, { code: "THB", symbol: "฿" }, { code: "JPY", symbol: "¥" },
  { code: "AUD", symbol: "A$" }, { code: "SGD", symbol: "S$" }, { code: "AED", symbol: "د.إ" }, { code: "MYR", symbol: "RM" },
];
const sym = (c) => CURS.find(x => x.code === c)?.symbol || c;
const fmt = (n, c = "INR") => (!n || n === 0) ? "—" : `${sym(c)}${Number(n).toLocaleString("en-IN")}`;

/* ─── Time helpers ─── */
const to12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`; };
const timeNarr = (t) => {
  if (!t) return ""; const h = parseInt(t.split(":")[0]);
  if (h < 6) return "before dawn"; if (h < 9) return "early morning"; if (h < 12) return "in the morning";
  if (h < 14) return "around midday"; if (h < 17) return "in the afternoon"; if (h < 20) return "in the evening"; return "at night";
};
const nw = (n) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] || String(n);
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
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&addressdetails=1`, { headers: { "Accept-Language": "en" } });
    const d = await r.json(); const a = d.address || {};
    const place = a.amenity || a.shop || a.building || a.road || a.neighbourhood || d.name || "";
    const area = a.city || a.town || a.village || a.state_district || a.state || "";
    const detail = [a.suburb || a.neighbourhood || "", area].filter(Boolean).join(", ");
    return { place, area, detail, city: area };
  } catch { return { place: "", area: "", detail: "", city: "" }; }
}

/* ─── Get current location ─── */
async function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("No geolocation");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const geo = await rGeo(pos.coords.latitude, pos.coords.longitude);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, ...geo });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/* ─── Settlement Calculator ─── */
function calcSettlements(stops, members) {
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

/* ─── Route summary from stops ─── */
function routeSummary(trip) {
  const cities = [];
  trip.stops.forEach(s => {
    const city = s.city || s.area || "";
    if (city && cities[cities.length - 1] !== city) cities.push(city);
  });
  if (cities.length === 0) return null;
  if (cities.length === 1) return cities[0];
  return `${cities[0]} → ${cities[cities.length - 1]}`;
}

/* ─── Demo Data ─── */
const mkDemo = () => {
  const d1 = new Date(); d1.setDate(d1.getDate() - 1); const d1s = d1.toISOString().split("T")[0];
  const d5 = new Date(); d5.setDate(d5.getDate() - 8); const d5s = d5.toISOString().split("T")[0];
  const d6 = new Date(); d6.setDate(d6.getDate() - 9); const d6s = d6.toISOString().split("T")[0];
  return [
    {
      id: uid(), name: "Bengaluru with Rahul & Priya", startDate: d1s, currency: "INR",
      note: "The kind of drive where you don't want to reach.",
      startLocation: { lat: 17.385, lng: 78.4867, city: "Hyderabad" },
      group: { name: "Bengaluru Trip", code: "BLURU1", members: ["Naveen", "Rahul", "Priya"] },
      stops: [
        { id: uid(), name: "Tata EV Station", note: "Quick charge near the highway exit. Rahul napped in the car.", category: "EV Charging", amount: 280, date: d1s, time: "07:45", area: "Shamshabad", city: "Hyderabad", lat: 17.24, lng: 78.43, addedBy: "Naveen", splitBetween: [] },
        { id: uid(), name: "Lepakshi Temple", note: "Priya found this on the map. Ancient stone carvings, a giant Nandi bull. We stayed longer than planned.", category: "Scenic Stop", amount: 0, date: d1s, time: "09:20", area: "Lepakshi", city: "Lepakshi", lat: 15.98, lng: 77.61, addedBy: "Priya", splitBetween: [] },
        { id: uid(), name: "Penukonda Toll", note: "", category: "Toll", amount: 185, date: d1s, time: "10:05", area: "Penukonda", city: "Penukonda", lat: 14.98, lng: 77.59, addedBy: "Naveen", splitBetween: [] },
        { id: uid(), name: "Highway Coffee House", note: "A good place to pause for tea. The owner recommended we try the local idli. He was right.", category: "Food & Drink", amount: 420, date: d1s, time: "11:30", area: "Anantapur Highway", city: "Anantapur", lat: 14.68, lng: 77.60, addedBy: "Rahul", splitBetween: [] },
        { id: uid(), name: "Electronic City Toll", note: "Almost there. Bengaluru traffic starts here.", category: "Toll", amount: 120, date: d1s, time: "15:40", area: "Electronic City", city: "Bengaluru", lat: 12.85, lng: 77.67, addedBy: "Naveen", splitBetween: [] },
      ],
    },
    {
      id: uid(), name: "Srisailam weekend", startDate: d5s, currency: "INR",
      note: "A weekend escape to the ghats. The reservoir was nearly full and the air smelled like wet earth.",
      startLocation: { lat: 17.385, lng: 78.4867, city: "Hyderabad" },
      group: null,
      stops: [
        { id: uid(), name: "Ather Grid", note: "Charged while having breakfast at the dhaba next door.", category: "EV Charging", amount: 150, date: d5s, time: "06:30", area: "Shamshabad", city: "Hyderabad", lat: 17.24, lng: 78.43, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Amrabad Tiger Reserve", note: "Entry fee. Spotted a few langurs swinging between the trees. The forest was impossibly quiet.", category: "Scenic Stop", amount: 200, date: d5s, time: "09:15", area: "Amrabad", city: "Amrabad", lat: 16.38, lng: 78.84, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Srisailam Dam", note: "Water thundering through the gates. Stood there for twenty minutes just watching.", category: "Scenic Stop", amount: 0, date: d5s, time: "11:00", area: "Srisailam", city: "Srisailam", lat: 15.85, lng: 78.87, addedBy: "You", splitBetween: [] },
        { id: uid(), name: "Temple Canteen", note: "Simple thali on a banana leaf. Surprisingly good. The kind of meal you remember.", category: "Food & Drink", amount: 160, date: d6s, time: "12:30", area: "Srisailam Temple", city: "Srisailam", lat: 15.86, lng: 78.87, addedBy: "You", splitBetween: [] },
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

const css = `*{box-sizing:border-box;margin:0;padding:0}input::placeholder{color:rgba(158,154,149,0.5)}input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none}input[type=number]{-moz-appearance:textfield}select{appearance:none;-webkit-appearance:none}textarea::placeholder{color:rgba(158,154,149,0.5)}textarea{font-family:'Outfit','Helvetica Neue',sans-serif}::-webkit-scrollbar{display:none}button:active{opacity:0.7}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.fi{animation:fadeIn 0.35s ease both}`;

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */
export default function Waymark() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [obStep, setObStep] = useState(0);
  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [editStopId, setEditStopId] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [startGeoLoading, setStartGeoLoading] = useState(false);
  const [startGeoError, setStartGeoError] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [nt, setNt] = useState({ name: "", date: todayStr(), currency: "INR", groupName: "", myName: "", isGroup: false, startLocation: null });
  const [ns, setNs] = useState({ name: "", note: "", category: "Food & Drink", amount: "", date: todayStr(), time: nowT(), lat: null, lng: null, area: "", city: "", splitBetween: [] });
  const [joinData, setJoinData] = useState({ code: "", name: "" });
  const [addMember, setAddMember] = useState("");

  useEffect(() => {
    (async () => {
      try { const ob = await window.storage.get("wm-ob-v4"); if (ob?.value === "1") setOnboarded(true); } catch {}
      try { const r = await window.storage.get(SK); setTrips(r?.value ? JSON.parse(r.value) : mkDemo()); } catch { setTrips(mkDemo()); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (!loading) window.storage.set(SK, JSON.stringify(trips)).catch(() => {}); }, [trips, loading]);

  /* ─── Derived ─── */
  const trip = trips.find(x => x.id === activeId);
  const tTotal = (t) => t.stops.reduce((s, st) => s + (st.amount || 0), 0);
  const isGrp = trip?.group != null;
  const members = trip?.group?.members || [];

  const tripNarr = (t) => {
    const n = t.stops.length;
    if (!n) return "No stops yet. The road is waiting.";
    const total = tTotal(t);
    const days = [...new Set(t.stops.map(s => s.date))].length;
    const route = routeSummary(t);
    let parts = [];
    if (route) parts.push(route);
    parts.push(`${nw(n)} ${n === 1 ? "stop" : "stops"}`);
    if (total > 0) parts.push(fmt(total, t.currency));
    if (days > 1) parts.push(`${nw(days)} days`);
    if (t.group) parts.push(`${t.group.members.length} travellers`);
    return parts.join("  ·  ");
  };

  const stopsByDay = (t) => {
    const g = {}; t.stops.forEach(s => { const d = s.date || t.startDate; if (!g[d]) g[d] = []; g[d].push(s); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  };

  const catBreak = (t) => {
    const m = {}; t.stops.forEach(s => { if (s.amount > 0) m[s.category] = (m[s.category] || 0) + s.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  /* ─── Actions ─── */
  const resetNs = () => setNs({ name: "", note: "", category: "Food & Drink", amount: "", date: todayStr(), time: nowT(), lat: null, lng: null, area: "", city: "", splitBetween: [] });

  const createTrip = () => {
    if (!nt.name.trim()) return;
    const group = nt.isGroup && nt.groupName.trim() && nt.myName.trim()
      ? { name: nt.groupName.trim(), code: genCode(), members: [nt.myName.trim()] } : null;
    const newT = { id: uid(), name: nt.name.trim(), startDate: nt.date, currency: nt.currency, note: "", startLocation: nt.startLocation, group, stops: [] };
    setTrips(p => [newT, ...p]); setActiveId(newT.id);
    setNt({ name: "", date: todayStr(), currency: "INR", groupName: "", myName: "", isGroup: false, startLocation: null });
    setScreen("trip");
  };

  const captureStartLocation = async () => {
    setStartGeoLoading(true);
    setStartGeoError(false);
    try {
      const loc = await getLocation();
      setNt(p => ({ ...p, startLocation: { lat: loc.lat, lng: loc.lng, city: loc.city } }));
    } catch { setStartGeoError(true); }
    setStartGeoLoading(false);
  };

  const joinGroup = () => {
    if (!joinData.code.trim() || !joinData.name.trim()) return;
    const found = trips.find(t => t.group?.code?.toUpperCase() === joinData.code.toUpperCase());
    if (found) {
      if (!found.group.members.includes(joinData.name.trim())) {
        setTrips(p => p.map(t => t.id === found.id ? { ...t, group: { ...t.group, members: [...t.group.members, joinData.name.trim()] } } : t));
      }
      setActiveId(found.id); setScreen("trip");
    }
    setJoinData({ code: "", name: "" });
  };

  const addMemberToGroup = () => {
    if (!addMember.trim() || !trip?.group) return;
    if (!trip.group.members.includes(addMember.trim())) {
      setTrips(p => p.map(x => x.id === activeId ? { ...x, group: { ...x.group, members: [...x.group.members, addMember.trim()] } } : x));
    }
    setAddMember("");
  };

  const captureLocation = async () => {
    if (!navigator.geolocation) return; setGeoLoading(true);
    try {
      const loc = await getLocation();
      setNs(p => ({ ...p, lat: loc.lat, lng: loc.lng, name: p.name || loc.place, area: loc.detail, city: loc.city }));
    } catch {} setGeoLoading(false);
  };

  const addStop = () => {
    if (!ns.name.trim()) return;
    const myName = trip?.group?.members?.[0] || "You";
    const stop = { id: uid(), name: ns.name.trim(), note: ns.note.trim(), category: ns.category, amount: parseInt(ns.amount) || 0, date: ns.date, time: ns.time, area: ns.area, city: ns.city, lat: ns.lat, lng: ns.lng, addedBy: myName, splitBetween: ns.splitBetween.length > 0 && ns.splitBetween.length < members.length ? ns.splitBetween : [] };
    setTrips(p => p.map(x => x.id === activeId ? { ...x, stops: [...x.stops, stop] } : x));
    resetNs(); setScreen("trip");
  };

  const saveEdit = () => {
    if (!ns.name.trim()) return;
    setTrips(p => p.map(x => x.id === activeId ? {
      ...x, stops: x.stops.map(s => s.id === editStopId ? { ...s, name: ns.name.trim(), note: ns.note.trim(), category: ns.category, amount: parseInt(ns.amount) || 0, date: ns.date, time: ns.time, area: ns.area, city: ns.city || s.city, lat: ns.lat || s.lat, lng: ns.lng || s.lng, splitBetween: ns.splitBetween.length > 0 && ns.splitBetween.length < members.length ? ns.splitBetween : [] } : s)
    } : x));
    setEditStopId(null); resetNs(); setScreen("trip");
  };

  const removeStop = (sid) => { setTrips(p => p.map(x => x.id === activeId ? { ...x, stops: x.stops.filter(s => s.id !== sid) } : x)); setDelConfirm(null); };
  const deleteTrip = () => { setTrips(p => p.filter(x => x.id !== activeId)); setActiveId(null); setScreen("home"); };
  const updateNote = (note) => { setTrips(p => p.map(x => x.id === activeId ? { ...x, note } : x)); };

  const openEdit = (stop) => {
    setEditStopId(stop.id);
    setNs({ name: stop.name, note: stop.note || "", category: stop.category, amount: stop.amount ? String(stop.amount) : "", date: stop.date, time: stop.time || nowT(), lat: stop.lat, lng: stop.lng, area: stop.area || "", city: stop.city || "", splitBetween: stop.splitBetween || [] });
    setScreen("editStop");
  };

  const copyCode = () => {
    if (trip?.group) {
      navigator.clipboard?.writeText(`Join my Waymark trip "${trip.name}"!\nGroup: ${trip.group.name}\nCode: ${trip.group.code}\n\nOpen waymark and tap "Join group"`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleSplit = (name) => {
    setNs(p => {
      const sb = p.splitBetween.includes(name) ? p.splitBetween.filter(n => n !== name) : [...p.splitBetween, name];
      return { ...p, splitBetween: sb };
    });
  };

  const finishOb = () => { setOnboarded(true); window.storage.set("wm-ob-v4", "1").catch(() => {}); };

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
      { top: "waymark.", body: "remembers your trips —\nwhere you went, what you spent,\nand what the day was like." },
      { top: "travel together", body: "share a trip with friends.\ntrack expenses as a group.\nsettle up when you're home." },
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
        <Btn onClick={() => setScreen("newTrip")}>New trip</Btn>
        <Btn onClick={() => setScreen("joinGroup")}>Join group</Btn>
      </div>
      <Rule m="28px 40px 0" />
      <div style={{ padding: "0 28px", maxWidth: 520, margin: "0 auto" }}>
        {trips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p style={{ fontSize: 17, fontWeight: 300, color: C.mu, lineHeight: 1.6 }}>No trips yet.</p>
            <p style={{ fontSize: 12, color: C.fa, marginTop: 12 }}>Start a trip or join a friend's group.</p>
          </div>
        ) : trips.map(t => {
          const isExp = expanded === t.id;
          return (
            <div key={t.id} style={{ padding: "22px 0 0" }}>
              <div onClick={() => setExpanded(isExp ? null : t.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 500, color: C.hi, margin: 0, letterSpacing: 0.4, lineHeight: 1.4 }}>{t.name}</h2>
                  <p style={{ fontSize: 12, color: C.mu, marginTop: 4, letterSpacing: 0.3, fontWeight: 400 }}>
                    {tripNarr(t)}
                  </p>
                </div>
                <span style={{ fontSize: 14, color: C.fa, fontWeight: 300, marginLeft: 12, marginTop: 4, transition: "transform 0.2s", transform: isExp ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
              </div>
              {isExp && (
                <div className="fi" style={{ paddingTop: 12 }}>
                  {t.note && <p style={{ fontSize: 13, fontWeight: 300, fontStyle: "italic", color: C.mu, lineHeight: 1.7, marginBottom: 10 }}>"{t.note}"</p>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.fa }}>{fmtD(t.startDate)}</span>
                    {t.group && <><span style={{ fontSize: 11, color: C.fa }}>·</span><span style={{ fontSize: 11, fontWeight: 500, color: C.dot }}>{t.group.name}</span></>}
                    {tTotal(t) > 0 && <><span style={{ fontSize: 11, color: C.fa }}>·</span><span style={{ fontSize: 11, fontWeight: 600, color: C.hi }}>{fmt(tTotal(t), t.currency)}</span></>}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => { setActiveId(t.id); setScreen("trip"); setShowSettle(false); }} style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.dot, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: 0.8 }}>
                      Open trip →
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
        <h2 style={{ fontSize: 26, fontWeight: 300, color: C.hi, margin: "0 0 44px" }}>Join a trip</h2>
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

  /* ═══ NEW TRIP ═══ */
  if (screen === "newTrip") return W(
    <div>
      <div style={{ padding: "24px 28px 0" }}><Back onClick={() => setScreen("home")} /></div>
      <div style={{ padding: "44px 28px 0", maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ fontSize: 26, fontWeight: 300, color: C.hi, margin: "0 0 40px" }}>Start a trip</h2>

        <div style={{ marginBottom: 28, textAlign: "left" }}>
          <Lbl>What are you calling this trip?</Lbl>
          <Inp large placeholder="Sikkim with the boys" value={nt.name} onChange={e => setNt({ ...nt, name: e.target.value })} />
        </div>

        {/* GPS start location */}
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          {nt.startLocation ? (
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: C.dot, marginBottom: 4 }}>Starting from {nt.startLocation.city || "here"}</p>
              <button onClick={() => setNt({ ...nt, startLocation: null })} style={{ fontFamily: F, fontSize: 11, color: C.fa, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
            </div>
          ) : (
            <div>
              <Btn small onClick={captureStartLocation} disabled={startGeoLoading}>
                {startGeoLoading ? "Locating..." : "Mark starting point"}
              </Btn>
              {startGeoError && <p style={{ fontSize: 11, color: C.fa, marginTop: 10 }}>Couldn't get location. Check permissions.</p>}
            </div>
          )}
        </div>

        <Rule m="0 0 24px" />

        <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>Date</Lbl><Inp value={nt.date} onChange={e => setNt({ ...nt, date: e.target.value })} type="date" style={{ colorScheme: "dark" }} /></div>
        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <Lbl>Currency</Lbl>
          <select value={nt.currency} onChange={e => setNt({ ...nt, currency: e.target.value })}
            style={{ width: "100%", fontFamily: F, fontSize: 15, fontWeight: 400, color: C.hi, background: "transparent", border: "none", borderBottom: `1px solid ${C.fa}`, padding: "8px 0 12px", outline: "none", cursor: "pointer" }}>
            {CURS.map(c => <option key={c.code} value={c.code} style={{ background: C.bg2 }}>{c.symbol} {c.code}</option>)}
          </select>
        </div>

        <Rule m="8px 0 24px" />

        <div style={{ marginBottom: 24, textAlign: "left" }}>
          <button onClick={() => setNt({ ...nt, isGroup: !nt.isGroup })} style={{
            fontFamily: F, fontSize: 13, fontWeight: 500, color: nt.isGroup ? C.dot : C.mu,
            background: nt.isGroup ? `${C.dot}15` : "transparent",
            border: `1px solid ${nt.isGroup ? C.dot : C.fa}`, borderRadius: 0,
            padding: "10px 20px", cursor: "pointer", letterSpacing: 0.5, width: "100%", textAlign: "center",
          }}>
            {nt.isGroup ? "Travelling with a group ✓" : "Travelling with friends?"}
          </button>
        </div>

        {nt.isGroup && (
          <div className="fi">
            <div style={{ marginBottom: 24, textAlign: "left" }}><Lbl>Group name</Lbl><Inp placeholder="The usual crew" value={nt.groupName} onChange={e => setNt({ ...nt, groupName: e.target.value })} /></div>
            <div style={{ marginBottom: 28, textAlign: "left" }}><Lbl>Your name</Lbl><Inp placeholder="Naveen" value={nt.myName} onChange={e => setNt({ ...nt, myName: e.target.value })} /></div>
          </div>
        )}

        <div style={{ paddingTop: 8, paddingBottom: 60 }}>
          <Btn onClick={createTrip} disabled={!nt.name.trim() || (nt.isGroup && (!nt.groupName.trim() || !nt.myName.trim()))}>Let's go</Btn>
        </div>
      </div>
    </div>
  );

  /* ═══ TRIP DETAIL ═══ */
  if (screen === "trip" && trip) {
    const total = tTotal(trip);
    const days = stopsByDay(trip);
    const cats = catBreak(trip);
    const route = routeSummary(trip);
    const sett = isGrp ? calcSettlements(trip.stops, members) : null;

    return W(
      <div>
        <div style={{ padding: "24px 28px 0" }}><Back onClick={() => { setScreen("home"); setActiveId(null); }} /></div>
        <div style={{ padding: "28px 28px 0", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 28, fontWeight: 500, color: C.hi, margin: "0 0 6px", letterSpacing: 0.4, lineHeight: 1.3 }}>{trip.name}</h2>
          <p style={{ fontSize: 12, color: C.mu, letterSpacing: 0.3, fontWeight: 400 }}>
            {[fmtDL(trip.startDate), route].filter(Boolean).join("  ·  ")}
          </p>

          {total > 0 && (
            <p style={{ fontSize: 28, fontWeight: 600, color: C.hi, margin: "16px 0 0", letterSpacing: 0.5 }}>
              {fmt(total, trip.currency)}
              <span style={{ fontSize: 10, color: C.mu, marginLeft: 8, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>total</span>
              {isGrp && <span style={{ fontSize: 10, color: C.fa, marginLeft: 4 }}>· {fmt(Math.round(total / members.length), trip.currency)} each</span>}
            </p>
          )}

          {isGrp && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {members.map((m, i) => <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", border: `1px solid ${C.fa}`, color: C.tx }}>{m}</span>)}
              </div>
              <button onClick={copyCode} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: copied ? C.dot : C.mu, background: "none", border: "none", cursor: "pointer", letterSpacing: 0.5 }}>
                {copied ? "Copied!" : `Share code: ${trip.group.code}`}
              </button>
            </div>
          )}
        </div>

        {/* Trip note — central, not hidden */}
        <div style={{ padding: "16px 28px 0", maxWidth: 520, margin: "0 auto" }}>
          <textarea value={trip.note} onChange={e => updateNote(e.target.value)}
            placeholder="What was this trip like? Write something you'll want to remember."
            rows={3}
            style={{ width: "100%", fontSize: 14, fontWeight: 300, fontStyle: "italic", color: C.tx, background: "transparent", border: "none", outline: "none", resize: "vertical", lineHeight: 1.8, padding: 0, boxSizing: "border-box", textAlign: "center", letterSpacing: 0.2 }} />
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

        {/* Along the way */}
        <div style={{ padding: "0 28px", maxWidth: 520, margin: "0 auto" }}>
          {trip.stops.length > 0 && (
            <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.mu, letterSpacing: 2.5, textTransform: "uppercase" }}>Along the way</span>
            </div>
          )}
          {trip.stops.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <p style={{ fontSize: 16, fontWeight: 300, color: C.mu, lineHeight: 1.6 }}>No stops yet.</p>
              <p style={{ fontSize: 13, color: C.fa, marginTop: 8 }}>Add your first stop to begin the story.</p>
            </div>
          ) : days.map(([date, stops], di) => (
            <div key={date}>
              {days.length > 1 && (
                <div style={{ textAlign: "center", padding: "18px 0 4px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.dot, letterSpacing: 2, textTransform: "uppercase" }}>{fmtDay(date)}</span>
                </div>
              )}
              {stops.map((stop, i) => (
                <div key={stop.id} style={{ padding: "18px 0 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                    <h3 onClick={() => openEdit(stop)} style={{ fontSize: 18, fontWeight: 600, color: C.hi, margin: 0, lineHeight: 1.3, flex: 1, cursor: "pointer", letterSpacing: 0.3 }}>{stop.name}</h3>
                    <span style={{ fontSize: 16, fontWeight: 600, color: C.hi, flexShrink: 0 }}>{fmt(stop.amount, trip.currency)}</span>
                  </div>
                  {/* Note is prominent */}
                  {stop.note && <p style={{ fontSize: 14, fontWeight: 400, color: C.tx, margin: "6px 0 0", lineHeight: 1.7, letterSpacing: 0.15 }}>{stop.note}</p>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: C.fa, letterSpacing: 0.4, margin: 0, fontWeight: 500 }}>
                      {[to12(stop.time), stop.category, stop.area, isGrp && stop.addedBy ? `by ${stop.addedBy}` : null].filter(Boolean).join("  ·  ")}
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
                  <Rule m="18px 0 0" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        {cats.length > 0 && (
          <div style={{ padding: "18px 28px 0", maxWidth: 520, margin: "0 auto" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.mu, marginBottom: 10 }}>Breakdown</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cats.map(([cat, amt], i) => (
                <span key={cat} style={{ fontSize: 13, fontWeight: 400, color: C.tx }}>
                  {cat} <span style={{ fontWeight: 600 }}>{fmt(amt, trip.currency)}</span>{i < cats.length - 1 ? <span style={{ color: C.fa, margin: "0 8px" }}>·</span> : ""}
                </span>
              ))}
            </div>
            <Rule m="18px 0 0" />
          </div>
        )}

        {/* Settlements */}
        {isGrp && sett && (
          <div style={{ padding: "18px 28px 0", maxWidth: 520, margin: "0 auto" }}>
            <button onClick={() => setShowSettle(!showSettle)} style={{ fontFamily: F, fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.dot, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: showSettle ? 14 : 0 }}>
              {showSettle ? "Hide settlements ↑" : "View settlements ↓"}
            </button>
            {showSettle && (
              <div className="fi">
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.mu, marginBottom: 8 }}>Who paid</p>
                  {members.map(m => <p key={m} style={{ fontSize: 14, fontWeight: 400, color: C.tx, lineHeight: 1.8 }}>{m} paid <span style={{ fontWeight: 600 }}>{fmt(sett.paid[m], trip.currency)}</span></p>)}
                </div>
                {sett.transfers.length > 0 ? (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.mu, marginBottom: 8 }}>To settle up</p>
                    {sett.transfers.map((t, i) => <p key={i} style={{ fontSize: 15, fontWeight: 500, color: C.hi, lineHeight: 1.9 }}>{t.from} owes {t.to} <span style={{ fontWeight: 600, color: C.dot }}>{fmt(t.amount, trip.currency)}</span></p>)}
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
          <Btn onClick={() => { resetNs(); setNs(p => ({ ...p, date: trip.startDate })); setScreen("newStop"); }}>Add a stop</Btn>
        </div>
        <div style={{ textAlign: "center", paddingBottom: 60 }}>
          <button onClick={deleteTrip} style={{ fontFamily: F, fontSize: 11, fontWeight: 500, color: C.fa, background: "none", border: "none", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase", padding: "8px 16px" }}>Delete trip</button>
        </div>
      </div>
    );
  }

  /* ═══ NEW / EDIT STOP ═══ */
  if (screen === "newStop" || screen === "editStop") {
    const isEdit = screen === "editStop";
    return W(
      <div>
        <div style={{ padding: "24px 28px 0" }}><Back onClick={() => { setScreen("trip"); setEditStopId(null); }} /></div>
        <div style={{ padding: "36px 28px 0", maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <h2 style={{ fontSize: 24, fontWeight: 300, color: C.hi }}>{isEdit ? "Edit stop" : "Record a stop"}</h2>
          </div>

          <div style={{ marginBottom: 22, textAlign: "center" }}>
            {ns.lat ? (
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: C.dot, marginBottom: 4 }}>{ns.area || ns.city || "Location captured"}</p>
                <button onClick={() => setNs({ ...ns, lat: null, lng: null, area: "", city: "" })} style={{ fontFamily: F, fontSize: 11, color: C.fa, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ) : (
              <Btn small onClick={captureLocation} disabled={geoLoading}>{geoLoading ? "Locating..." : "Capture location"}</Btn>
            )}
          </div>

          <Rule m="0 0 22px" />

          <div style={{ marginBottom: 20, textAlign: "left" }}><Lbl>Place name</Lbl><Inp large placeholder="Highway Coffee House" value={ns.name} onChange={e => setNs({ ...ns, name: e.target.value })} /></div>

          {/* Note field is prominent — not an afterthought */}
          <div style={{ marginBottom: 20, textAlign: "left" }}>
            <Lbl>What happened here?</Lbl>
            <textarea
              placeholder="The owner recommended we try the local idli. He was right."
              value={ns.note} onChange={e => setNs({ ...ns, note: e.target.value })}
              rows={3}
              style={{ width: "100%", fontSize: 15, fontWeight: 400, color: C.hi, background: "transparent", border: "none", borderBottom: `1px solid ${C.fa}`, outline: "none", resize: "vertical", lineHeight: 1.7, padding: "8px 0 12px", boxSizing: "border-box", letterSpacing: 0.2 }}
            />
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, textAlign: "left" }}><Lbl>Amount</Lbl><Inp type="number" placeholder="0" value={ns.amount} onChange={e => setNs({ ...ns, amount: e.target.value })} /></div>
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
                      fontFamily: F, fontSize: 12, fontWeight: 500, padding: "7px 16px", cursor: "pointer",
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
