import type { ResponseVerdict } from "./game.server";

export type RevealSegments = {
  sentences: string[];
  footer: string;
};

export function splitReveal(body: string, response: ResponseVerdict): RevealSegments {
  const footer = `( ${response.verdict === "survived" ? "❤️" : "💀"} ${response.playerName} ${response.verdict} )`;
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const sentences = [...segmenter.segment(body)]
    .map((segment) => segment.segment.trim())
    .filter(Boolean);

  return { sentences, footer };
}
