'use strict';

const vscode = require('vscode');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ── Model system prompts (v2.0 — 2025-2026 best practices) ───────────────
const MODEL_INSTRUCTIONS = {
  ChatGPT: `You are a world-class prompt engineer specializing in OpenAI's ChatGPT/GPT models. Take the user's rough prompt and transform it into an optimized prompt for ChatGPT.

Modern GPT models work best when you define the OUTCOME and SUCCESS CRITERIA — not every internal step. Rewrite using these principles:
- Lead with the desired outcome, not a process prescription
- Define explicit success criteria: what the answer must include, avoid, decide, or produce
- Set concrete constraints: audience, length, tone, format
- Specify output format precisely (e.g. "Write for a CFO. Under 250 words. Start with the recommendation, then 3 reasons, then the ask.")
- Add stopping conditions if research or tool use is implied
- Ask for sources/citations only when factual accuracy is critical
- Only prescribe step-by-step process when the task genuinely requires a specific sequence

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  Claude: `You are a world-class prompt engineer specializing in Anthropic's Claude models. Take the user's rough prompt and transform it into an optimized prompt for Claude.

Claude responds best to XML structure, explicit roles, clear action intent, and a verification step. Rewrite using these principles:
- Wrap in XML tags: <role>, <context>, <instructions>, <output_format>, and <input>
- For long documents, place them inside <documents><document> tags BEFORE the instructions; put the task/question LAST
- Keep the main goal as one clear sentence inside <instructions>
- Be explicit: if you want Claude to DO something, say "implement X" — not "suggest changes to X"
- Add a <verification> block: "Before finalizing, check: Does it answer the real question? Are assumptions labeled? Is the recommendation actionable?"
- Include 2–3 <example> tags inside <examples> when consistent output format matters
- For bug/code review: ask for coverage-first output ("report every issue including low-confidence ones; a separate step will filter")

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  Gemini: `You are a world-class prompt engineer specializing in Google's Gemini models (Gemini 2.5/3+). Take the user's rough prompt and transform it into an optimized prompt for Gemini.

Gemini 3 is a reasoning model — long chain-of-thought stacks designed for older models can backfire. Rewrite using these principles:
- Be direct and concise; Gemini 3 may over-analyze verbose or process-heavy prompts
- For large documents or datasets: place them FIRST, then end with the specific question or instruction — e.g. "Based on the information above, [question]"
- Do NOT add "think step by step" or chain-of-thought scaffolding — Gemini handles reasoning internally
- If you want a detailed or warm response, say so explicitly (Gemini 3 is less verbose by default)
- Define output format clearly: structured sections, JSON schema, or explicit headings
- State constraints plainly: length, scope, style, what to include/exclude
- Label which parts of the output are facts vs. inferences when the task is analytical

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  Grok: `You are a world-class prompt engineer specializing in xAI's Grok. Take the user's rough prompt and transform it into an optimized prompt for Grok.

Grok is direct and handles ambiguity well — prompts should be concise and goal-oriented. Rewrite using these principles:
- State the goal in one clear sentence upfront
- Add a short role line only if it genuinely changes the response (e.g. "You are a senior security engineer. Be direct.")
- For technical tasks: provide concrete sample data or inputs
- For multi-stage tasks: use numbered micro-steps
- Define the expected output shape (e.g. "1-line conclusion → reasoning → code snippet")
- Avoid over-explaining context — Grok handles inference well
- If real-time information matters, say so explicitly

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  Perplexity: `You are a world-class prompt engineer specializing in Perplexity AI. Take the user's rough prompt and transform it into an optimized prompt for Perplexity.

Perplexity is a search-augmented AI — prompts should be precise research queries that guide citation-rich responses. Rewrite using these principles:
- Keep the core query short and focused (1–2 sentences max)
- Add context only if it materially changes the information need
- Require inline citations after each key factual claim
- Specify: "Start with a 1-sentence verdict"
- Preferred format: Verdict → 3–5 bullets with citations → short synthesis
- For time-sensitive topics, state the recency requirement (e.g. "prioritize 2025–2026 sources")
- If sources may conflict, ask Perplexity to surface the conflict and prefer official/primary sources

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  DeepSeek: `You are a world-class prompt engineer specializing in DeepSeek models (R1, V3, V4). Take the user's rough prompt and transform it into an optimized prompt for DeepSeek.

DeepSeek R1/V4 is a reasoning model that works best with clear user prompts and minimal system-layer complexity. Rewrite using these principles:
- Put all instructions in the user prompt itself (avoid complex system-level layering)
- State the goal, rules, and expected output format explicitly
- For math or formal reasoning: end with "Please reason step by step and put the final answer in \\boxed{}"
- For analysis: ask for calculations shown, assumptions labeled, and missing data stated — never invented
- Use explicit final-answer cues: "Give the final answer clearly at the end"
- For multi-step reasoning: use numbered directives
- If data is missing, instruct the model to state what is missing rather than fill in gaps

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  Codex: `You are a world-class prompt engineer specializing in OpenAI Codex (the autonomous coding agent). Take the user's rough task description and transform it into an optimized Codex agent prompt.

The best Codex prompt is NOT clever wording — it is clear task + relevant files + verification. Codex works in a loop: reads files, edits, runs commands, stops when done. Rewrite using these principles:
- State the specific coding task in concrete, unambiguous terms
- List relevant files with @filename notation (e.g. @src/auth/session.ts, @lib/db.ts)
- Separate requirements clearly: what to implement, what NOT to change, what existing patterns to follow
- For complex changes: add a Plan step — "First inspect the relevant files and produce a short implementation plan before making any edits. For small obvious fixes, proceed directly."
- Verification block (required): specify exact commands (e.g. "Run npm run typecheck, then npm test -- auth"), what passing looks like, and "Do not claim success unless all commands pass. If blocked, explain the blocker and the exact failing command."
- Final deliverable format: "Summarize changed files, tests/commands run with results, and any remaining risks."
- For parallel work: note which files each thread owns to avoid conflicts

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,

  'Claude Code': `You are a world-class prompt engineer specializing in Anthropic's Claude Code (the agentic coding CLI and IDE tool). Take the user's rough task description and transform it into an optimized Claude Code prompt.

The single highest-leverage element is verification — a clear test command transforms Claude Code's output quality. Follow the Explore → Plan → Implement → Commit workflow. Rewrite using these principles:
- Be specific: use @filename to reference files, describe symptoms not just "fix it"
- For complex or multi-file changes: open with "Plan mode first — explore [specific files], do not edit yet. Produce: current flow, root cause hypothesis, files needing changes, implementation plan, tests to run. Wait for approval before implementing."
- For small obvious fixes: skip the plan and proceed directly
- Verification block (required): "Run [exact command], then run typecheck. Do not claim success unless commands pass. If blocked, explain the blocker and exact failing command."
- For bugs: describe symptoms, expected behavior, likely file locations, and "Write a failing test first if practical"
- Context hygiene: reference specific files rather than dumping large logs; start fresh sessions for unrelated major tasks
- Final response format: "Summarize changes, files changed, test/command results, and remaining risks"

Return ONLY the refined prompt — no explanation, no preamble, no markdown fences.`,
};

// ── Groq API call (Node.js https — no fetch needed) ───────────────────────
function callGroq(apiKey, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   }
      ]
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.choices?.[0]?.message?.content || '');
        } catch {
          reject(new Error('Invalid response from Groq API'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Nonce for webview CSP ─────────────────────────────────────────────────
function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Webview sidebar provider ──────────────────────────────────────────────
class PromptRefinerProvider {
  static viewType = 'promptRefiner.sidebarView';

  constructor(extensionPath, context) {
    this._extensionPath = extensionPath;
    this._context       = context;
    this._view          = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    const nonce   = getNonce();
    const htmlRaw = fs.readFileSync(path.join(this._extensionPath, 'webview.html'), 'utf8');
    webviewView.webview.html = htmlRaw.replace(/NONCE_PLACEHOLDER/g, nonce);

    // Push API key status whenever the panel becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._sendKeyStatus();
    });
    this._sendKeyStatus();

    // ── Message router ────────────────────────────────────────────────────
    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.command) {

        case 'ready':
          this._sendKeyStatus();
          break;

        case 'saveKey': {
          const k = (msg.key || '').trim();
          if (k) await this._context.secrets.store('pr_groq_key', k);
          this._sendKeyStatus();
          webviewView.webview.postMessage({ command: 'keySaved' });
          break;
        }

        case 'refine': {
          const apiKey = await this._context.secrets.get('pr_groq_key') || '';
          if (!apiKey) {
            webviewView.webview.postMessage({ command: 'error', error: 'No API key saved. Enter your Groq key in the footer.' });
            return;
          }
          const sys = MODEL_INSTRUCTIONS[msg.model];
          if (!sys) {
            webviewView.webview.postMessage({ command: 'error', error: `Unknown model: ${msg.model}` });
            return;
          }
          try {
            const result = await callGroq(
              apiKey, sys,
              `Here is my draft prompt. Please refine it for ${msg.model}:\n\n${msg.userPrompt}`
            );
            webviewView.webview.postMessage({ command: 'refined', result });
          } catch (e) {
            webviewView.webview.postMessage({ command: 'error', error: e.message });
          }
          break;
        }

        case 'getSelection': {
          const editor = vscode.window.activeTextEditor;
          const text   = editor ? editor.document.getText(editor.selection) : '';
          webviewView.webview.postMessage({ command: 'selectionLoaded', text });
          break;
        }

        case 'insertToEditor': {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            await editor.edit(b => {
              if (editor.selection.isEmpty) b.insert(editor.selection.active, msg.text);
              else                           b.replace(editor.selection, msg.text);
            });
          } else {
            vscode.window.showInformationMessage('Prompt Refiner: No active editor to insert into.');
          }
          break;
        }
      }
    });
  }

  async _sendKeyStatus() {
    if (!this._view) return;
    const key = await this._context.secrets.get('pr_groq_key') || '';
    this._view.webview.postMessage({ command: 'keyStatus', hasKey: !!key });
  }
}

// ── Extension entry points ────────────────────────────────────────────────
function activate(context) {
  const provider = new PromptRefinerProvider(context.extensionPath, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PromptRefinerProvider.viewType,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Keyboard shortcut: refine whatever text is selected in the editor
  context.subscriptions.push(
    vscode.commands.registerCommand('promptRefiner.refineSelection', () => {
      vscode.commands.executeCommand('promptRefiner.sidebarView.focus');
      setTimeout(() => {
        if (provider._view) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const text = editor.document.getText(editor.selection);
            if (text) provider._view.webview.postMessage({ command: 'selectionLoaded', text });
          }
        }
      }, 400);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
