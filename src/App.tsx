import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "./components/ThemeToggle";
import { sendMessageToAi } from "./api/chatApi";
import { exportRenderedDiscussionToPdf } from "./api/pdfApi";
import { appConfig, type ThemeMode } from "./config/app.config";
import brandLogoDark from "./assets/logo-dark.svg";
import brandLogoLight from "./assets/logo-light.svg";
import Login from "./components/Login";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  responseTimeMs?: number;
};

type Discussion = {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
};

type PendingRequestState = {
  startedAt: number;
  elapsedMs: number;
};

type ResponseMode = "simple" | "chart";

type SuggestionCategory = {
  title: string;
  icon: string;
  items: Array<{ question: string }>;
};

const EXPERT_BI_SUGGESTIONS: SuggestionCategory[] = [
  {
    title: "Stocks & Marges",
    icon: "📦",
    items: [
      { question: "Quels produits ont le meilleur taux de vente vs stock disponible ?" },
      { question: "Quel est l'impact des variations de prix des matières premières sur les marges des produits finis ?" }
    ]
  },
  {
    title: "Fournisseurs & Clients",
    icon: "🤝",
    items: [
      { question: "Quels fournisseurs sont les plus fiables selon le taux de conformité ?" },
      { question: "Quels clients sont les plus rentables en termes de marge brute ?" }
    ]
  }
];

const DARK_TO_LIGHT_INLINE_STYLES: Array<[RegExp, string]> = [
  [/#1a1a1a/gi, "#ffffff"],
  [/#2d2d2d/gi, "#f8fafc"],
  [/#3a3a3a/gi, "#e2e8f0"],
  [/#444/gi, "#cbd5e1"],
  [/#e0e0e0/gi, "#0f172a"]
];

const LIGHT_TO_DARK_INLINE_STYLES: Array<[RegExp, string]> = [
  [/#ffffff/gi, "#1a1a1a"],
  [/#f8fafc/gi, "#2d2d2d"],
  [/#e2e8f0/gi, "#3a3a3a"],
  [/#cbd5e1/gi, "#444"],
  [/#0f172a/gi, "#e0e0e0"]
];

const INITIAL_CHAT_STATE = getInitialChatState();

const DARK_TO_LIGHT_SCRIPT_COLORS: Array<[RegExp, string]> = [
  [/#e0e0e0/gi, "#111827"],
  [/#ffffff/gi, "#0f172a"],
  [/#f5f5f5/gi, "#1f2937"],
  [/rgba\(\s*224\s*,\s*224\s*,\s*224\s*,\s*([0-9.]+)\s*\)/gi, "rgba(15,23,42,$1)"]
];

const LIGHT_TO_DARK_SCRIPT_COLORS: Array<[RegExp, string]> = [
  [/#111827/gi, "#e0e0e0"],
  [/#0f172a/gi, "#ffffff"],
  [/#1f2937/gi, "#f5f5f5"],
  [/rgba\(\s*15\s*,\s*23\s*,\s*42\s*,\s*([0-9.]+)\s*\)/gi, "rgba(224,224,224,$1)"]
];

function createId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDiscussion(): Discussion {
  const id = createId();
  return {
    id,
    title: "Nouvelle discussion",
    createdAt: new Date().toISOString(),
    messages: []
  };
}

function loadDiscussions(): Discussion[] {
  try {
    const raw = localStorage.getItem(appConfig.storageKeys.discussions);
    if (!raw) return [createDiscussion()];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createDiscussion()];
    return parsed as Discussion[];
  } catch {
    return [createDiscussion()];
  }
}

function buildDiscussionTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Nouvelle discussion";
  return trimmed.length <= 42 ? trimmed : `${trimmed.slice(0, 42)}...`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function truncateText(value: string, max = 24): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function isLikelyHtml(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return (
    text.startsWith("<!DOCTYPE html") ||
    text.startsWith("<html") ||
    /<(html|head|body|script|style|div|p|br|span|h1|h2|h3|h4|h5|h6)\b/i.test(text)
  );
}

function applyInlineTheme(container: HTMLElement, theme: ThemeMode): void {
  const styleNodes = container.querySelectorAll<HTMLElement>("[style]");
  styleNodes.forEach((el) => {
    const original = el.getAttribute("style");
    if (!original) return;
    const map = theme === "light" ? DARK_TO_LIGHT_INLINE_STYLES : LIGHT_TO_DARK_INLINE_STYLES;
    const next = map.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), original);
    el.setAttribute("style", next);
  });
}

function applyThemeToScriptContent(scriptText: string, theme: ThemeMode): string {
  const map = theme === "light" ? DARK_TO_LIGHT_SCRIPT_COLORS : LIGHT_TO_DARK_SCRIPT_COLORS;
  return map.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), scriptText);
}

function HtmlContent({ html, theme }: { html: string; theme: ThemeMode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = html;

    const scripts = Array.from(container.querySelectorAll("script"));
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.text = applyThemeToScriptContent(oldScript.text, theme);
      oldScript.replaceWith(newScript);
    });

    container.classList.toggle("theme-dark", theme === "dark");
    container.classList.toggle("theme-light", theme === "light");
    container.setAttribute("data-theme", theme);

    const themedRoots = container.querySelectorAll("html, body, article, main, section, [data-theme]");
    themedRoots.forEach((node) => {
      node.classList.toggle("dark", theme === "dark");
      node.classList.toggle("light", theme === "light");
      (node as HTMLElement).setAttribute("data-theme", theme);
    });

    applyInlineTheme(container, theme);
  }, [html, theme]);

  return <div ref={containerRef} className="html-result-container" />;
}

function getInitialTheme(): ThemeMode {
  const stored = localStorage.getItem(appConfig.storageKeys.theme);
  if (stored === "light" || stored === "dark") return stored;
  return appConfig.theme.defaultMode;
}

function getInitialChatState(): { discussions: Discussion[]; selectedDiscussionId: string } {
  const initialDiscussions = loadDiscussions();
  return {
    discussions: initialDiscussions,
    selectedDiscussionId: initialDiscussions[0].id
  };
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(appConfig.storageKeys.auth) === "true";
  });
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [isMenuCollapsed, setIsMenuCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [discussions, setDiscussions] = useState<Discussion[]>(INITIAL_CHAT_STATE.discussions);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string>(
    INITIAL_CHAT_STATE.selectedDiscussionId
  );
  const [input, setInput] = useState<string>("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("chart");
  const [pendingByDiscussion, setPendingByDiscussion] = useState<Record<string, PendingRequestState>>(
    {}
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportingMessageId, setExportingMessageId] = useState<string | null>(null);
  const requestAbortRef = useRef<Map<string, AbortController>>(new Map());
  const exportSectionRef = useRef<HTMLDivElement | null>(null);
  const messagesSectionRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isDarkTheme = theme === "dark";
  const appGradient = `linear-gradient(135deg, ${appConfig.branding.gradientFrom}, ${appConfig.branding.gradientVia}, ${appConfig.branding.gradientTo})`;
  const applySuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const currentDiscussion = useMemo(
    () => discussions.find((d) => d.id === selectedDiscussionId) ?? discussions[0],
    [discussions, selectedDiscussionId]
  );
  const pendingDiscussionIds = Object.keys(pendingByDiscussion);
  const hasPendingRequests = pendingDiscussionIds.length > 0;
  const currentDiscussionPending =
    currentDiscussion && pendingByDiscussion[currentDiscussion.id]
      ? pendingByDiscussion[currentDiscussion.id]
      : null;
  const otherPendingDiscussion = useMemo(() => {
    const otherId = pendingDiscussionIds.find((id) => id !== currentDiscussion?.id);
    if (!otherId) return null;
    return discussions.find((d) => d.id === otherId) ?? null;
  }, [pendingDiscussionIds, currentDiscussion?.id, discussions]);

  const persist = (updater: Discussion[] | ((prev: Discussion[]) => Discussion[])) => {
    setDiscussions((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      localStorage.setItem(appConfig.storageKeys.discussions, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(appConfig.theme.darkClass, theme === "dark");
    localStorage.setItem(appConfig.storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (pendingDiscussionIds.length === 0) return undefined;

    const intervalId = window.setInterval(() => {
      setPendingByDiscussion((previous) => {
        const ids = Object.keys(previous);
        if (ids.length === 0) return previous;
        const now = Date.now();
        const next: Record<string, PendingRequestState> = {};
        ids.forEach((id) => {
          const current = previous[id];
          next[id] = { ...current, elapsedMs: now - current.startedAt };
        });
        return next;
      });
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [pendingDiscussionIds.length]);

  useEffect(() => {
    const container = messagesSectionRef.current;
    if (!container) return;
    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [selectedDiscussionId, currentDiscussion?.messages.length, !!currentDiscussionPending]);

  const handleCreateDiscussion = () => {
    const next = createDiscussion();
    persist((previous) => [next, ...previous]);
    setSelectedDiscussionId(next.id);
    setIsMobileMenuOpen(false);
  };

  const handleDeleteDiscussion = (discussionId: string) => {
    requestAbortRef.current.get(discussionId)?.abort();
    requestAbortRef.current.delete(discussionId);
    setPendingByDiscussion((previous) => {
      if (!previous[discussionId]) return previous;
      const next = { ...previous };
      delete next[discussionId];
      return next;
    });

    persist((previous) => {
      const next = previous.filter((d) => d.id !== discussionId);
      if (next.length > 0) {
        if (selectedDiscussionId === discussionId) {
          setSelectedDiscussionId(next[0].id);
        }
        return next;
      }

      const replacement = createDiscussion();
      setSelectedDiscussionId(replacement.id);
      return [replacement];
    });
  };

  const handleSelectDiscussion = (discussionId: string) => {
    setSelectedDiscussionId(discussionId);
    setIsMobileMenuOpen(false);
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || !currentDiscussion || pendingByDiscussion[currentDiscussion.id]) return;
    const activeDiscussionId = currentDiscussion.id;

    setInput("");
    const requestStartedAt = performance.now();
    const controller = new AbortController();
    requestAbortRef.current.set(activeDiscussionId, controller);
    setPendingByDiscussion((previous) => ({
      ...previous,
      [activeDiscussionId]: { startedAt: Date.now(), elapsedMs: 0 }
    }));

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };

    const updatedMessages = [...currentDiscussion.messages, userMessage];
    const updatedDiscussion: Discussion = {
      ...currentDiscussion,
      title:
        currentDiscussion.messages.length === 0
          ? buildDiscussionTitle(text)
          : currentDiscussion.title,
      messages: updatedMessages
    };

    persist((previous) =>
      previous.map((d) => (d.id === activeDiscussionId ? updatedDiscussion : d))
    );

    try {
      const assistantText = await sendMessageToAi({
        discussionId: activeDiscussionId,
        message: text,
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        mode: responseMode,
        signal: controller.signal
      });

      const assistantMessage: Message = {
        id: createId(),
        role: "assistant",
        content: assistantText || "Aucune réponse reçue.",
        createdAt: new Date().toISOString(),
        responseTimeMs: Math.round(performance.now() - requestStartedAt)
      };

      persist((previous) =>
        previous.map((d) => {
          if (d.id !== activeDiscussionId) return d;
          return { ...updatedDiscussion, messages: [...updatedMessages, assistantMessage] };
        })
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      const assistantError = error instanceof Error ? error.message : "Erreur inconnue";
      const errorMessage: Message = {
        id: createId(),
        role: "assistant",
        content: `Erreur: ${assistantError}`,
        createdAt: new Date().toISOString(),
        responseTimeMs: Math.round(performance.now() - requestStartedAt)
      };

      persist((previous) =>
        previous.map((d) => {
          if (d.id !== activeDiscussionId) return d;
          return { ...updatedDiscussion, messages: [...updatedMessages, errorMessage] };
        })
      );
    } finally {
      requestAbortRef.current.delete(activeDiscussionId);
      setPendingByDiscussion((previous) => {
        const next = { ...previous };
        delete next[activeDiscussionId];
        return next;
      });
    }
  };

  const handleStopResponse = () => {
    if (!currentDiscussion) return;
    const discussionId = currentDiscussion.id;
    requestAbortRef.current.get(discussionId)?.abort();
    requestAbortRef.current.delete(discussionId);
    setPendingByDiscussion((previous) => {
      const next = { ...previous };
      delete next[discussionId];
      return next;
    });
  };

  const handleCopyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === message.id ? null : prev));
      }, 1200);
    } catch {
      setCopiedMessageId(null);
    }
  };

  const handleExportCurrentDiscussion = async () => {
    if (!currentDiscussion || isExportingPdf || !exportSectionRef.current) return;

    setIsExportingPdf(true);
    try {
      const { blob: pdfBlob, fileName } = await exportRenderedDiscussionToPdf({
        title: currentDiscussion.title,
        element: exportSectionRef.current
      });
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue pendant l'export PDF";
      window.alert(message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportSingleResponse = async (
    event: MouseEvent<HTMLButtonElement>,
    message: Message
  ) => {
    if (message.role !== "assistant" || exportingMessageId) return;
    const articleElement = event.currentTarget.closest("article");
    if (!articleElement) return;

    setExportingMessageId(message.id);
    try {
      const { blob: pdfBlob, fileName } = await exportRenderedDiscussionToPdf({
        title: `${currentDiscussion?.title || "discussion"}-reponse-${message.id.slice(0, 6)}`,
        element: articleElement as HTMLElement
      });

      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur export PDF de la reponse";
      window.alert(errorMessage);
    } finally {
      setExportingMessageId((prev) => (prev === message.id ? null : prev));
    }
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-200 text-slate-800 transition-colors duration-500 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.35),_transparent_45%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.25),_transparent_35%),radial-gradient(circle_at_50%_100%,_rgba(59,130,246,0.25),_transparent_45%)]" />
      <div className="relative z-10 mx-auto flex h-screen max-w-[1440px] flex-col gap-2 p-2 focus:outline-none">
        <header className="glass-panel flex shrink-0 items-center justify-between px-4 py-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300/70 bg-slate-100/90 text-slate-700 md:hidden dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-100"
              aria-label="Ouvrir le menu"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <img
                src={isDarkTheme ? brandLogoDark : brandLogoLight}
                alt="Logo Assistant IA"
                className="h-6 w-auto"
              />
              <div>
                <h1 className="text-sm font-bold md:text-base leading-tight">Assistant IA</h1>
                <p className="text-[9px] leading-tight text-slate-600 dark:text-slate-300">{appConfig.subtitle}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(appConfig.storageKeys.auth);
                setIsAuthenticated(false);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
              aria-label="Se deconnecter"
            >
              Déconnexion
            </button>
            <ThemeToggle
              theme={theme}
              onToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              compact
            />
          </div>
        </header>

        {isMobileMenuOpen ? (
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/35 md:hidden"
          />
        ) : null}

        <div
          className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${isMenuCollapsed ? "md:grid-cols-[54px_1fr]" : "md:grid-cols-[180px_1fr]"
            }`}
        >
          <aside
            className={`glass-panel animate-slideIn fixed inset-y-0 left-0 z-40 mt-0 w-[80vw] max-w-[280px] transform flex min-h-0 flex-col overflow-hidden rounded-none transition-transform duration-200 md:relative md:z-auto md:mt-0 md:w-auto md:max-w-none md:translate-x-0 md:rounded-2xl ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
              } ${isMenuCollapsed ? "p-1" : "p-1.5"}`}
          >
            <div className="shrink-0 space-y-3">
              <div
                className={`flex items-center ${isMenuCollapsed ? "justify-center" : "justify-between"
                  }`}
              >
                {!isMenuCollapsed ? (
                  <h2 className="text-xs font-semibold md:text-sm">{appConfig.appName}</h2>
                ) : null}
                <div className={`flex items-center ${isMenuCollapsed ? "flex-col gap-2" : "gap-2"}`}>
                  <button
                    type="button"
                    onClick={() => setIsMenuCollapsed((prev) => !prev)}
                    className={`hidden rounded-lg border border-slate-300/70 bg-slate-100/90 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-100 md:inline-block ${isMenuCollapsed ? "px-1 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
                      }`}
                    aria-label={isMenuCollapsed ? "Agrandir menu" : "Reduire menu"}
                  >
                    {isMenuCollapsed ? ">>" : "Reduire"}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateDiscussion}
                className={`w-full rounded-xl font-semibold text-white shadow-lg transition hover:scale-[1.01] ${isMenuCollapsed ? "px-0 py-1 text-[10px]" : "px-2 py-1.5 text-[10px]"
                  }`}
                style={{ backgroundImage: appGradient }}
              >
                {isMenuCollapsed ? "+" : "+ Nouvelle discussion"}
              </button>
            </div>

            <div className="menu-scrollbar mt-3 flex min-h-0 flex-col gap-1 overflow-auto">
              {discussions.map((discussion) => (
                <div
                  key={discussion.id}
                  className={`rounded-xl backdrop-blur p-0 transition-colors ${discussion.id === currentDiscussion?.id
                      ? "bg-slate-300/70 dark:bg-cyan-900/25"
                      : "bg-transparent hover:bg-slate-300/70 dark:hover:bg-white/10"
                    }`}
                >
                  <div
                    className={`grid items-center gap-2 ${isMenuCollapsed ? "grid-cols-1 justify-items-center" : "grid-cols-[1fr_auto]"
                      }`}
                  >
                    <button
                      type="button"
                      className={`leading-none ${isMenuCollapsed
                          ? "h-7 w-7 rounded-full bg-slate-100/95 text-center text-[10px] dark:bg-slate-900/70"
                          : "min-w-0 w-full rounded-lg px-1 py-1 text-left text-[10px]"
                        }`}
                      onClick={() => handleSelectDiscussion(discussion.id)}
                      title={discussion.title}
                      aria-label={isMenuCollapsed ? discussion.title : `Ouvrir ${discussion.title}`}
                    >
                      <span className={`block truncate font-semibold ${isMenuCollapsed ? "text-[9px]" : "text-[10px]"}`}>
                        {isMenuCollapsed
                          ? discussion.title.slice(0, 1).toUpperCase()
                          : truncateText(discussion.title, 18)}
                      </span>
                    </button>
                    {!isMenuCollapsed ? (
                      <button
                        type="button"
                        className="rounded-md p-2 text-rose-600 transition hover:bg-rose-100/70 dark:hover:bg-rose-500/10"
                        onClick={() => handleDeleteDiscussion(discussion.id)}
                        aria-label={`Supprimer ${discussion.title}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="glass-panel flex min-h-0 flex-col overflow-hidden p-3 md:p-4">
            <div
              key={currentDiscussion?.id}
              className="animate-discussion-switch flex min-h-0 flex-1 flex-col"
              ref={exportSectionRef}
            >
              <header className="shrink-0 border-b border-white/30 pb-1 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold md:text-base leading-tight">
                      {currentDiscussion?.title || "Discussion"}
                    </h2>
                    <p className="truncate text-[8px] leading-tight text-slate-600 dark:text-slate-300">
                      ID: {currentDiscussion?.id ? truncateText(currentDiscussion.id, 28) : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCurrentDiscussion}
                    disabled={isExportingPdf}
                    className="shrink-0 rounded-lg border border-slate-300/70 bg-slate-100/90 px-2 py-1 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {isExportingPdf ? "Export..." : "Exporter PDF"}
                  </button>
                </div>
                {hasPendingRequests && !currentDiscussionPending && otherPendingDiscussion ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Reponse en cours dans: {truncateText(otherPendingDiscussion.title, 22)}
                  </p>
                ) : null}
              </header>

              <section
                ref={messagesSectionRef}
                className="mt-2 mb-3 flex min-h-0 flex-1 flex-col gap-3 overflow-auto"
              >
                {currentDiscussion?.messages.length ? (
                  currentDiscussion.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`relative rounded-2xl px-4 py-3 shadow-sm ${message.role === "user"
                          ? isDarkTheme
                            ? "ml-auto max-w-[90%] bg-gradient-to-r from-cyan-600 via-blue-600 to-violet-600 text-white md:max-w-[82%]"
                            : "ml-auto max-w-[90%] bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 text-white md:max-w-[82%]"
                          : isDarkTheme
                            ? "w-full max-w-full bg-slate-900/80 text-slate-100 backdrop-blur"
                            : "w-full max-w-full bg-transparent text-slate-800 backdrop-blur"
                        }`}
                      style={{ paddingRight: "2.5rem" }}
                    >
                      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                        {message.role === "user" ? (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(message)}
                            className="rounded-md bg-white/15 p-1 text-white transition hover:bg-white/25"
                            aria-label="Copier le message"
                            title={copiedMessageId === message.id ? "Copie" : "Copier"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                              <path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16h-9V7h9v14z" />
                            </svg>
                          </button>
                        ) : null}
                        {message.role === "assistant" ? (
                          <button
                            type="button"
                            onClick={(event) => handleExportSingleResponse(event, message)}
                            disabled={exportingMessageId === message.id}
                            className="rounded-md bg-slate-300/80 p-1 text-slate-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700"
                            aria-label="Exporter cette reponse en PDF"
                            title={exportingMessageId === message.id ? "Export..." : "Exporter PDF"}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 4.5 17.5 8H14zM8 13h8v1.5H8zm0 3h8v1.5H8zm0-6h5v1.5H8z" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                      {message.role === "assistant" && isLikelyHtml(message.content) ? (
                        <HtmlContent html={message.content} theme={theme} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}
                      {copiedMessageId === message.id ? (
                        <p className="mt-2 text-[11px] opacity-90">Copie</p>
                      ) : null}
                      {message.role === "assistant" && typeof message.responseTimeMs === "number" ? (
                        <p
                          className={`mt-2 text-[11px] ${isDarkTheme ? "text-slate-400" : "text-slate-500"
                            }`}
                        >
                          Temps de reponse: {formatDuration(message.responseTimeMs)}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div
                    className={`rounded-2xl border px-6 py-5 text-sm backdrop-blur ${isDarkTheme
                        ? "border-white/10 bg-slate-900/80 text-slate-200"
                        : "border-slate-300/70 bg-slate-100/90 text-slate-600"
                      }`}
                    style={{ overflow: "visible" }}
                  >
                    <div className="space-y-4 pr-2">
                      <p className="text-sm font-semibold uppercase tracking-wide text-cyan-500">
                        {`# 👔 Bonjour !`} Je suis votre Expert BI
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Je suis prêt à analyser vos données. Voici un aperçu de ce que je peux faire pour vous aujourd'hui.
                      </p>
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          ## 🌟 Suggestions de Questions pour Commencer
                        </p>
                        <div className="space-y-6 pr-1">
                          {EXPERT_BI_SUGGESTIONS.map((category) => (
                            <div key={category.title} className="space-y-3">
                              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                <span>{category.icon}</span>
                                {category.title}
                              </h3>
                              <div className="grid gap-2">
                                {category.items.map((item, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => applySuggestion(item.question)}
                                    className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:border-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-cyan-300 dark:hover:bg-white/5"
                                  >
                                    <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-normal break-words">
                                      {item.question.split(/(\*\*.*?\*\*|`.*?`)/).map((part, i) => {
                                        if (part.startsWith("**") && part.endsWith("**")) {
                                          return <strong key={i}>{part.slice(2, -2)}</strong>;
                                        }
                                        if (part.startsWith("`") && part.endsWith("`")) {
                                          return <code key={i} className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-cyan-600 dark:text-cyan-400">{part.slice(1, -1)}</code>;
                                        }
                                        return part;
                                      })}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentDiscussionPending ? (
                  <article
                    className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm backdrop-blur ${isDarkTheme ? "bg-slate-900/80 text-slate-100" : "bg-transparent text-slate-800"
                      }`}
                  >
                    <div className="typing-loader" aria-label="Chargement">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                    <p
                      className={`mt-2 text-[11px] ${isDarkTheme ? "text-slate-400" : "text-slate-500"
                        }`}
                    >
                      Temps en cours: {formatDuration(currentDiscussionPending.elapsedMs)}
                    </p>
                  </article>
                ) : null}
              </section>

              <form onSubmit={handleSend} className="shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Poser une question..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={!!currentDiscussionPending}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300/70 bg-slate-100/90 px-4 text-sm outline-none ring-cyan-300 transition focus:ring-2 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900/70"
                  />
                  {currentDiscussionPending ? (
                    <button
                      type="button"
                      onClick={handleStopResponse}
                      className="h-10 rounded-xl border border-slate-300/70 bg-slate-100/90 px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-200 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="h-10 rounded-xl px-5 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ backgroundImage: appGradient }}
                    >
                      Envoyer
                    </button>
                  )}
                </div>
                <div className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg border border-slate-300/70 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-slate-900/60">
                  <button
                    type="button"
                    onClick={() => setResponseMode("simple")}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${responseMode === "simple"
                        ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                  >
                    Rapide
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseMode("chart")}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${responseMode === "chart"
                        ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                  >
                    Pro
                  </button>
                </div>
              </form>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
