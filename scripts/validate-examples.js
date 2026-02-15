"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES_DIR = path.join(ROOT, "assets", "examples");
const LIST_BLOCK_HEADER_REGEX =
  /^([A-Za-z_][A-Za-z0-9_-]*|\$[A-Za-z_][A-Za-z0-9_-]*)$/;
const LIST_SHORTHAND_REGEX = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=/;
const DOLLAR_SHORTHAND_REGEX = /^\$([A-Za-z_][A-Za-z0-9_-]*)\s*=/;
const FUNCTION_HEADER_REGEX =
  /^(async\s+)?[A-Za-z_][A-Za-z0-9_$-]*\s*\([^)]*\)\s*=>\s*$/;

function parseArgs() {
  const args = process.argv.slice(2);
  let topN = 10;
  let reportPath = null;

  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === "--top" && args[i + 1]) {
      topN = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (value === "--report" && args[i + 1]) {
      reportPath = args[i + 1];
      i += 1;
    }
  }

  if (!Number.isFinite(topN) || topN <= 0) {
    topN = 10;
  }

  return { topN, reportPath };
}

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function getLargestByExt(files, ext, topN) {
  const filtered = files
    .filter((file) => file.toLowerCase().endsWith(ext))
    .map((file) => ({
      file,
      size: fs.statSync(file).size,
    }))
    .sort((a, b) => b.size - a.size);

  return filtered.slice(0, topN);
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

function stripComment(text) {
  const index = text.indexOf("//");
  if (index === -1) {
    return text;
  }
  return text.slice(0, index);
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

function isListHeaderLine(trimmedLine) {
  if (!trimmedLine) {
    return false;
  }
  if (LIST_BLOCK_HEADER_REGEX.test(trimmedLine)) {
    return true;
  }
  if (LIST_SHORTHAND_REGEX.test(trimmedLine)) {
    return true;
  }
  if (DOLLAR_SHORTHAND_REGEX.test(trimmedLine)) {
    return true;
  }
  return FUNCTION_HEADER_REGEX.test(trimmedLine);
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

function analyzePerchance(content) {
  const warnings = [];
  const lines = content.split(/\r?\n/);
  const htmlStart = findHtmlStart(lines);
  const listNameIndex = new Map();

  for (let index = 0; index < htmlStart; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) {
      continue;
    }

    const indentMatch = line.match(/^[\t ]+/);
    const indent = indentMatch ? indentMatch[0] : "";
    const contentText = line.slice(indent.length);
    const commentFree = stripComment(contentText);

    if (!indent) {
      const listName = parseListName(trimmed);
      if (listName && !listName.startsWith("$")) {
        if (listNameIndex.has(listName)) {
          warnings.push({
            line: index + 1,
            code: "duplicate-list",
            message: `Duplicate top-level list name: ${listName}`,
          });
        } else {
          listNameIndex.set(listName, index);
        }
      }
    } else {
      if (indent.includes("\t") && indent.includes(" ")) {
        warnings.push({
          line: index + 1,
          code: "mixed-indent",
          message: "Mixed tabs and spaces in indentation",
        });
      }
      const spaceCount = indent.replace(/\t/g, "").length;
      if (spaceCount % 2 !== 0) {
        warnings.push({
          line: index + 1,
          code: "odd-indent",
          message: "Indentation should use tabs or multiples of two spaces",
        });
      }
    }

    const ifElseWarnings = findIfElseSingleEquals(commentFree);
    ifElseWarnings.forEach((warning) => {
      warnings.push({
        line: index + 1,
        code: "single-equals",
        message: "If/else conditions should use == instead of =",
      });
    });
  }

  for (let index = htmlStart; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("<!--")) {
      continue;
    }
    if (isListHeaderLine(trimmed)) {
      warnings.push({
        line: index + 1,
        code: "list-after-html",
        message: "List header appears after HTML start",
      });
      break;
    }
  }

  return warnings;
}

function analyzeHtml(content) {
  const warnings = [];
  const openScript = (content.match(/<script\b[^>]*>/gi) || []).length;
  const closeScript = (content.match(/<\/script>/gi) || []).length;
  if (openScript !== closeScript) {
    warnings.push({
      line: 0,
      code: "script-tag",
      message: `Script tag count mismatch (open ${openScript}, close ${closeScript})`,
    });
  }

  const openStyle = (content.match(/<style\b[^>]*>/gi) || []).length;
  const closeStyle = (content.match(/<\/style>/gi) || []).length;
  if (openStyle !== closeStyle) {
    warnings.push({
      line: 0,
      code: "style-tag",
      message: `Style tag count mismatch (open ${openStyle}, close ${closeStyle})`,
    });
  }

  const openComments = (content.match(/<!--/g) || []).length;
  const closeComments = (content.match(/-->/g) || []).length;
  if (openComments !== closeComments) {
    warnings.push({
      line: 0,
      code: "html-comment",
      message: `HTML comment count mismatch (open ${openComments}, close ${closeComments})`,
    });
  }

  return warnings;
}

function formatSize(size) {
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function buildReport(entries, type) {
  const lines = [];
  lines.push(`== ${type.toUpperCase()} ==`);
  for (const entry of entries) {
    const relativePath = path
      .relative(ROOT, entry.file)
      .split(path.sep)
      .join("/");
    lines.push(`- ${relativePath} (${formatSize(entry.size)})`);
    if (!entry.warnings.length) {
      lines.push("  OK");
      continue;
    }
    entry.warnings.forEach((warning) => {
      const location = warning.line ? `line ${warning.line}` : "file";
      lines.push(`  ${location}: ${warning.message} [${warning.code}]`);
    });
  }
  lines.push("");
  return lines;
}

function main() {
  if (!fs.existsSync(EXAMPLES_DIR)) {
    console.error("Examples directory not found:", EXAMPLES_DIR);
    process.exitCode = 1;
    return;
  }

  const { topN, reportPath } = parseArgs();
  const files = collectFiles(EXAMPLES_DIR);

  const largestHtml = getLargestByExt(files, ".html", topN).map((entry) => {
    const content = fs.readFileSync(entry.file, "utf8");
    const warnings = analyzeHtml(content);
    return { ...entry, warnings };
  });

  const largestPerchance = getLargestByExt(files, ".perchance", topN).map(
    (entry) => {
      const content = fs.readFileSync(entry.file, "utf8");
      const warnings = analyzePerchance(content);
      return { ...entry, warnings };
    },
  );

  const reportLines = [
    `Perchance example validation report (top ${topN} by size)`,
    "",
    ...buildReport(largestHtml, "html"),
    ...buildReport(largestPerchance, "perchance"),
  ];

  const reportText = reportLines.join("\n");
  if (reportPath) {
    const outputPath = path.resolve(ROOT, reportPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, reportText, "utf8");
    console.log(`Report written to ${path.relative(ROOT, outputPath)}`);
  }

  console.log(reportText);
}

main();
