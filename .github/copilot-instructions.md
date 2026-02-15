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

- Be accurate and cite sources. Use index links for any Perchance behavior, plugin, or example you mention.
- Keep answers small and actionable. Provide a short explanation plus a minimal, working snippet when code is requested.
- Provide focused links. If multiple matches exist, list only the top 3 and explain why they are relevant.
- Ask only when needed. If the request is ambiguous, ask one clarifying question and propose a default assumption.
- Avoid inventing features or plugins. If the index does not cover it, link to core docs and state the gap clearly.
- Prefer stable, official sources. Use Perchance.org links over community links unless the community link is the only match.
- Use consistent naming. Match plugin labels and snippets from the plugin index verbatim.
- Be explicit about constraints. If a feature requires a plugin, say so and include the import snippet.
- Keep updates local. If the user asks for changes in the workspace, modify only the relevant files and do not reformat unrelated content.

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

[Remote Index](remote-index/remote-index.md)
[Knowledge Base](remote-index/knowledge-base.json)
[Semantic tags](remote-index/semantic-tags.yml)
[Plugin Index](remote-index/plugin-index.json)
