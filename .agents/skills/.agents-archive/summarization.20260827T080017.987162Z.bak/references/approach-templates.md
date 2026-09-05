## Summarization Approaches

Choose the approach that matches the content type:

### Executive Summary
For business documents, reports, proposals, and strategy decks.

**Structure:**

1. **Bottom line first**: Lead with the key decision, recommendation, or conclusion
2. **Critical metrics**: Include the 2-4 numbers that matter most (revenue, timeline, cost, impact)
3. **Key findings**: 3-5 bullet points covering what was discovered or decided
4. **Risks and concerns**: What could go wrong, what's uncertain
5. **Next steps**: Who does what by when

**Example pattern:**
```
**Recommendation:** [One sentence with the core decision]

**Key metrics:** [2-4 data points]

**Findings:**
- [Most important finding]
- [Second most important]
- [Third]

**Risks:** [1-2 key risks]

**Next steps:** [Action items with owners and deadlines]
```

**Guidelines for executive summaries:**

- Use business language, not technical jargon
- Every sentence should help the reader make a decision
- If you can't state the bottom line in one sentence, the source material may be unclear — flag this
- Include specific numbers, not vague qualifiers ("revenue grew 23%" not "revenue grew significantly")

### Technical Summary
For technical documents, architecture docs, RFCs, code reviews, and documentation.

**Structure:**

1. **Purpose**: What problem does this solve? Why does it exist?
2. **Approach**: How does it work at a high level?
3. **Key decisions**: What technical choices were made and why?
4. **Dependencies**: What does this rely on? What relies on it?
5. **Trade-offs**: What was gained and what was sacrificed?
6. **Limitations**: Known issues, constraints, or gaps
7. **Open questions**: Unresolved decisions or areas needing further work

**Guidelines for technical summaries:**

- Preserve technical precision — don't simplify terms that have specific meanings
- Include architecture decisions and their rationale
- Note API contracts, data formats, and integration points
- Mention performance characteristics if discussed in the source
- Flag breaking changes or migration requirements

### Research/Academic Summary
For research papers, studies, whitepapers, and analytical reports.

**Structure:**

1. **Research question**: What was being investigated?
2. **Methodology**: How was the study conducted? (brief)
3. **Key findings**: The 3-5 most important results
4. **Significance**: Why do these findings matter?
5. **Limitations**: What the study doesn't cover or can't prove
6. **Implications**: What should change based on these findings?

**Guidelines for research summaries:**

- Distinguish between correlation and causation
- Include sample sizes and confidence levels when available
- Note if results are statistically significant vs practically significant
- Preserve nuance — don't overstate findings
- Flag if the methodology has notable limitations

### Conversation/Meeting Summary
For meeting notes, chat logs, email threads, and discussions.

**Structure:**

1. **Decisions made**: What was agreed upon (be specific)
2. **Action items**: Who is doing what by when
3. **Key discussion points**: The main topics debated
4. **Disagreements**: Where people differed and how it was resolved (or wasn't)
5. **Open questions**: What still needs to be decided
6. **Parking lot**: Topics raised but deferred

**Guidelines for conversation summaries:**

- Attribute decisions and action items to specific people
- Capture the "why" behind decisions, not just the "what"
- Note when consensus was reached vs when a decision was imposed
- Include deadlines and commitments
- Flag anything that seemed unresolved or contentious

### Code/Changelog Summary
For code diffs, pull requests, release notes, and changelogs.

**Structure:**

1. **What changed**: High-level description of the changes
2. **Why**: The motivation (bug fix, feature, refactor, performance)
3. **Impact**: What users/developers will notice
4. **Breaking changes**: Anything that requires migration or adaptation
5. **Notable details**: Interesting implementation choices or caveats

**Guidelines for code summaries:**

- Lead with user-facing impact, not implementation details
- Group related changes together
- Distinguish between bug fixes, features, and internal changes
- Highlight breaking changes prominently
- Note if tests were added or updated

## Core Principles
