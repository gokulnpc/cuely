import { describe, expect, it } from "vitest";
import { compileCueScriptFromMarkdown } from "../src/core/cue-compiler";

describe("compileCueScriptFromMarkdown", () => {
  it("parses front matter title, cues, authored keywords, and notes", () => {
    const markdown = `---
title: Q3 Review
---
- Open with the headline number {kw: revenue, 4.2 million, growth}
  - up 18% QoQ
- Why it moved: enterprise renewals {kw: enterprise, renewals, churn}
- What we're asking for {kw: ask, headcount, budget}
`;

    const script = compileCueScriptFromMarkdown(markdown);

    expect(script.version).toBe(1);
    expect(script.title).toBe("Q3 Review");
    expect(script.cues).toHaveLength(3);
    expect(script.cues[0]?.keywords).toEqual(["revenue", "4.2 million", "growth"]);
    expect(script.cues[0]?.notes).toBe("up 18% QoQ");
  });

  it("derives keywords when cue does not provide kw tag", () => {
    const script = compileCueScriptFromMarkdown(`
- Explain enterprise renewal dynamics and churn trend
- Land the budget ask for next quarter
`);

    expect(script.cues[0]?.keywords?.length ?? 0).toBeGreaterThan(0);
    expect(script.cues[0]?.keywords).toContain("enterprise");
    expect(script.cues[1]?.keywords).toContain("budget");
  });

  it("throws when markdown has no cue bullets", () => {
    expect(() =>
      compileCueScriptFromMarkdown(`
# Heading only
No bullet cues in this document.
`),
    ).toThrow(/no cue bullets/i);
  });
});
