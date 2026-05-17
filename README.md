# Prompt Refiner v2.0

Refine AI prompts for **ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, Codex, and Claude Code** — using 2025 model-specific best practices. Powered by [Groq](https://groq.com) (free tier available).

---

## What it does

You write a rough prompt. You pick the model you're sending it to. You click **Refine**. You get back a prompt that follows the documented best practices for that specific model — not generic advice, but the actual structural and linguistic patterns each model responds best to.

- **ChatGPT** → outcome-first, success criteria, stop conditions
- **Claude** → XML structure, `<role>/<context>/<instructions>/<verification>`
- **Gemini** → direct/concise, data-first, no chain-of-thought scaffolding
- **Grok** → goal-first, output shape defined
- **Perplexity** → citation-led research query format
- **DeepSeek** → user-prompt-first, explicit final-answer format
- **Codex** → task + @files + verification commands + deliverable format
- **Claude Code** → Explore → Plan → Implement → Commit, verification loop

---

## Get a Groq API key (free)

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up → API Keys → Create key
3. Copy the key starting with `gsk_`

---

## Chrome / Arc / Brave / Edge extension

### Install (developer mode — immediate, no review wait)

1. Download or clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the **root folder** of this repo (the one containing `manifest.json`)
5. The ✦ star icon appears in your toolbar

### Use it

- **On AI sites** (ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek): a floating ✦ button appears bottom-right automatically
- **On any other page** (GitHub, docs, your IDE's web view, wherever): click the toolbar icon → **Open Sidebar on This Page**
- Pick your target model, paste your draft prompt, click **Refine**, then **Copy** or **Insert into Chat**
- Enter your Groq API key in the footer the first time — it's stored locally in Chrome, never sent anywhere except Groq

### Publish to Chrome Web Store (optional)

1. Create a developer account at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
2. Zip the root folder: `zip -r prompt-refiner.zip . --exclude "*/vscode/*" --exclude "*/.git/*" --exclude "*/node_modules/*"`
3. Upload the zip → fill in store listing → submit for review (usually 1–3 days)

---

## VS Code / Cursor extension

The VS Code extension adds a **sidebar panel** directly inside the editor. Same 8 models, plus two IDE-specific features:
- **Use Editor Selection** — pulls whatever text you've highlighted in the editor into the draft field
- **Insert to Editor** — writes the refined prompt back at your cursor (or replaces your selection)

### Install via VSIX (recommended)

```bash
cd vscode
npm install          # installs @vscode/vsce
npm run package      # produces prompt-refiner-2.0.0.vsix
```

Then in VS Code:
- `Ctrl+Shift+P` → **Extensions: Install from VSIX** → select the `.vsix` file
- Or from terminal: `code --install-extension vscode/prompt-refiner-2.0.0.vsix`

The ✦ star icon appears in the Activity Bar on the left.

### Install in dev/debug mode (no packaging needed)

1. Open the `vscode/` folder in VS Code: `code vscode/`
2. Press `F5` — a new VS Code window opens with the extension loaded
3. Click the ✦ icon in the Activity Bar

### Use it

1. Open the Prompt Refiner panel from the Activity Bar
2. Enter your Groq key in the footer → Save (stored in VS Code SecretStorage — encrypted, not in settings)
3. Highlight text in any editor file → click **Use Editor Selection** to pull it in
4. Pick your target model, refine, then **Copy** or **Insert to Editor**
5. Keyboard shortcut: `Cmd+Shift+Alt+R` (Mac) / `Ctrl+Shift+Alt+R` (Windows/Linux) to refine the current selection

### Works in Cursor

Cursor is VS Code under the hood — the VSIX installs and runs identically.

---

## JetBrains (IntelliJ, WebStorm, PyCharm…)

JetBrains uses a separate plugin system (Kotlin/Java). A JetBrains plugin is planned. In the meantime, use the Chrome extension alongside your JetBrains IDE — open any web page, activate the sidebar, refine your prompt, copy it, paste it into your IDE's AI assistant.

---

## File structure

```
prompt-refiner-extension/    ← Chrome extension (load this folder as unpacked)
  manifest.json
  content.js                 ← sidebar UI + model detection + all 8 MODEL_INSTRUCTIONS
  background.js              ← service worker, Groq API calls
  popup.html / popup.js      ← toolbar popup
  sidebar.css                ← sidebar styles
  icons/

  vscode/                    ← VS Code extension
    package.json
    extension.js             ← extension host: MODEL_INSTRUCTIONS, Groq API, message routing
    webview.html             ← sidebar UI (self-contained HTML/CSS/JS)
    media/icon.svg
    .vscodeignore
```

---

## Privacy

- Your Groq API key is stored locally only (Chrome storage / VS Code SecretStorage)
- Your prompts are sent to Groq's API to run Llama 3.3 70B — subject to [Groq's privacy policy](https://groq.com/privacy-policy/)
- Nothing is stored on any server we operate — there is no backend

---

## Contributing

Pull requests welcome. When adding a new model:
1. Add `MODEL_INSTRUCTIONS['ModelName']` in both `content.js` and `vscode/extension.js`
2. Add the pill to the pills array in `content.js` and the pill button in `vscode/webview.html`
3. Add host detection to `detectModel()` and `findChatInput()` in `content.js` if the model has a web UI
4. Add the host to `SUPPORTED_HOSTS` in `background.js`, `popup.js`, and `manifest.json` host_permissions
