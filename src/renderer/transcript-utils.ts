export function splitTranscriptIntoSentences(rawTranscript: string): string[] {
  const normalized = rawTranscript.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const chunks = normalized.match(/[^.!?;\n]+[.!?;]?/g) ?? [];
  const sentences: string[] = [];

  for (const chunk of chunks) {
    const sentence = chunk.trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }

  return sentences;
}
