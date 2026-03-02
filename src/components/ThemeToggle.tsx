import type { ThemeMode } from "../config/app.config";

type ThemeToggleProps = {
  theme: ThemeMode;
  onToggle: () => void;
  compact?: boolean;
};

export default function ThemeToggle({ theme, onToggle, compact = false }: ThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex items-center rounded-full border border-white/30 bg-white/20 p-1 shadow-lg backdrop-blur transition-all duration-300 dark:border-white/20 dark:bg-black/20 ${
        compact ? "h-9 w-14" : "h-10 w-20"
      }`}
      aria-label="Changer le theme"
    >
      <span
        className={`absolute rounded-full bg-white shadow-md transition-all duration-300 dark:bg-slate-900 ${
          compact ? "h-7 w-7" : "h-8 w-8"
        } ${
          isDark ? (compact ? "translate-x-5" : "translate-x-10") : "translate-x-0"
        }`}
      />
      <span className="relative z-10 flex w-full items-center justify-between px-1 text-xs">
        <span className={`transition-transform duration-300 ${isDark ? "scale-90 opacity-50" : "animate-fadeIn"}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-amber-500">
            <path d="M12 4a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-5h-1.1a1 1 0 1 0 0 2H19a1 1 0 1 0 0-2zM7.1 12a1 1 0 0 0-1-1H5a1 1 0 1 0 0 2h1.1a1 1 0 0 0 1-1zm9.1 4.9a1 1 0 0 1 1.4 0l.8.8a1 1 0 0 1-1.4 1.4l-.8-.8a1 1 0 0 1 0-1.4zM6.6 7.3a1 1 0 0 1 0-1.4l.8-.8A1 1 0 0 1 8.8 6.5l-.8.8a1 1 0 0 1-1.4 0zm9.6-1.4a1 1 0 0 1 1.4 0l.8.8A1 1 0 0 1 17 8.7l-.8-.8a1 1 0 0 1 0-1.4zM6.6 16.9a1 1 0 0 1 1.4 0l.8.8a1 1 0 1 1-1.4 1.4l-.8-.8a1 1 0 0 1 0-1.4z" />
          </svg>
        </span>
        <span className={`transition-transform duration-300 ${isDark ? "animate-fadeIn" : "scale-90 opacity-50"}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-slate-700 dark:fill-slate-200">
            <path d="M14.7 3.5a1 1 0 0 1 .8 1.6 7.4 7.4 0 1 0 3.4 9.5 1 1 0 0 1 1.8.9 9.4 9.4 0 1 1-6.9-12 1 1 0 0 1 .9 0z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
