/**
 * Mandated verbatim by the tenant-legal-documents spec: shown above a document
 * whenever the tenant has not translated it into the requested locale, in the
 * language actually served (Vietnamese) — not translated per requested locale.
 *
 * This is the one piece of legal chrome copy that deliberately does NOT live
 * in `@booking/i18n`: every other string moved there (see
 * `packages/i18n/src/locales/{vi,en}/legal.ts`), but this notice's Vietnamese
 * text must render identically regardless of the visitor's UI locale — it
 * describes what language the content was actually served in, not a UI
 * string to translate. Parking it in a per-locale resource bundle would
 * invite exactly the bug it exists to prevent: an `en` bundle entry someone
 * "corrects" into English, which is not what a `/en` visitor was shown.
 */
export const LEGAL_FALLBACK_NOTICE_VI =
  'Bản tiếng Anh chưa có. Đây là bản tiếng Việt đang có hiệu lực.';
