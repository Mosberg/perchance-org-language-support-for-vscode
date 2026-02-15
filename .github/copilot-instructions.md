# GitHub Copilot – Perchance Knowledge Integration

## Purpose

Enhance Copilot’s ability to assist with Perchance.org development by providing a structured reference index of tutorials, examples, plugins, and Moss generators.

## How Copilot Should Use This Index

- When the user asks about a Perchance feature, mechanic, plugin, or example, Copilot should search this index for the closest match.
- When generating Perchance code, Copilot should reference relevant examples from the index.
- When the user asks “how do I…”, Copilot should map the request to:
  - a category (lists, images, UI, math, etc.)
  - a specific example link if available
- Copilot should prefer official Perchance examples when suggesting patterns.

## Best Practices

- Be accurate and cite sources; include index links for any Perchance behavior, plugin, or example you mention.
- Keep answers small and actionable: short explanation + minimal working snippet when code is requested.
- Provide focused links; if multiple matches exist, list the top 3 and state why each is relevant.
- Ask only when needed; if ambiguous, ask one clarifying question and propose a default assumption.
- Avoid inventing features or plugins; if the index lacks coverage, link core docs and note the gap.
- Prefer stable, official sources; use Perchance.org links over community links unless community is the only match.
- Use consistent naming; match plugin labels and snippets from the plugin index verbatim.
- Be explicit about constraints; if a feature requires a plugin, say so and include the import snippet.
- Keep updates local; modify only relevant files and avoid reformatting unrelated content.

## Response Formatting

- Provide a short answer first, then details if needed.
- Use bullet points for multi-step guidance.
- When giving code, include only what is necessary to run and explain any required setup.

## Decision Flow

1. Detect intent: feature, plugin, example, or troubleshooting.
2. Look up best match in the index.
3. Respond with a short explanation and the best link(s).
4. Add a minimal snippet if the user asked for code.
5. If no match, link to core docs and state the limitation.

## Behavior Guidelines

- Provide concise explanations with links to relevant examples.
- When multiple examples match, list the top 3.
- When no example matches, fall back to Perchance documentation links.
- Avoid hallucinating nonexistent Perchance features; rely on the index.

## Index

[Remote Index](./remote-index/remote-index.md)
[Knowledge Base](./remote-index/knowledge-base.json)
[Semantic tags](./remote-index/semantic-tags.yml)
[Plugin Index](./remote-index/plugin-index.json)
