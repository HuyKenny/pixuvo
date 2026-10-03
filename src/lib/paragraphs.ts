/** Paragraphs of a text block (blank-line separated). */
export const paragraphs = (s: string): string[] => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
