// Prompt Refiner — Content Script v2.0
// Injected via background service worker (bypasses ChatGPT CSP)

(function () {
  if (document.getElementById('prompt-refiner-sidebar')) {
    // Already injected — just toggle
    const s = document.getElementById('prompt-refiner-sidebar');
    const f = document.getElementById('prompt-refiner-fab');
    if (s && !s.classList.contains('open')) {
      s.classList.add('open');
      if (f) f.style.display = 'none';
    }
    return;
  }

  // ── Model Detection ────────────────────────────────────────────────────
  function detectModel() {
    const host = location.hostname;
    if (host.includes('chatgpt') || host.includes('openai')) return 'ChatGPT';
    if (host.includes('claude')) return 'Claude';
    if (host.includes('gemini')) return 'Gemini';
    if (host.includes('grok') || host.includes('x.com')) return 'Grok';
    if (host.includes('perplexity')) return 'Perplexity';
    if (host.includes('deepseek')) return 'DeepSeek';
    return 'ChatGPT';
  }

  // ── Find chat input ────────────────────────────────────────────────────
  function findChatInput() {
    const host = location.hostname;
    if (host.includes('chatgpt') || host.includes('openai')) {
      const tries = [
        () => document.getElementById('prompt-textarea'),
        () => document.querySelector('div[id="prompt-textarea"]'),
        () => document.querySelector('div[contenteditable="true"][data-virtualkeyboard-focusable]'),
        () => document.querySelector('div.ProseMirror[contenteditable="true"]'),
        () => {
          const all = document.querySelectorAll('div[contenteditable="true"]');
          return Array.from(all).find(el => {
            const r = el.getBoundingClientRect();
            return r.width > 200 && r.height > 20 && r.bottom > window.innerHeight * 0.5;
          });
        }
      ];
      for (const fn of tries) {
        try { const el = fn(); if (el) return el; } catch(e) {}
      }
      return null;
    }
    if (host.includes('claude'))
      return document.querySelector('div.ProseMirror[contenteditable="true"]')
          || document.querySelector('div[contenteditable="true"]');
    if (host.includes('gemini'))
      return document.querySelector('div.ql-editor[contenteditable="true"]')
          || document.querySelector('rich-textarea div[contenteditable="true"]')
          || document.querySelector('div[contenteditable="true"]');
    if (host.includes('deepseek'))
      return document.querySelector('textarea#chat-input')
          || document.querySelector('textarea[placeholder]')
          || document.querySelector('div[contenteditable="true"]');
    return document.querySelector('textarea[placeholder]')
        || document.querySelector('div[contenteditable="true"]');
  }

  function readInputText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value.trim();
    return (el.innerText || el.textContent || '').trim();
  }

  function writeToInput(el, text) {
    if (!el) return false;
    try {
      el.focus();
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, text); else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // contenteditable
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('insertText', false, text);
      if (!ok) { el.innerText = text; }
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      return true;
    } catch (e) {
      try { el.innerText = text; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
      catch (e2) { return false; }
    }
  }

  // ── Model system prompts (v2.0 — aligned with 2025-2026 best practices) ─
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

  // ── Build sidebar ──────────────────────────────────────────────────────
  const detectedModel = detectModel();

  const sidebar = document.createElement('div');
  sidebar.id = 'prompt-refiner-sidebar';
  sidebar.innerHTML = `
    <div id="pr-header">
      <div id="pr-header-left">
        <div id="pr-logo">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <div>
          <div id="pr-title">Prompt Refiner</div>
          <div id="pr-subtitle">Optimized for every AI model</div>
        </div>
      </div>
      <button id="pr-close" title="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div id="pr-model-row">
      <div id="pr-model-label">Target Model</div>
      <div id="pr-model-pills">
        ${['ChatGPT','Claude','Gemini','Grok','Perplexity','DeepSeek','Codex','Claude Code'].map(m =>
          `<button class="pr-model-pill${m === detectedModel ? ' active' : ''}" data-model="${m}">${m}</button>`
        ).join('')}
      </div>
    </div>

    <div id="pr-body">
      <div id="pr-detect-banner">
        <div id="pr-detect-icon">📋</div>
        <div id="pr-detect-content">
          <div id="pr-detect-label">Prompt detected in chat</div>
          <div id="pr-detect-preview"></div>
        </div>
        <div id="pr-detect-actions">
          <button id="pr-use-detected">Use it</button>
          <button id="pr-ignore-detected">✕</button>
        </div>
      </div>

      <div id="pr-input-wrap">
        <div class="pr-field-label">Your Draft Prompt</div>
        <textarea id="pr-input" placeholder="Paste your prompt here — rough, unstructured, however it is…"></textarea>
      </div>

      <button id="pr-refine-btn" disabled>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Refine Prompt
      </button>

      <div id="pr-status"></div>

      <div id="pr-output-wrap">
        <div class="pr-field-label">Refined Prompt</div>
        <div id="pr-output-box" class="placeholder">Your refined prompt will appear here…</div>
        <div id="pr-output-actions" style="display:none">
          <button class="pr-action-btn" id="pr-copy-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          <button class="pr-action-btn" id="pr-inject-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
            Insert into Chat
          </button>
        </div>
      </div>
    </div>

    <div id="pr-footer">
      <div id="pr-api-key-row">
        <div id="pr-api-key-label">Groq Key</div>
        <input id="pr-api-key-input" type="password" placeholder="gsk_…" autocomplete="off"/>
        <button id="pr-api-save">Save</button>
      </div>
    </div>
  `;

  const fab = document.createElement('button');
  fab.id = 'prompt-refiner-fab';
  fab.title = 'Open Prompt Refiner';
  fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

  // Append to document — use documentElement as fallback if body isn't ready
  const mountTarget = document.body || document.documentElement;
  mountTarget.appendChild(sidebar);
  mountTarget.appendChild(fab);

  // ── Wire up ────────────────────────────────────────────────────────────
  let selectedModel = detectedModel;
  let refinedPrompt = '';

  const inputEl     = document.getElementById('pr-input');
  const outputBox   = document.getElementById('pr-output-box');
  const refineBtn   = document.getElementById('pr-refine-btn');
  const statusEl    = document.getElementById('pr-status');
  const outputActions = document.getElementById('pr-output-actions');
  const apiKeyInput = document.getElementById('pr-api-key-input');
  const detectBanner  = document.getElementById('pr-detect-banner');
  const detectPreview = document.getElementById('pr-detect-preview');

  chrome.storage.local.get(['pr_groq_key'], (res) => {
    if (res.pr_groq_key) apiKeyInput.value = res.pr_groq_key;
  });

  function checkForExistingPrompt() {
    const chatInput = findChatInput();
    const text = readInputText(chatInput);
    if (text && text.length > 3) {
      detectPreview.textContent = `"${text.length > 72 ? text.slice(0, 72) + '…' : text}"`;
      detectBanner.classList.add('visible');
    } else {
      detectBanner.classList.remove('visible');
    }
  }

  function openSidebar() {
    sidebar.classList.add('open');
    fab.style.display = 'none';
    setTimeout(checkForExistingPrompt, 250);
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    fab.style.display = 'flex';
    detectBanner.classList.remove('visible');
  }

  fab.addEventListener('click', openSidebar);
  document.getElementById('pr-close').addEventListener('click', closeSidebar);

  document.getElementById('pr-use-detected').addEventListener('click', () => {
    const text = readInputText(findChatInput());
    if (text) { inputEl.value = text; inputEl.dispatchEvent(new Event('input')); }
    detectBanner.classList.remove('visible');
  });
  document.getElementById('pr-ignore-detected').addEventListener('click', () => {
    detectBanner.classList.remove('visible');
  });

  document.querySelectorAll('.pr-model-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pr-model-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedModel = pill.dataset.model;
    });
  });

  inputEl.addEventListener('input', () => {
    refineBtn.disabled = inputEl.value.trim().length === 0;
  });

  document.getElementById('pr-api-save').addEventListener('click', () => {
    chrome.storage.local.set({ pr_groq_key: apiKeyInput.value.trim() }, () => {
      statusEl.textContent = 'API key saved.';
      statusEl.className = 'success';
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 2000);
    });
  });

  // ── Refine via background worker (avoids page CSP entirely) ───────────
  refineBtn.addEventListener('click', async () => {
    const draftPrompt = inputEl.value.trim();
    if (!draftPrompt) return;

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      statusEl.textContent = 'Please enter your Groq API key below.';
      statusEl.className = 'error';
      return;
    }

    refineBtn.disabled = true;
    refineBtn.innerHTML = `<span class="pr-dots"><span></span><span></span><span></span></span> Refining…`;
    statusEl.textContent = `Optimizing for ${selectedModel}…`;
    statusEl.className = '';
    outputBox.className = 'placeholder';
    outputBox.textContent = 'Thinking…';
    outputActions.style.display = 'none';

    chrome.runtime.sendMessage({
      action: 'openai_refine',
      apiKey,
      systemPrompt: MODEL_INSTRUCTIONS[selectedModel],
      userPrompt: `Here is my draft prompt. Please refine it for ${selectedModel}:\n\n${draftPrompt}`
    }, (response) => {
      refineBtn.disabled = false;
      refineBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Refine Prompt`;
      refineBtn.disabled = inputEl.value.trim().length === 0;

      if (!response || response.error) {
        outputBox.className = 'placeholder';
        outputBox.textContent = 'Something went wrong. Check your API key and try again.';
        statusEl.textContent = response?.error || 'No response from background worker.';
        statusEl.className = 'error';
        return;
      }

      refinedPrompt = response.result;
      outputBox.className = '';
      outputBox.textContent = refinedPrompt;
      outputActions.style.display = 'flex';
      statusEl.textContent = `✓ Refined for ${selectedModel}`;
      statusEl.className = 'success';
    });
  });

  document.getElementById('pr-copy-btn').addEventListener('click', () => {
    if (!refinedPrompt) return;
    navigator.clipboard.writeText(refinedPrompt).then(() => {
      const btn = document.getElementById('pr-copy-btn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('success');
      setTimeout(() => {
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        btn.classList.remove('success');
      }, 2000);
    });
  });

  document.getElementById('pr-inject-btn').addEventListener('click', () => {
    if (!refinedPrompt) return;
    const chatInput = findChatInput();
    if (chatInput && writeToInput(chatInput, refinedPrompt)) {
      statusEl.textContent = '✓ Inserted into chat!';
      statusEl.className = 'success';
    } else {
      navigator.clipboard.writeText(refinedPrompt);
      statusEl.textContent = 'Copied to clipboard (could not find input field).';
      statusEl.className = '';
    }
  });

  // Listen for toggle from background or popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    }
  });

  // Auto-open on inject
  openSidebar();

})();
