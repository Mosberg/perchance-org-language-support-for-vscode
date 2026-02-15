"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const https = require("https");

const LANGUAGE_ID = "perchance";
const PLUGINS_FILE = path.join("assets", "data", "plugins.json");
const TEMPLATES_FILE = path.join("assets", "data", "templates.json");
const TEMPLATE_GENERATORS_FILE = path.join(
  "assets",
  "data",
  "template_generators.json",
);
const LIST_REF_REGEX = /\[\[([A-Za-z_][A-Za-z0-9_-]*)\]\]/g;
const LIST_BLOCK_HEADER_REGEX =
  /^([A-Za-z_][A-Za-z0-9_-]*|\$[A-Za-z_][A-Za-z0-9_-]*)$/;
const LIST_SHORTHAND_REGEX = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=/;
const DOLLAR_SHORTHAND_REGEX = /^\$([A-Za-z_][A-Za-z0-9_-]*)\s*=/;
const FUNCTION_HEADER_REGEX =
  /^(async\s+)?[A-Za-z_][A-Za-z0-9_$-]*\s*\([^)]*\)\s*=>\s*$/;

const TOP_LEVEL_SNIPPETS = [
  {
    label: "$meta",
    insertText:
      "$meta\n  title = ${1:}\n  description = ${2:}\n  image = ${3:}\n",
    detail: "Metadata list",
  },
  {
    label: "settings",
    insertText: "settings\n  pageTitle = ${1:}\n  introMessage = ${2:}\n",
    detail: "Main settings list",
  },
  {
    label: "userInputs",
    insertText:
      "userInputs\n  ${1:inputName}\n    label = ${2:}\n    type = ${3:text}\n",
    detail: "User input definitions",
  },
  {
    label: "imageOptions",
    insertText: "imageOptions\n  prompt = ${1:}\n  negativePrompt = ${2:}\n",
    detail: "Text-to-image options",
  },
  {
    label: "imageButtons",
    insertText: "imageButtons\n  personality = true\n  privateSave = true\n",
    detail: "Image button toggles",
  },
  {
    label: "defaultCommentOptions",
    insertText:
      "defaultCommentOptions\n  width = 100%\n  height = 400\n  commentPlaceholderText = ${1:}\n",
    detail: "Comments plugin defaults",
  },
  {
    label: "commentChannels",
    insertText:
      "commentChannels\n  allowCustomChannels = true\n  ${1:general}\n    label = ${2:General}\n",
    detail: "Comments plugin channels",
  },
  {
    label: "galleryOptions",
    insertText: "galleryOptions\n  gallery = true\n  sort = ${1:trending}\n",
    detail: "Gallery options",
  },
  {
    label: "async list",
    insertText: "async ${1:generate}() =>\n  $0\n",
    detail: "Async list function",
  },
];

const META_PROPERTY_KEYS = ["title", "description", "image", "author", "tags"];
const SETTINGS_PROPERTY_KEYS = [
  "pageTitle",
  "introMessage",
  "underImagesMessage",
  "numImages",
  "socialFeatures",
  "imageButtons",
  "imageOptions",
  "userInputs",
  "defaultCommentOptions",
  "commentChannels",
  "galleryOptions",
  "showFeedback",
  "instruction() =>",
  "startWith",
  "hideStartWith",
  "outputTo",
  "onChunk() =>",
  "onStart() =>",
  "onFinish() =>",
  "render",
];
const USER_INPUT_PROPERTY_KEYS = [
  "label",
  "tip",
  "type",
  "remember",
  "parseVariables",
  "useVariables",
  "width",
  "height",
  "takesUpFullRow",
  "foldToggleState",
  "visible() =>",
  "examples",
  "random",
  "randomAppend",
  "modifiers",
  "modifierUpdates",
  "enterKeyTriggersGeneration",
  "options",
  "defaultValue",
];
const IMAGE_OPTION_KEYS = [
  "saveTitle",
  "prompt",
  "negativePrompt",
  "resolution",
  "style",
];
const IMAGE_BUTTON_KEYS = ["personality", "privateSave"];
const COMMENT_OPTION_KEYS = [
  "width",
  "height",
  "commentPlaceholderText",
  "submitButtonText",
  "customEmojis",
  "bannedUsers",
  "adminPasswordHash",
];
const COMMENT_CHANNEL_ITEM_KEYS = [
  "label",
  "commentPlaceholderText",
  "submitButtonText",
];
const COMMENT_CHANNEL_LIST_KEYS = ["allowCustomChannels"];
const GALLERY_OPTION_KEYS = [
  "gallery",
  "sort",
  "hideIfScoreIsBelow",
  "adaptiveHeight",
  "contentFilter",
  "forceColorScheme",
  "customButton",
  "customButton2",
];
const META_LIST_ITEM_SNIPPETS = [
  {
    label: "meta:import",
    insertText: "meta:import\n  from = {import:${1:name}}\n",
    detail: "Import list items",
  },
  {
    label: "meta:position",
    insertText: "meta:position = ${1:1}",
    detail: "Position override",
  },
];

function loadJsonFile(context, relativePath) {
  const dataPath = context.asAbsolutePath(relativePath);
  try {
    const raw = fs.readFileSync(dataPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function loadPluginData(context) {
  const data = loadJsonFile(context, PLUGINS_FILE);
  return data && Array.isArray(data.plugins) ? data.plugins : [];
}

function loadTemplates(context) {
  const data = loadJsonFile(context, TEMPLATES_FILE);
  return data && Array.isArray(data.templates) ? data.templates : [];
}

function loadTemplateGenerators(context) {
  const data = loadJsonFile(context, TEMPLATE_GENERATORS_FILE);
  return data && Array.isArray(data.templates_generators)
    ? data.templates_generators
    : [];
}

function collectListDefinitions(document) {
  const definitions = new Map();
  const lines = document.getText().split(/\r?\n/);
  const htmlStart = findHtmlStart(lines);

  for (
    let lineIndex = 0;
    lineIndex < Math.min(document.lineCount, htmlStart);
    lineIndex += 1
  ) {
    const line = document.lineAt(lineIndex);
    const text = line.text;
    const trimmed = text.trim();

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("<")) {
      continue;
    }

    if (!/^\s/.test(text)) {
      const listName = parseListName(trimmed);
      if (listName && !listName.startsWith("$")) {
        definitions.set(listName, line.range.start);
      }
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

  const config = vscode.workspace.getConfiguration("perchance");
  if (!config.get("lists.enableDiagnostics", true)) {
    collection.delete(document.uri);
    return;
  }

  const diagnostics = analyzeDocument(document, config);
  collection.set(document.uri, diagnostics);
}

function createCompletionProvider(definitions, pluginItems) {
  return {
    provideCompletionItems(document, position) {
      const linePrefix = document
        .lineAt(position)
        .text.slice(0, position.character);
      const lineText = document.lineAt(position.line).text;
      const lines = document.getText().split(/\r?\n/);
      const htmlStart = findHtmlStart(lines);
      const inHtml = position.line >= htmlStart;
      const indentInfo = getIndentInfo(lineText);
      const isLineStart = linePrefix.trim().length === 0;
      const listContext = getListContext(lines, position.line);

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

      const contextualItems = [];
      if (isLineStart && !inHtml) {
        if (indentInfo.level === 0) {
          contextualItems.push(...createTopLevelCompletions());
        }

        contextualItems.push(
          ...createPropertyCompletions(listContext, indentInfo.level),
        );

        if (indentInfo.level > 0) {
          contextualItems.push(...createMetaListItemCompletions());
        }
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

      return [...contextualItems, ...listItems, ...keywordItems];
    },
  };
}

function createTopLevelCompletions() {
  return TOP_LEVEL_SNIPPETS.map((snippet) =>
    makeCompletionItem(
      snippet.label,
      snippet.insertText,
      snippet.detail,
      vscode.CompletionItemKind.Snippet,
    ),
  );
}

function createMetaListItemCompletions() {
  return META_LIST_ITEM_SNIPPETS.map((snippet) =>
    makeCompletionItem(
      snippet.label,
      snippet.insertText,
      snippet.detail,
      vscode.CompletionItemKind.Snippet,
    ),
  );
}

function createPropertyCompletions(listContext, indentLevel) {
  const items = [];
  const current = listContext.currentListName;
  const parent = listContext.parentListName;

  if (current === "$meta") {
    items.push(
      ...META_PROPERTY_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = $0`,
          "Meta property",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "settings") {
    items.push(
      ...SETTINGS_PROPERTY_KEYS.map((key) =>
        makeCompletionItem(
          key,
          key.includes("() =>") ? `${key}\n  $0` : `${key} = $0`,
          "Settings property",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (parent === "userInputs") {
    items.push(
      ...USER_INPUT_PROPERTY_KEYS.map((key) =>
        makeCompletionItem(
          key,
          key.includes("() =>") ? `${key}\n  $0` : `${key} = $0`,
          "User input property",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "imageOptions") {
    items.push(
      ...IMAGE_OPTION_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = $0`,
          "Image option",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "imageButtons") {
    items.push(
      ...IMAGE_BUTTON_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = true`,
          "Image button",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "defaultCommentOptions") {
    items.push(
      ...COMMENT_OPTION_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = $0`,
          "Comment option",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "commentChannels") {
    items.push(
      ...COMMENT_CHANNEL_LIST_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = true`,
          "Comment channel list property",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (parent === "commentChannels") {
    items.push(
      ...COMMENT_CHANNEL_ITEM_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = $0`,
          "Comment channel property",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  if (current === "galleryOptions") {
    items.push(
      ...GALLERY_OPTION_KEYS.map((key) =>
        makeCompletionItem(
          key,
          `${key} = $0`,
          "Gallery option",
          vscode.CompletionItemKind.Property,
        ),
      ),
    );
  }

  return items;
}

function makeCompletionItem(label, insertText, detail, kind) {
  const completion = new vscode.CompletionItem(label, kind);
  completion.insertText = new vscode.SnippetString(insertText);
  if (detail) {
    completion.detail = detail;
  }
  return completion;
}

function getIndentInfo(lineText) {
  const indentMatch = lineText.match(/^[\t ]*/);
  const indent = indentMatch ? indentMatch[0] : "";
  return {
    indent,
    level: countIndentLevel(indent),
  };
}

function getListContext(lines, lineIndex) {
  const lineText = lines[lineIndex] || "";
  const currentIndent = getIndentInfo(lineText).level;
  const listNames = [];
  let indentLimit = currentIndent + 1;

  for (let i = lineIndex; i >= 0; i -= 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }
    const indent = getIndentInfo(line).level;
    if (indent < indentLimit && isListHeaderLine(trimmed)) {
      const name = parseListName(trimmed);
      if (name) {
        listNames.push(name);
        indentLimit = indent;
      }
    }
    if (listNames.length >= 2) {
      break;
    }
  }

  return {
    currentListName: listNames[0] || null,
    parentListName: listNames[1] || null,
  };
}

function isListHeaderLine(trimmedLine) {
  if (!trimmedLine) {
    return false;
  }
  if (LIST_BLOCK_HEADER_REGEX.test(trimmedLine)) {
    return true;
  }
  if (FUNCTION_HEADER_REGEX.test(trimmedLine)) {
    return true;
  }
  return isFunctionListStart(trimmedLine);
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
      const config = vscode.workspace.getConfiguration("perchance");
      const indentSize = Math.max(1, config.get("format.indentSize", 2));
      const trimTrailing = config.get("format.trimTrailingWhitespace", true);
      const normalizeIndent = config.get("format.normalizeListIndent", true);
      const edits = [];
      let inListBlock = false;

      for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const line = document.lineAt(lineIndex);
        let text = line.text;
        if (trimTrailing) {
          text = text.replace(/[\t ]+$/, "");
        }
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
          if (normalizeIndent) {
            const normalized = `${" ".repeat(indentSize)}${trimmed}`;
            if (text !== normalized) {
              edits.push(vscode.TextEdit.replace(line.range, normalized));
            }
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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("perchance")) {
        if (vscode.window.activeTextEditor) {
          updateDocumentDiagnostics(vscode.window.activeTextEditor.document);
        }
      }
    }),
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

  registerCodeActions(context);
  registerFoldingProvider(context);
  registerCommands(context);
}

function deactivate() {}

function registerCodeActions(context) {
  const provider = {
    provideCodeActions(document, _range, contextInfo) {
      if (document.languageId !== LANGUAGE_ID) {
        return [];
      }

      const actions = [];
      for (const diagnostic of contextInfo.diagnostics) {
        if (diagnostic.code === "perchance.ifElseSingleEquals") {
          const fix = createIfElseEqualsFix(document, diagnostic);
          if (fix) {
            actions.push(fix);
          }
        }
      }

      return actions;
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(LANGUAGE_ID, provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
  );
}

function registerFoldingProvider(context) {
  const provider = {
    provideFoldingRanges(document) {
      if (document.languageId !== LANGUAGE_ID) {
        return [];
      }

      const lines = document.getText().split(/\r?\n/);
      const htmlStart = findHtmlStart(lines);
      const listStarts = [];

      for (let index = 0; index < htmlStart; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//")) {
          continue;
        }
        if (!/^\s/.test(line)) {
          listStarts.push(index);
        }
      }

      const ranges = [];
      for (let i = 0; i < listStarts.length; i += 1) {
        const start = listStarts[i];
        const nextStart =
          i + 1 < listStarts.length ? listStarts[i + 1] : htmlStart;
        const end = nextStart - 1;
        if (end > start) {
          ranges.push(new vscode.FoldingRange(start, end));
        }
      }

      return ranges;
    },
  };

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(LANGUAGE_ID, provider),
  );
}

function analyzeDocument(document, config) {
  const diagnostics = [];
  const definitions = collectListDefinitions(document);
  const references = collectListReferences(document);
  const checkDuplicates = config.get("lists.checkDuplicateNames", true);
  const checkIndentation = config.get("lists.checkIndentation", true);
  const checkIfElseEquals = config.get("lists.checkSingleEqualsInIf", true);

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

  if (!checkDuplicates && !checkIndentation && !checkIfElseEquals) {
    return diagnostics;
  }

  const lines = document.getText().split(/\r?\n/);
  const htmlStart = findHtmlStart(lines);
  const listNameIndex = new Map();
  let functionIndentLevel = null;

  for (let index = 0; index < htmlStart; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    const indentMatch = line.match(/^[\t ]+/);
    const indent = indentMatch ? indentMatch[0] : "";
    const indentLevel = countIndentLevel(indent);
    const content = line.slice(indent.length);
    const commentFree = stripComment(content);
    const commentFreeTrimmed = commentFree.trim();

    if (
      trimmed &&
      functionIndentLevel !== null &&
      indentLevel <= functionIndentLevel
    ) {
      functionIndentLevel = null;
    }
    if (isFunctionListStart(commentFreeTrimmed)) {
      functionIndentLevel = indentLevel;
    }

    if (checkDuplicates && !indent && trimmed) {
      const listName = parseListName(commentFreeTrimmed);
      if (listName) {
        if (listNameIndex.has(listName)) {
          diagnostics.push(
            createDiagnostic(
              index,
              0,
              listName.length,
              "Duplicate top-level list name.",
              "perchance.duplicateListName",
            ),
          );
        } else {
          listNameIndex.set(listName, index);
        }
      }
    }

    if (checkIndentation && indent) {
      if (indent.includes("\t") && indent.includes(" ")) {
        diagnostics.push(
          createDiagnostic(
            index,
            0,
            indent.length,
            "Mixed tabs and spaces in indentation.",
            "perchance.indentationMixed",
          ),
        );
      }

      const spaceCount = indent.replace(/\t/g, "").length;
      if (spaceCount % 2 !== 0) {
        diagnostics.push(
          createDiagnostic(
            index,
            0,
            indent.length,
            "Indentation should use tabs or multiples of two spaces.",
            "perchance.indentationSpacing",
          ),
        );
      }
    }

    const skipPerchanceBlocks =
      functionIndentLevel !== null && indentLevel > functionIndentLevel;
    if (checkIfElseEquals && !skipPerchanceBlocks) {
      const ifElseWarnings = findIfElseSingleEquals(commentFree);
      ifElseWarnings.forEach((warning) => {
        diagnostics.push(
          createDiagnostic(
            index,
            indent.length + warning.start,
            indent.length + warning.end,
            "If/else conditions should use == instead of =.",
            "perchance.ifElseSingleEquals",
            { line: index },
          ),
        );
      });
    }
  }

  return diagnostics;
}

function createDiagnostic(line, start, end, message, code, data) {
  const range = new vscode.Range(line, start, line, Math.max(start + 1, end));
  const diagnostic = new vscode.Diagnostic(
    range,
    message,
    vscode.DiagnosticSeverity.Warning,
  );
  if (code) {
    diagnostic.code = code;
  }
  if (data) {
    diagnostic.data = data;
  }
  return diagnostic;
}

function stripComment(text) {
  const index = text.indexOf("//");
  if (index === -1) {
    return text;
  }
  return text.slice(0, index);
}

function looksLikeHtmlStart(line) {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  if (trimmed.startsWith("<<<<<")) {
    return false;
  }
  return /<\/?[a-zA-Z]/.test(trimmed);
}

function findHtmlStart(lines) {
  let sawBlank = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed === "") {
      sawBlank = true;
      continue;
    }
    if (sawBlank && looksLikeHtmlStart(line)) {
      return index;
    }
    sawBlank = false;
  }
  return lines.length;
}

function parseListName(trimmedLine) {
  let line = trimmedLine;
  if (line.startsWith("async ")) {
    line = line.slice("async ".length).trimStart();
  }
  const match = line.match(/^[A-Za-z0-9_$][\w$-]*/);
  if (!match) {
    return null;
  }
  return match[0];
}

function isFunctionListStart(trimmedLine) {
  if (!trimmedLine) {
    return false;
  }
  return /\b=>\s*$/.test(trimmedLine);
}

function countIndentLevel(indent) {
  let level = 0;
  let spaces = 0;
  for (const char of indent) {
    if (char === "\t") {
      level += 1;
    } else if (char === " ") {
      spaces += 1;
      if (spaces === 2) {
        level += 1;
        spaces = 0;
      }
    }
  }
  return level;
}

function findIfElseSingleEquals(text) {
  const warnings = [];
  const pattern = /\[([^\]]+)\]/g;
  let match = null;
  while ((match = pattern.exec(text)) !== null) {
    const content = match[1];
    const questionIndex = content.indexOf("?");
    const colonIndex = content.indexOf(":");
    if (questionIndex === -1 || colonIndex === -1) {
      continue;
    }
    const condition = content.slice(0, questionIndex);
    if (hasSingleEquals(condition)) {
      warnings.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return warnings;
}

function hasSingleEquals(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "=") {
      continue;
    }
    const prev = text[i - 1] || "";
    const next = text[i + 1] || "";
    if (prev === "=" || next === "=") {
      continue;
    }
    if (prev === "!" || prev === ">" || prev === "<") {
      continue;
    }
    if (next === ">") {
      continue;
    }
    return true;
  }
  return false;
}

function createIfElseEqualsFix(document, diagnostic) {
  const line = diagnostic.data?.line ?? diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const updated = replaceSingleEqualsInIfElse(lineText);
  if (!updated || updated === lineText) {
    return null;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(line, 0, line, lineText.length),
    updated,
  );

  const fix = new vscode.CodeAction(
    "Replace = with == in if/else condition",
    vscode.CodeActionKind.QuickFix,
  );
  fix.edit = edit;
  fix.diagnostics = [diagnostic];
  return fix;
}

function replaceSingleEqualsInIfElse(lineText) {
  const match = lineText.match(/\[([^\]]+\?[^\]]+:[^\]]+)\]/);
  if (!match) {
    return null;
  }
  const block = match[1];
  const questionIndex = block.indexOf("?");
  if (questionIndex === -1) {
    return null;
  }
  const condition = block.slice(0, questionIndex);
  const conditionFixed = replaceFirstSingleEquals(condition, "==");
  if (!conditionFixed) {
    return null;
  }
  const fixedBlock = conditionFixed + block.slice(questionIndex);
  return lineText.replace(match[0], `[${fixedBlock}]`);
}

function replaceFirstSingleEquals(text, replacement) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "=") {
      continue;
    }
    const prev = text[i - 1] || "";
    const next = text[i + 1] || "";
    if (prev === "=" || next === "=") {
      continue;
    }
    if (prev === "!" || prev === ">" || prev === "<") {
      continue;
    }
    if (next === ">") {
      continue;
    }
    return text.slice(0, i) + replacement + text.slice(i + 1);
  }
  return null;
}

function registerCommands(context) {
  const managePlugins = vscode.commands.registerCommand(
    "perchance.managePlugins",
    async () => {
      const plugins = loadPluginData(context);
      if (!plugins.length) {
        const choice = await vscode.window.showWarningMessage(
          "No plugins found in assets/data/plugins.json.",
          "Open plugin index",
        );
        if (choice) {
          await vscode.env.openExternal(
            vscode.Uri.parse("https://perchance.org/plugins"),
          );
        }
        return;
      }

      const items = plugins.map((plugin) => ({
        label: plugin.label || plugin.url || "Plugin",
        description: plugin.description || plugin.url || "",
        detail: plugin.detail || "",
        plugin,
      }));

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a Perchance plugin",
        matchOnDescription: true,
      });
      if (!pick) {
        return;
      }

      const snippet = pick.plugin.snippet || pick.plugin.url || pick.label;
      const snippetText = snippet ? snippet.trim() : "";
      if (!snippetText) {
        vscode.window.showWarningMessage(
          "Selected plugin has no snippet or url.",
        );
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, snippetText);
        });
      } else {
        await vscode.env.clipboard.writeText(snippetText);
        vscode.window.showInformationMessage(
          "No active editor. Plugin text copied to clipboard.",
        );
      }

      const config = vscode.workspace.getConfiguration("perchance");
      const promptOpen = config.get("plugins.openUrlAfterInsert", false);
      if (promptOpen && pick.plugin.url) {
        const open = await vscode.window.showInformationMessage(
          "Open plugin docs in browser?",
          "Open",
        );
        if (open) {
          await vscode.env.openExternal(vscode.Uri.parse(pick.plugin.url));
        }
      }
    },
  );

  const createGenerator = vscode.commands.registerCommand(
    "perchance.createGenerator",
    async () => {
      const templates = loadTemplates(context);
      const templateGenerators = loadTemplateGenerators(context);
      const templateItems = templates.map((template) => ({
        label: template.label,
        description: template.description || "",
        template,
      }));
      const templateGeneratorItems = templateGenerators.map((template) => ({
        label: template.label,
        description: template.description || "",
        action: "template",
        template,
      }));

      const items = [
        ...templateItems,
        ...templateGeneratorItems,
        {
          label: "From existing generator...",
          description: "Download from perchance.org",
          action: "download",
        },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: "Create a Perchance generator",
      });
      if (!pick) {
        return;
      }

      if (pick.action === "download") {
        await createFromExistingGenerator();
        return;
      }

      if (pick.action === "template") {
        await openTemplateGenerator(pick.template);
        return;
      }

      await openGeneratorDocument(pick.template.content || "");
    },
  );

  const toggleWrap = vscode.commands.registerCommand(
    "perchance.toggleWrap",
    async () => {
      await vscode.commands.executeCommand("editor.action.toggleWordWrap");
    },
  );

  const foldAllLists = vscode.commands.registerCommand(
    "perchance.foldAllLists",
    async () => {
      await vscode.commands.executeCommand("editor.foldAll");
    },
  );

  const unfoldAllLists = vscode.commands.registerCommand(
    "perchance.unfoldAllLists",
    async () => {
      await vscode.commands.executeCommand("editor.unfoldAll");
    },
  );

  context.subscriptions.push(
    managePlugins,
    createGenerator,
    toggleWrap,
    foldAllLists,
    unfoldAllLists,
  );
}

function fetchText(url) {
  if (typeof fetch === "function") {
    return fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      return response.text();
    });
  }

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }
        response.setEncoding("utf8");
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function downloadGeneratorByName(generatorName, mode) {
  const url =
    mode === "lists"
      ? `https://perchance.org/api/downloadGenerator?generatorName=${encodeURIComponent(
          generatorName,
        )}&listsOnly=true`
      : `https://perchance.org/api/downloadGenerator?generatorName=${encodeURIComponent(
          generatorName,
        )}`;

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Downloading Perchance generator",
    },
    async () => fetchText(url),
  );
}

async function createFromExistingGenerator() {
  const generatorName = await vscode.window.showInputBox({
    title: "Perchance generator name",
    prompt: "Enter the generator name from perchance.org/<name>",
    validateInput: (value) =>
      value && value.trim() ? undefined : "Generator name is required.",
  });
  if (!generatorName) {
    return;
  }

  const config = vscode.workspace.getConfiguration("perchance");
  const defaultMode = config.get("generators.defaultDownloadMode", "lists");

  const modeChoices = [
    {
      label: "Lists only",
      description: "Download just the lists code",
      value: "lists",
    },
    {
      label: "Full generator",
      description: "Download lists and HTML",
      value: "full",
    },
  ];

  const mode = await vscode.window.showQuickPick(modeChoices, {
    placeHolder: "Select download type",
    activeItem: modeChoices.find((item) => item.value === defaultMode),
  });
  if (!mode) {
    return;
  }

  let content = "";
  try {
    content = await downloadGeneratorByName(generatorName.trim(), mode.value);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to download generator: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  await openGeneratorDocument(content);
}

async function openTemplateGenerator(template) {
  const generatorName = extractGeneratorName(template.url);
  const openUrl = template.edit_url || template.url;
  if (!generatorName) {
    if (openUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(openUrl));
    }
    return;
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: "Open template in browser", value: "open" },
      { label: "Download as generator", value: "download" },
    ],
    { placeHolder: "Use template" },
  );
  if (!choice) {
    return;
  }

  if (choice.value === "open") {
    await vscode.env.openExternal(vscode.Uri.parse(openUrl));
    return;
  }

  let content = "";
  try {
    content = await downloadGeneratorByName(generatorName, "full");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to download template: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  await openGeneratorDocument(content);
}

function extractGeneratorName(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("perchance.org")) {
      return null;
    }
    const pathName = parsed.pathname.replace(/^\//, "").trim();
    return pathName ? pathName : null;
  } catch {
    return null;
  }
}

async function openGeneratorDocument(content) {
  const document = await vscode.workspace.openTextDocument({
    language: LANGUAGE_ID,
    content,
  });
  await vscode.window.showTextDocument(document, { preview: false });
}

module.exports = {
  activate,
  deactivate,
};
