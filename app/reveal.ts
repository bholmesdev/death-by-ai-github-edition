export type RevealSegments = {
  paragraphs: string[];
  footer: string;
};

export function splitReveal(body: string): RevealSegments {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const footer = paragraphs.pop() ?? "";

  return { paragraphs, footer };
}
