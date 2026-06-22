import { describe, expect, it } from "vitest";
import { splitTranscriptIntoSentences } from "../src/renderer/transcript-utils";

describe("splitTranscriptIntoSentences", () => {
  it("splits punctuation-delimited transcript text", () => {
    expect(
      splitTranscriptIntoSentences(
        "Revenue is up 18%. Why did it move? Enterprise renewals; lower churn.",
      ),
    ).toEqual([
      "Revenue is up 18%.",
      "Why did it move?",
      "Enterprise renewals;",
      "lower churn.",
    ]);
  });

  it("handles line breaks and trims empty content", () => {
    expect(
      splitTranscriptIntoSentences("\n  First line\nSecond line.\n\nThird line   "),
    ).toEqual(["First line", "Second line.", "Third line"]);
  });

  it("returns an empty array for blank transcript text", () => {
    expect(splitTranscriptIntoSentences("   \n\t  ")).toEqual([]);
  });
});
