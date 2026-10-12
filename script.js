/* ========== الأوامر — ضيف أمر جديد هنا ========== */
const COMMANDS = {
  rephrase: {
    label: "صياغة رسمية",
    desc: "يعيد صياغة الجملة بأسلوب مهني مناسب للمراسلات والتقارير.",
    prompt: "Rewrite the user's sentence in a polished, professional, formal register suitable for business correspondence and project reports."
  },
  concise: {
    label: "صياغة مختصرة",
    desc: "يختصر الجملة لأقصر صيغة واضحة بدون ما يضيع المعنى.",
    prompt: "Rewrite the user's sentence as concisely as possible while keeping the full meaning, in a clear professional tone."
  },
  friendly: {
    label: "صياغة ودية",
    desc: "يصيغ الجملة بأسلوب لطيف ومهذب مناسب للتعامل مع العملاء والزملاء.",
    prompt: "Rewrite the user's sentence in a warm, courteous, friendly-but-professional tone."
  },
  fix: {
    label: "تصحيح لغوي",
    desc: "يصحح الأخطاء الإملائية والنحوية بأقل تغيير ممكن.",
    prompt: "Correct spelling, grammar and punctuation in the user's sentence with minimal changes to wording and style."
  }
};
/* ============================================== */

const MODEL_DEFAULT = "gemini-3.5-flash-lite";   // الأسرع
const MODEL_FALLBACK = "gemini-3.6-flash";       // بديل لو الأول مشغول
const MODEL_RETIRED = ["gemini-2.5-flash", "gemini-3.8-flash"];
function getModel(){ const m = store("gemini_model"); return (!m || MODEL_RETIRED.includes(m)) ? MODEL_DEFAULT : m; }
const $ = id => document.getElementById(id);
let current = "rephrase";

function store(k, v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k, v);}catch(e){ return null; } }

function renderCommands(){
  const box = $("cmds"); box.innerHTML = "";
  Object.entries(COMMANDS).forEach(([key, c]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "cmd"; b.textContent = c.label;
    b.setAttribute("aria-pressed", key === current);
    b.onclick = () => { current = key; renderCommands(); };
    box.appendChild(b);
  });
  $("cmdDesc").textContent = COMMANDS[current].desc;
}

function setStatus(msg, isErr){ const s = $("status"); s.textContent = msg; s.className = "status" + (isErr ? " err" : ""); }

async function run(){
  const text = $("input").value.trim();
  const key = store("gemini_key");
  if(!text){ setStatus("اكتب الجملة الأول.", true); return; }
  if(!key){ setStatus("ضيف مفتاح Gemini من الإعدادات الأول.", true); $("settings").showModal(); return; }
  const model = getModel();

  const system =
    COMMANDS[current].prompt +
    " The input may be in Egyptian Arabic dialect, Modern Standard Arabic, or English; understand it fully. " +
    "Return the result in BOTH languages: 'arabic' must be in clear Modern Standard Arabic (not dialect), 'english' in natural professional English. " +
    "Both must carry the same meaning. Output only the JSON object, no explanations.";

  $("run").disabled = true; setStatus("جاري التنفيذ…");
  $("cardAr").hidden = true; $("cardEn").hidden = true;

  try{
    const urlFor = m => "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent";
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { arabic: { type: "STRING" }, english: { type: "STRING" } },
          required: ["arabic", "english"]
        }
      }
    });
    let res, data, busy = false;
    const MAX_TRIES = 4;
    for(let attempt = 1; attempt <= MAX_TRIES; attempt++){
      const useModel = (attempt > 1 && model !== MODEL_FALLBACK) ? MODEL_FALLBACK : model;
      res = await fetch(urlFor(useModel), { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body });
      data = await res.json().catch(() => ({}));
      if(res.ok) break;
      busy = (res.status === 503 || res.status === 429);
      if(!busy || attempt === MAX_TRIES) break;
      setStatus("الموديل مشغول، بجرب موديل بديل…");
      await new Promise(r => setTimeout(r, 1000));
    }
    if(!res.ok){
      const m = (data && data.error && data.error.message) || ("HTTP " + res.status);
      const e = new Error(m); e.busy = busy; throw e;
    }
    const raw = data.candidates && data.candidates[0] && data.candidates[0].content.parts.map(p => p.text || "").join("");
    if(!raw) throw new Error("Gemini رجّع رد فاضي. جرّب تاني.");
    const out = JSON.parse(raw.replace(/```json|```/g, "").trim());
    $("outAr").textContent = out.arabic;
    $("outEn").textContent = out.english;
    $("cardAr").hidden = false; $("cardEn").hidden = false;
    setStatus("");
  }catch(e){
    if(e.busy) setStatus("الموديل لسه مشغول بعد كذا محاولة. استنى دقيقة وجرّب تاني.", true);
    else setStatus("حصلت مشكلة: " + e.message + " — اتأكد من المفتاح واسم الموديل في الإعدادات.", true);
  }finally{
    $("run").disabled = false;
  }
}

document.querySelectorAll(".copy").forEach(btn => {
  btn.onclick = async () => {
    const t = $(btn.dataset.target).textContent;
    try{ await navigator.clipboard.writeText(t); }
    catch(e){ const r = document.createRange(); r.selectNodeContents($(btn.dataset.target)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); }
    btn.textContent = "تم النسخ"; btn.classList.add("done");
    setTimeout(() => { btn.textContent = "نسخ"; btn.classList.remove("done"); }, 1400);
  };
});

$("run").onclick = run;
$("input").addEventListener("keydown", e => { if((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
$("openSettings").onclick = () => { $("apiKey").value = store("gemini_key") || ""; $("model").value = getModel(); $("settings").showModal(); };
$("closeSettings").onclick = () => $("settings").close();
$("saveSettings").onclick = () => { store("gemini_key", $("apiKey").value.trim()); store("gemini_model", $("model").value.trim() || MODEL_DEFAULT); $("settings").close(); setStatus(""); };

renderCommands();
if(!store("gemini_key")) setStatus("ابدأ بإضافة مفتاح Gemini من الإعدادات.");

/* الصفحة تفتح دايمًا من فوق */
if("scrollRestoration" in history) history.scrollRestoration = "manual";
if(location.hash){ history.replaceState(null, "", location.pathname + location.search); }
window.scrollTo(0, 0);
window.addEventListener("pageshow", () => window.scrollTo(0, 0));
document.querySelectorAll('a[href="#tool"]').forEach(a => a.addEventListener("click", e => {
  e.preventDefault(); $("tool").scrollIntoView({ behavior: "smooth", block: "start" });
}));
