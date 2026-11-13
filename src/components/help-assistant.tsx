"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, Send, X, Loader2, Mic, MicOff, Search } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { canAccessPath, portalForPath } from "@/lib/route-permissions";
import { APP_GUIDES, type Guide } from "@/content/app-guide";
import { HelpWalkthrough, HIGHLIGHT_CLASSES, findByText, type StepsCard } from "@/components/help-walkthrough";

// Minimal Web Speech API types (not in TS's DOM lib).
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => SpeechRecognitionLike) | null;
}

const SILENCE_MS = 8000;      // stop after this long with no speech
const MAX_LISTEN_MS = 120000; // hard cap per tap

type Msg = { role: "user" | "assistant"; content: string; card?: StepsCard };

/** Flash an element briefly. */
function flash(el: Element) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...HIGHLIGHT_CLASSES);
  setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 4000);
}

/** Retry for a few seconds — pages and dialogs load after they render. */
function highlightWhenReady(text: string) {
  let tries = 0;
  const tick = () => {
    const el = findByText(text);
    if (el) return flash(el);
    if (tries++ < 16) setTimeout(tick, 250);
  };
  setTimeout(tick, 300);
}

export function HelpAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [view, setView] = useState<"ask" | "guides">("ask");
  const [guideSearch, setGuideSearch] = useState("");
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  // Guides this person can follow (every page on the path is one they can
  // open), this portal's first.
  const portal = portalForPath(pathname);
  const guides = useMemo(() => APP_GUIDES
    .filter(g => g.steps.every(st => !st.path || canAccessPath(user, st.path)))
    .sort((a, b) => Number(b.portal === portal) - Number(a.portal === portal)), [user, portal]);
  const shownGuides = useMemo(() => {
    const words = guideSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return guides.filter(g => words.every(w => `${g.title} ${g.keywords}`.toLowerCase().includes(w)));
  }, [guides, guideSearch]);
  const toCard = (g: Guide): StepsCard => ({
    type: "steps", title: g.title, steps: g.steps, goTo: [...g.steps].reverse().find(st => st.path)?.path,
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Voice to type: the browser's speech recognition (Chrome, Edge, Safari).
  // Where it isn't available (e.g. the Android app's web view) the mic button
  // is hidden and the phone keyboard's own mic still works.
  useEffect(() => { setCanListen(!!getRecognition()); }, []);
  useEffect(() => () => { wantListen.current = false; recRef.current?.abort(); }, []);

  // Keep listening through pauses: the browser ends a recognition session on
  // its own after a short silence (sooner on phones), so we restart it until
  // the user taps stop, goes quiet for SILENCE_MS, or hits MAX_LISTEN_MS.
  const wantListen = useRef(false);
  const committed = useRef("");
  const lastHeard = useRef(0);
  const startedAt = useRef(0);

  function stopListening() {
    wantListen.current = false;
    recRef.current?.stop();
  }

  function startSession() {
    const Rec = getRecognition();
    if (!Rec || !wantListen.current) return;
    const rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let sessionFinal = "";
    rec.onresult = e => {
      lastHeard.current = Date.now();
      let final = "", interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      sessionFinal = final;
      setInput((committed.current + final + interim).replace(/\s+/g, " ").trimStart().slice(0, 2000));
    };
    rec.onend = () => {
      committed.current = (committed.current + sessionFinal + " ").replace(/\s+/g, " ");
      recRef.current = null;
      const quiet = Date.now() - lastHeard.current > SILENCE_MS;
      const tooLong = Date.now() - startedAt.current > MAX_LISTEN_MS;
      if (wantListen.current && !quiet && !tooLong) startSession();
      else { wantListen.current = false; setListening(false); setInput(committed.current.trim().slice(0, 2000)); }
    };
    rec.onerror = () => { /* onend follows and decides whether to restart */ };
    recRef.current = rec;
    try { rec.start(); } catch { wantListen.current = false; setListening(false); }
  }

  function toggleListening() {
    if (listening) { stopListening(); return; }
    if (!getRecognition()) return;
    committed.current = input.trim() ? input.trim() + " " : "";
    lastHeard.current = startedAt.current = Date.now();
    wantListen.current = true;
    setListening(true);
    startSession();
  }

  // Stop after a long silence even while a session is still open.
  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => {
      if (Date.now() - lastHeard.current > SILENCE_MS || Date.now() - startedAt.current > MAX_LISTEN_MS) stopListening();
    }, 1000);
    return () => clearInterval(t);
  }, [listening]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const [walk, setWalk] = useState<StepsCard | null>(null);

  // "Go to page": straight to the end of the path, pointing at the last button.
  function goToPage(card: StepsCard) {
    if (card.goTo && card.goTo !== pathname) router.push(card.goTo);
    const lastClick = [...card.steps].reverse().find(s => s.click)?.click;
    if (lastClick) highlightWhenReady(lastClick);
    setOpen(false);
  }

  // "Show me how": close the chat and walk them through it on the real screen.
  function showMeHow(card: StepsCard) {
    setOpen(false);
    setWalk(card);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    stopListening();
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next, pathname }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok ? (data.reply as string) : (data.error as string) || "Something went wrong.";
      const card = res.ok && Array.isArray(data.actions) ? (data.actions as StepsCard[]).find(x => x?.type === "steps") : undefined;
      setMessages(m => [...m, { role: "assistant", content: reply, card }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Couldn't reach the assistant. Check your connection." }]);
    } finally {
      setBusy(false);
    }
  }

  const renderCard = (card: StepsCard) => (
    <div className="mt-2 rounded-md border border-border-sub p-2 whitespace-normal">
      <p className="text-[12px] font-semibold text-text-primary">{card.title}</p>
      <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-[12px] text-text-secondary">
        {card.steps.map((s, k) => <li key={k}>{s.say}</li>)}
      </ol>
      <div className="mt-2 flex gap-2">
        <button onClick={() => showMeHow(card)} className="flex-1 rounded-md bg-accent-gold/15 border border-accent-gold/40 px-2 py-1 text-[12px] font-semibold text-accent-gold">Show me how</button>
        {card.goTo && <button onClick={() => goToPage(card)} className="flex-1 rounded-md border border-border-main px-2 py-1 text-[12px] font-semibold text-text-primary">Go to page</button>}
      </div>
    </div>
  );

  if (walk && !open) return <HelpWalkthrough card={walk} onExit={() => setWalk(null)} />;

  return (
    <div data-help-assistant className="fixed z-50 right-6 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:right-8 md:bottom-8">
      {open ? (
        <div className="flex flex-col w-[min(22rem,calc(100vw-3rem))] h-[min(30rem,calc(100svh-6rem))] bg-bg-elevated border border-border-main rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-sub">
            <div className="flex items-center gap-1">
              {(["ask", "guides"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={v === view ? "rounded-md bg-bg-tertiary px-2 py-0.5 text-sm font-semibold text-text-primary" : "rounded-md px-2 py-0.5 text-sm text-text-muted hover:text-text-primary"}>
                  {v === "ask" ? "Ask" : "Guides"}
                </button>
              ))}
            </div>
            <button aria-label="Close help" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {view === "ask" ? (<>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p className="text-text-muted">Ask where to find something — e.g. &ldquo;Where do I upload job photos?&rdquo; or &ldquo;Who&rsquo;s helping on my job tomorrow?&rdquo; Or browse the <button className="underline text-accent-gold" onClick={() => setView("guides")}>Guides</button>.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-md bg-bg-tertiary px-2.5 py-1.5 text-text-primary" : "mr-8 text-text-secondary whitespace-pre-wrap"}>
                {m.content}
                {m.card && renderCard(m.card)}
              </div>
            ))}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
          </div>
          <form
            className="flex items-center gap-2 border-t border-border-sub p-2"
            onSubmit={e => { e.preventDefault(); send(); }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={2000}
              placeholder={listening ? "Listening…" : "Ask a question…"}
              className="flex-1 min-w-0 bg-bg-primary border border-border-main rounded-md px-2.5 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-gold"
            />
            {canListen && (
              <button type="button" onClick={toggleListening} aria-label={listening ? "Stop voice input" : "Speak your question"}
                className={listening ? "p-1.5 rounded-md text-text-red animate-pulse" : "p-1.5 rounded-md text-text-muted hover:text-text-primary"}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="p-1.5 rounded-md text-accent-gold disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
          </>) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <input value={guideSearch} onChange={e => setGuideSearch(e.target.value)} placeholder="Search guides…"
                className="w-full bg-bg-primary border border-border-main rounded-md pl-7 pr-2.5 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-gold" />
            </div>
            {shownGuides.length === 0 && <p className="text-text-muted">No guide matches. Try asking in the Ask tab.</p>}
            {shownGuides.map(g => (
              <div key={g.id} className="rounded-md border border-border-sub">
                <button onClick={() => setOpenGuide(openGuide === g.id ? null : g.id)} className="w-full px-2.5 py-1.5 text-left text-[13px] text-text-primary hover:bg-bg-tertiary">
                  {g.title}
                </button>
                {openGuide === g.id && <div className="px-2 pb-2">{renderCard(toCard(g))}</div>}
              </div>
            ))}
          </div>
          )}
        </div>
      ) : (
        <button
          aria-label="Open help assistant"
          onClick={() => setOpen(true)}
          className="h-11 w-11 rounded-full bg-bg-elevated border border-border-main shadow-lg flex items-center justify-center text-accent-gold hover:bg-bg-tertiary"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
