"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const LANGUAGE_ID = "perchance";
const LIST_REF_REGEX = /\[\[([A-Za-z_][A-Za-z0-9_]*)\]\]/g;
const LIST_BLOCK_HEADER_REGEX =
  /^([A-Za-z_][A-Za-z0-9_]*|\$[A-Za-z_][A-Za-z0-9_]*)$/;
const LIST_SHORTHAND_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const DOLLAR_SHORTHAND_REGEX = /^\$([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function loadPluginData(context) {
  const dataPath = context.asAbsolutePath(
    path.join("assets", "data", "plugins.json"),
  );
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.plugins) ? parsed.plugins : [];
  } catch (error) {
    return [];
  }
}

function collectListDefinitions(document) {
  const definitions = new Map();

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const line = document.lineAt(lineIndex);
    const text = line.text;
    const trimmed = text.trim();

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("<")) {
      continue;
    }

    let match = trimmed.match(LIST_BLOCK_HEADER_REGEX);
    if (match) {
      const name = match[1];
      if (!name.startsWith("$")) {
        definitions.set(name, line.range.start);
      }
      continue;
    }

    match = trimmed.match(LIST_SHORTHAND_REGEX);
    if (match) {
      definitions.set(match[1], line.range.start);
      continue;
    }

    match = trimmed.match(DOLLAR_SHORTHAND_REGEX);
    if (match) {
      continue;
    }
  }

  return definitions;
}

function collectListReferences(document) {
  const references = [];

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const line = document.lineAt(lineIndex);
    const text = line.text;
    let match;

    LIST_REF_REGEX.lastIndex = 0;
    while ((match = LIST_REF_REGEX.exec(text))) {
      references.push({
        name: match[1],
        line: lineIndex,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return references;
}

function updateDiagnostics(document, collection) {
  if (document.languageId !== LANGUAGE_ID) {
    return;
  }

  const definitions = collectListDefinitions(document);
  const references = collectListReferences(document);
  const diagnostics = [];

  references.forEach((ref) => {
    if (!definitions.has(ref.name)) {
      const range = new vscode.Range(
        new vscode.Position(ref.line, ref.start),
        new vscode.Position(ref.line, ref.end),
      );
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Unknown list reference: ${ref.name}`,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    }
  });

  collection.set(document.uri, diagnostics);
}

function createCompletionProvider(definitions, pluginItems) {
  return {
    provideCompletionItems(document, position) {
      const linePrefix = document
        .lineAt(position)
        .text.slice(0, position.character);

      if (/\{import:[A-Za-z0-9_-]*$/i.test(linePrefix)) {
        return pluginItems.map((item) => {
          const completion = new vscode.CompletionItem(
            item.label,
            vscode.CompletionItemKind.Module,
          );
          completion.insertText = item.label;
          completion.detail = item.description || "Perchance plugin";
          if (item.url) {
            completion.documentation = new vscode.MarkdownString(
              `[Plugin docs](${item.url})`,
            );
          }
          return completion;
        });
      }

      // Curly block choice pattern suggestion
      if (/\{[^}]*$/.test(linePrefix) && !linePrefix.includes("import:")) {
        const choicePatterns = [
          {
            label: "choice1 | choice2",
            insertText: "choice1 | choice2",
            detail: "Random choice between options",
          },
          {
            label: "50% option1 | 50% option2",
            insertText: "50% option1 | 50% option2",
            detail: "Weighted random choice",
          },
        ];
        return choicePatterns.map((pattern) => {
          const completion = new vscode.CompletionItem(
            pattern.label,
            vscode.CompletionItemKind.Snippet,
          );
          completion.insertText = pattern.insertText;
          completion.detail = pattern.detail;
          return completion;
        });
      }

      const listItems = Array.from(definitions.keys()).map((name) => {
        const completion = new vscode.CompletionItem(
          `[[${name}]]`,
          vscode.CompletionItemKind.Variable,
        );
        completion.insertText = `[[${name}]]`;
        completion.detail = "List reference";
        return completion;
      });

      const keywordItems = [
        "$output",
        "$meta",
        "$preprocess",
        "$variables",
      ].map((keyword) => {
        const completion = new vscode.CompletionItem(
          keyword,
          vscode.CompletionItemKind.Keyword,
        );
        completion.insertText = keyword;
        return completion;
      });

      return [...listItems, ...keywordItems];
    },
  };
}

function createHoverProvider(definitions, pluginsByLabel) {
  return {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(
        position,
        /[A-Za-z_][A-Za-z0-9_-]*/,
      );

      if (!range) {
        return undefined;
      }

      const word = document.getText(range);

      if (definitions.has(word)) {
        const markdown = new vscode.MarkdownString(`**List**: ${word}`);
        return new vscode.Hover(markdown, range);
      }

      if (pluginsByLabel.has(word)) {
        const plugin = pluginsByLabel.get(word);
        const markdown = new vscode.MarkdownString(
          `**Plugin**: ${word}\n\n[Open docs](${plugin.url})`,
        );
        return new vscode.Hover(markdown, range);
      }

      return undefined;
    },
  };
}

function createDefinitionProvider(definitions) {
  return {
    provideDefinition(document, position) {
      const line = document.lineAt(position.line);
      const lineText = line.text;

      LIST_REF_REGEX.lastIndex = 0;
      let match;
      while ((match = LIST_REF_REGEX.exec(lineText))) {
        const start = match.index;
        const end = match.index + match[0].length;
        if (position.character >= start && position.character <= end) {
          const name = match[1];
          if (definitions.has(name)) {
            const target = definitions.get(name);
            return new vscode.Location(document.uri, target);
          }
        }
      }

      return undefined;
    },
  };
}

function createFormattingProvider() {
  return {
    provideDocumentFormattingEdits(document) {
      const edits = [];
      let inListBlock = false;

      for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const line = document.lineAt(lineIndex);
        const text = line.text;
        const trimmed = text.trim();

        if (!trimmed) {
          inListBlock = false;
          continue;
        }

        if (trimmed.startsWith("//") || trimmed.startsWith("<")) {
          inListBlock = false;
          continue;
        }

        if (LIST_BLOCK_HEADER_REGEX.test(trimmed)) {
          inListBlock = true;
          continue;
        }

        if (inListBlock && /^\s+/.test(text)) {
          const normalized = `  ${trimmed}`;
          if (text !== normalized) {
            edits.push(vscode.TextEdit.replace(line.range, normalized));
          }
          continue;
        }

        inListBlock = false;
      }

      return edits;
    },
  };
}

function activate(context) {
  const pluginData = loadPluginData(context);
  const pluginsByLabel = new Map(
    pluginData
      .filter((plugin) => plugin.label)
      .map((plugin) => [plugin.label, plugin]),
  );

  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  context.subscriptions.push(diagnosticCollection);

  const updateDocumentDiagnostics = (document) =>
    updateDiagnostics(document, diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    updateDocumentDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateDocumentDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) =>
      updateDocumentDiagnostics(event.document),
    ),
    vscode.workspace.onDidCloseTextDocument((document) =>
      diagnosticCollection.delete(document.uri),
    ),
  );

  const selector = { language: LANGUAGE_ID, scheme: "file" };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          const definitions = collectListDefinitions(document);
          const completionProvider = createCompletionProvider(
            definitions,
            pluginData,
          );
          return completionProvider.provideCompletionItems(document, position);
        },
      },
      ":",
      "[",
      "{",
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const definitions = collectListDefinitions(document);
        return createHoverProvider(definitions, pluginsByLabel).provideHover(
          document,
          position,
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(document, position) {
        const definitions = collectListDefinitions(document);
        return createDefinitionProvider(definitions).provideDefinition(
          document,
          position,
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      selector,
      createFormattingProvider(),
    ),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
