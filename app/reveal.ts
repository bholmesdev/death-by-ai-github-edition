export type RevealSegments = {
  segments: string[];
  footer: string;
};

const FOOTER_RE = /\(\s*[^()]*?(survived|died)\s*\)\s*$/i;

export function splitReveal(body: string): RevealSegments {
  const text = body.trim();
  const footerMatch = text.match(FOOTER_RE);
  const footer = footerMatch ? footerMatch[0].trim() : "";
  const story = (footer ? text.slice(0, text.length - footer.length) : text).trim();

  const segments = splitSentences(story);
  return { segments, footer };
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  // Intl.Segmenter with sentence granularity uses ICU rules — handles "Mr.", "U.S.", etc.
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map((s) => s.segment.trim())
    .filter(Boolean);
}
