// Telegram Bot API helper — sends a PDF document to a chat.
// No external dependency needed: uses the global fetch API and FormData,
// both available in Node ≥18 / Next.js runtime.
//
// Env vars read by callers (not imported here so this module stays pure):
//   TELEGRAM_BOT_TOKEN  — obtained from @BotFather
//   TELEGRAM_CHAT_ID    — owner's personal chat ID (find via @userinfobot)

const TELEGRAM_API = "https://api.telegram.org";

export interface SendTelegramDocumentInput {
  botToken: string;
  chatId: string;
  pdfBuffer: Buffer;
  filename: string;
  caption?: string;
}

export async function sendTelegramDocument(input: SendTelegramDocumentInput): Promise<void> {
  const { botToken, chatId, pdfBuffer, filename, caption } = input;

  const form = new FormData();
  form.append("chat_id", chatId);
  // Copy into a plain Uint8Array so the Blob constructor receives a concrete
  // ArrayBuffer (Buffer's underlying buffer is ArrayBufferLike which includes
  // SharedArrayBuffer, rejected by the TS strict Blob type).
  form.append(
    "document",
    new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
    filename
  );
  if (caption) form.append("caption", caption);

  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendDocument`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = JSON.stringify(body);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(`Telegram sendDocument failed: HTTP ${response.status} — ${detail}`);
  }
}
