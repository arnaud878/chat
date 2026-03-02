const API_URL = import.meta.env.VITE_AI_API_URL;
const API_METHOD = (import.meta.env.VITE_AI_API_METHOD || "POST").toUpperCase();
const API_KEY = import.meta.env.VITE_AI_API_KEY;
const API_KEY_HEADER = import.meta.env.VITE_AI_API_KEY_HEADER || "Authorization";

type SendMessageParams = {
  discussionId: string;
  message: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  mode?: "simple" | "chart";
  signal?: AbortSignal;
};

function extractAssistantText(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data;

  if (typeof data === "object" && data !== null) {
    const typed = data as {
      reply?: string;
      message?: string;
      output?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (typeof typed.reply === "string") return typed.reply;
    if (typeof typed.message === "string") return typed.message;
    if (typeof typed.output === "string") return typed.output;
    if (typed.choices?.[0]?.message?.content) return typed.choices[0].message.content;
  }

  return JSON.stringify(data);
}

export async function sendMessageToAi({
  discussionId,
  message,
  messages,
  mode,
  signal
}: SendMessageParams): Promise<string> {
  if (!API_URL) {
    throw new Error("VITE_AI_API_URL est manquant dans .env");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (API_KEY) {
    headers[API_KEY_HEADER] =
      API_KEY_HEADER.toLowerCase() === "authorization" && !API_KEY.startsWith("Bearer ")
        ? `Bearer ${API_KEY}`
        : API_KEY;
  }

  const payload = {
    discussionId,
    message,
    messages,
    mode
  };

  const response = await fetch(API_URL, {
    method: API_METHOD,
    headers,
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur API (${response.status}): ${text || "reponse vide"}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const data: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return extractAssistantText(data);
}
