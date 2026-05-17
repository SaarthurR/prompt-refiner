const AI_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'claude.ai',
  'gemini.google.com', 'grok.com', 'x.com', 'perplexity.ai',
  'chat.deepseek.com'
];

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isAiSite(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return AI_HOSTS.some(h => host.includes(h));
  } catch { return false; }
}

function isInjectable(url) {
  // Works on any http/https page via activeTab permission
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  const btn = document.getElementById('open-sidebar-btn');
  const statusMsg = document.getElementById('status-msg');

  if (!isInjectable(tab?.url)) {
    btn.textContent = 'Cannot open here';
    btn.disabled = true;
    if (statusMsg) statusMsg.textContent = 'Navigate to any webpage to use Prompt Refiner.';
    return;
  }

  if (!isAiSite(tab?.url)) {
    if (statusMsg) statusMsg.textContent = 'Works on any page · Model auto-detected on AI sites.';
  }

  btn.addEventListener('click', async () => {
    btn.textContent = 'Opening…';
    btn.disabled = true;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['sidebar.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch(e) {
      // Already injected — just toggle
      chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    }
    window.close();
  });
});
