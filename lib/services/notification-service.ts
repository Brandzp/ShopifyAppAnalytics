export async function sendEmailDigestPlaceholder(summaryId: string) {
  // TODO: Add email digest delivery integration.
  return { channel: "email", status: "not_implemented", summaryId } as const;
}

export async function sendSlackDigestPlaceholder(summaryId: string) {
  // TODO: Add Slack notification delivery integration.
  return { channel: "slack", status: "not_implemented", summaryId } as const;
}

export async function sendWhatsAppDigestPlaceholder(summaryId: string) {
  // TODO: Add WhatsApp notification delivery integration.
  return { channel: "whatsapp", status: "not_implemented", summaryId } as const;
}
