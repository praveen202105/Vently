import { api } from './client';

export interface TranslateResult {
  detectedLanguage: string;
  translated: string;
  /** 0–3 localized reply chip suggestions in the target language. */
  chips: string[];
}

/**
 * Call the translate endpoint for a specific message.
 * @param conversationId  The conversation the message belongs to.
 * @param messageId       The message id to translate.
 * @param targetLocale    BCP-47 locale of the viewer (e.g. "en", "hi", "es").
 */
export function translateMessage(
  conversationId: string,
  messageId: string,
  targetLocale: string,
): Promise<TranslateResult> {
  return api<TranslateResult>(
    `/conversations/${conversationId}/messages/${messageId}/translate`,
    {
      method: 'POST',
      body: { targetLocale },
    },
  );
}
