"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, Send, X, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";

type Msg = { role: "user" | "assistant"; content: string };
type Action = { type: "navigate"; path: string; highlight?: string } | { type: "highlight"; text: string };

const HIGHLIGHT_CLASSES = ["ring-2", "ring-accent-gold", "ring-offset-2", "ring-offset-bg-primary", "rounded-md", "animate-pulse"];

/** Flash an element for a few seconds. */
function flash(el: Element) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...HIGHLIGHT_CLASSES);
  setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 4000);
}

/** Smallest visible clickable/heading element whose text matches `text` (outside the assistant panel). */
function findByText(text: string): Element | null {
  const want = text.trim().toLowerCase();
  if (!want) return null;
  const candidates = document.querySelectorAll(
    'main button, main a, main [role="tab"], main h1, main h2, main h3, main label, main [role="button"], main th, [data-sidebar] a',
  );
  let best: Element | null = null;
  let bestLen = Infinity;
  for (const el of candidates) {
    if (el.closest("[data-help-assistant]")) continue;
    const t = (el.textContent || "").trim().toLowerCase();
    if (!t.includes(want)) continue;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const exact = t === want ? 0 : 1;
    const score = exact * 1000 + t.length;
    if (score < bestLen) { best = el; bestLen = score; }
  }
  return best;
}

/** Retry for a few seconds — pages load their lists after they render. */
function highlightWhenReady(text: string) {
  let tries = 0;
  const tick = () => {
    const el = findByText(text);
    if (el) return flash(el);
    if (tries++ < 16) setTimeout(tick, 250);
  };
  setTimeout(tick, 150);
}

export function HelpAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  function runActions(actions: Action[]) {
    for (const a of actions) {
      if (a.type === "navigate") {
        if (a.path !== pathname) router.push(a.path);
        // Point at the sidebar entry too, so they learn where it lives.
        const nav = document.querySelector(`a[data-sidebar][href="${CSS.escape(a.path)}"], [data-sidebar] a[href="${CSS.escape(a.path)}"]`);
        if (nav) flash(nav);
        if (a.highlight) highlightWhenReady(a.highlight);
      } else {
        highlightWhenReady(a.text);
      }
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
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
      setMessages(m => [...m, { role: "assistant", content: reply }]);
      if (res.ok && Array.isArray(data.actions)) runActions(data.actions);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Couldn't reach the assistant. Check your connection." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-help-assistant className="fixed z-50 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4">
      {open ? (
        <div className="flex flex-col w-[min(22rem,calc(100vw-2rem))] h-[min(30rem,calc(100svh-6rem))] bg-bg-elevated border border-border-main rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-sub">
            <span className="text-sm font-semibold text-text-primary">Help</span>
            <button aria-label="Close help" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && (
              <p className="text-text-muted">Ask where to find something — e.g. &ldquo;Where do I upload job photos?&rdquo; or &ldquo;Who&rsquo;s helping on my job tomorrow?&rdquo;</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-md bg-bg-tertiary px-2.5 py-1.5 text-text-primary" : "mr-8 text-text-secondary whitespace-pre-wrap"}>
                {m.content}
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
              placeholder="Ask a question…"
              className="flex-1 min-w-0 bg-bg-primary border border-border-main rounded-md px-2.5 py-1.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-gold"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="p-1.5 rounded-md text-accent-gold disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
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
