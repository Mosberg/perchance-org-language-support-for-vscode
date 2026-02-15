# Perchance.org Language Support for VSCode

This extension provides comprehensive language support for [Perchance.org](https://perchance.org) generators, enabling productive development with syntax highlighting, intelligent code completion, and real-time error checking.

## Features

### Declarative Language Features

- **Syntax highlighting** for Perchance lists, choices, numbers, strings, references, dynamic odds, and list functions
- **Meta highlighting** for `meta:` tags (including `meta:import` and `meta:position`) and `$meta` list items
- **Property highlighting** for assignment blocks, list settings, and async property functions
- **Special constructs** like `{|}` and `<<<placeholder>>>` markers
- **Snippet completion** for lists, $output, imports, plugins, and HTML scaffolds
- **Bracket matching, autoclosing, and autosurrounding** for `{}`, `[]`, `()`
- **Comment toggling** for single-line and block comments
- **Auto-indentation** for list blocks with smart on-enter rules
- **Folding support** with indentation and `// #region` / `// #endregion` markers

### Programmatic Language Features

- **Auto-completion** for list references (`[[name]]`), plugin imports (`{import:plugin-name}`), and choice patterns
- **Context-aware completions** for common list headers and properties (e.g. `$meta`, `settings`, `userInputs`, `imageOptions`, `defaultCommentOptions`, `commentChannels`, `galleryOptions`)
- **Error checking** with warnings for unknown list references
- **Jump-to-definition** using Ctrl+Click on list references
- **Hover information** displaying list details and plugin documentation links
- **Code formatting** normalizing list item indentation to 2 spaces

## Commands

- **Perchance: Manage Plugins** – Insert plugin snippets or open plugin docs
- **Perchance: Create Generator** – Create from templates or download from Perchance.org
- **Perchance: Toggle Wrap** – Toggle editor word wrap
- **Perchance: Fold All Lists** – Fold all list blocks
- **Perchance: Unfold All Lists** – Unfold all list blocks

## Quick Start

1. Install the extension
2. Create or open a `.per` file
3. Start creating your generator with list syntax:

```
adjective
  beautiful
  ugly
  clever

noun
  cat
  dog
  bird

[$output]
[[adjective]] [[noun]]
```

## Plugin Support

The extension provides auto-completion and documentation for 60+ official Perchance plugins. Type `{import:` to see available plugins, or visit the [Plugin Index](https://perchance.org/plugins).

## Code Snippets

The extension includes 30+ snippets to accelerate development. Type any prefix to trigger:

### Core Patterns

- `list` – Create a basic list
- `list=` – Create a shorthand list assignment
- `output` – Create an output list
- `choice` – Inline random choice
- `choice-multi` – Multi-line choice block
- `list-odds` – List with weighted odds

### Advanced Features

- `list-fn` – Function-based list
- `list-async-fn` – Async function list
- `if-else` – Conditional logic
- `string-fn` – String manipulation
- `array-join` – Join array items

### Imports & Configuration

- `import` – Import generator or plugin
- `meta` – Define generator metadata
- `preprocess` – Define custom preprocessor
- `variables` – Declare global variables
- `region` – Code folding marker

### Plugin Integration

- `plugin` – Generic plugin import
- `consumable` – Consumable list template
- `tap` – Tap/click interactive pattern
- `seeder` – Copy-paste seed support
- `kv-store` – Key-value storage
- `dice` – Dice roller pattern
- `filter` – Dynamic list filtering
- `table` – HTML table generation
- `remember` – Persistent storage
- `a-an` – Automatic a/an grammar
- `be` – Auto is/are conjugation
- `title-case` – Title casing
- `image` – Image embedding
- `bg-image` – Background image

### HTML & Styling

- `html-template` – Basic HTML scaffold
- `button` – Interactive button
- `style` – CSS styling section
- `hierarchy` – Hierarchical list structure
- `dynamic-import` – Lazy-load generators

## Templates

The extension includes 16 ready-to-use templates demonstrating common patterns:

| Template                 | Purpose                                 |
| ------------------------ | --------------------------------------- |
| **Basic Generator**      | Simple HTML with button                 |
| **Blank Generator**      | Lists-only template                     |
| **Centered Minimal**     | Centered soft-background layout         |
| **Dark Card**            | Dark mode card style                    |
| **Markdown**             | Markdown rendering with markdown-plugin |
| **Weighted Choices**     | Probability-weighted selections         |
| **Character Generator**  | Hierarchical character sheet            |
| **Dice Roller**          | d20/dice-plugin example                 |
| **Data Table**           | HTML table generation                   |
| **NPC Generator**        | Detailed NPC with personality traits    |
| **Interactive Story**    | Branching narrative elements            |
| **Consumable Inventory** | Item system with consumable plugin      |
| **Tap Interactive**      | Click-to-randomize elements             |
| **Seed Tracker**         | Reproducible results with seeder-plugin |
| **Text-to-Speech**       | Audio generation demo                   |
| **Multi-Column Layout**  | Grid-based display                      |
| **Image Gallery**        | Image showcase format                   |

## Validation Tools

Run a scripted scan against the largest example files:

```
node scripts/validate-examples.js --top 10 --report reports/validation-report.txt
```

This checks for common list issues (duplicate list names, indentation problems, inline if/else `=` usage) and basic HTML tag matching on the largest example files.

## References

- [Perchance Tutorial](https://perchance.org/tutorial) – Learn the basics
- [Advanced Tutorial](https://perchance.org/advanced-tutorial) – Dive deeper
- [Plugin Index](https://perchance.org/plugins) – Browse all plugins
- [Official Resources](https://perchance.org/resources) – Complete documentation

## Release Notes

### 1.0.0

Initial release with full language support for Perchance:

- Syntax highlighting and snippets
- List reference completion and diagnostics
- Plugin auto-completion with documentation
- Code formatting and folding
- 30+ snippets for common patterns
- 16 ready-to-use generator templates
- Dynamic odds, consumable, and plugin patterns

**Enjoy!**
