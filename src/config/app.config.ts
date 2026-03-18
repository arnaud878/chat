export const appConfig = {
  appName: "Assistant IA",
  subtitle: "Assistant IA conversationnel",
  storageKeys: {
    discussions: "chatbot-discussions-v1",
    theme: "chatbot-theme-v1",
    auth: "chatbot-auth-v1"
  },
  branding: {
    gradientFrom: "#22d3ee",
    gradientVia: "#3b82f6",
    gradientTo: "#a855f7"
  },
  theme: {
    defaultMode: "dark" as const,
    darkClass: "dark"
  }
};

export type ThemeMode = "light" | "dark";
