import type { Cue, CueScript } from "./cue-model";
import { deriveKeywordsFromCueText } from "./matchers/keyword";

interface ParsedCue {
  text: string;
  authoredKeywords: string[];
  notes: string[];
}

export function compileCueScriptFromMarkdown(markdown: string): CueScript {
  const { title, body } = parseFrontMatter(markdown);
  const parsedCues = parseCueBullets(body);

  const cues: Cue[] = parsedCues.map((parsed, index) => {
    const text = parsed.text.trim();
    const keywords =
      parsed.authoredKeywords.length > 0
        ? parsed.authoredKeywords
        : deriveKeywordsFromCueText(text);
    const notes = parsed.notes.length > 0 ? parsed.notes.join("\n") : undefined;
    return {
      id: cueIdFromText(text, index),
      text,
      keywords,
      ...(notes ? { notes } : {}),
    };
  });

  return {
    version: 1,
    ...(title ? { title } : {}),
    cues,
  };
}

function parseFrontMatter(markdown: string): { title?: string; body: string } {
  if (!markdown.startsWith("---")) {
    return { body: markdown };
  }

  const lines = markdown.split(/\r?\n/u);
  if (lines.length < 3) {
    return { body: markdown };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return { body: markdown };
  }

  const headerLines = lines.slice(1, endIndex);
  const body = lines.slice(endIndex + 1).join("\n");
  const titleLine = headerLines.find((line) => line.toLowerCase().startsWith("title:"));
  const title = titleLine ? titleLine.slice("title:".length).trim() : undefined;
  return { title, body };
}

function parseCueBullets(body: string): ParsedCue[] {
  const lines = body.split(/\r?\n/u);
  const cues: ParsedCue[] = [];
  let current: ParsedCue | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }

    const topLevelMatch = line.match(/^- (.+)$/u);
    if (topLevelMatch) {
      current = parseTopLevelCue(topLevelMatch[1]);
      cues.push(current);
      continue;
    }

    const noteMatch = line.match(/^\s{2,}- (.+)$/u);
    if (noteMatch && current) {
      current.notes.push(noteMatch[1].trim());
    }
  }

  if (cues.length === 0) {
    throw new Error("No cue bullets were found in markdown script.");
  }

  return cues;
}

function parseTopLevelCue(lineText: string): ParsedCue {
  const keywordMatch = lineText.match(/\{kw:\s*([^}]+)\}/iu);
  const authoredKeywords = keywordMatch
    ? keywordMatch[1]
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 0)
    : [];
  const text = lineText.replace(/\s*\{kw:\s*[^}]+\}\s*/iu, " ").replace(/\s+/gu, " ").trim();

  return {
    text,
    authoredKeywords,
    notes: [],
  };
}

function cueIdFromText(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/gu, "-")
    .slice(0, 40);
  return `${index + 1}-${slug || "cue"}`;
}
