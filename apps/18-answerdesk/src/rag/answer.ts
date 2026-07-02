/**
 * Answer pipeline: retrieve -> rerank -> generate with citations.
 * TODO: hybrid search (vector + keyword); Claude answer w/ inline [n] citations
 * limited to retrieved chunks; confidence gate -> handoff offer when unsure
 * (NEVER bluff — honest deflection is the differentiator); log unanswered
 * questions for the content-gap report.
 */
export {};
