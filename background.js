// Background Service Worker — Prompt Refiner
// Injects sidebar via scripting API (bypasses CSP), routes API calls

const SUPPORTED_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'grok.com',
  'x.com',
  'perplexity.ai',
  'chat.deepseek.com'
];

function isSupportedTab(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return SUPPORTED_HOSTS.some(h => host.includes(h));
  } catch { return false; }
}

// Inject into a tab (idempotent — content script guards against double-inject)
async function injectIntoTab(tabId, url) {
  if (!isSupportedTab(url)) return;
  try {
    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['sidebar.css']
    });
    // Then JS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    console.log('[PromptRefiner] Inject failed:', e.message);
  }
}

// Inject on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isSupportedTab(tab.url)) {
    injectIntoTab(tabId, tab.url);
  }
});

// Inject when extension icon clicked (ensures it works even if navigation missed)
chrome.action.onClicked && chrome.action.onClicked.addListener((tab) => {
  if (isSupportedTab(tab.url)) {
    injectIntoTab(tab.id, tab.url).then(() => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle' }).catch(() => {});
      }, 300);
    });
  }
});

// Handle API calls from content script (avoids CORS/CSP issues on the page)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openai_refine') {
    const { apiKey, systemPrompt, userPrompt } = msg;

    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        sendResponse({ error: data.error.message });
      } else {
        const text = data.choices?.[0]?.message?.content || '';
        sendResponse({ result: text });
      }
    })
    .catch(err => sendResponse({ error: err.message }));

    return true; // keep channel open for async response
  }

  if (msg.action === 'toggle_sidebar') {
    chrome.tabs.sendMessage(sender.tab?.id || msg.tabId, { action: 'toggle' }).catch(() => {});
  }
});
