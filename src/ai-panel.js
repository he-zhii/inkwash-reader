// ══════════════════════════════════════════════════
//  DeepRead AI Panel — UI Logic
//  Left: X-Ray Navigation  |  Right: Deep Talk
// ══════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Detect if on article page ──────────────────
  const articleBody = document.querySelector('.article-body.prose');
  if (!articleBody) return; // Only run on article pages

  const articleText = articleBody.innerText || articleBody.textContent;
  const articleSlug = location.pathname.split('/').pop().replace('.html', '');

  // ── State ──────────────────────────────────────
  let xrayData = null;
  let chatHistory = [];
  let currentSelectedText = '';
  let isStreaming = false;

  // ══════════════════════════════════════════════════
  //  BUILD UI
  // ══════════════════════════════════════════════════

  // ── Left Nav Toggle Button ─────────────────────
  const navToggle = document.createElement('button');
  navToggle.className = 'ai-nav-toggle';
  navToggle.setAttribute('aria-label', '打开 AI 导航');
  navToggle.innerHTML = '🧠<span class="badge-dot"></span>';
  document.body.appendChild(navToggle);

  // ── Left Nav Panel ─────────────────────────────
  const navPanel = document.createElement('div');
  navPanel.className = 'ai-nav-panel';
  navPanel.innerHTML = `
    <div class="ai-nav-header">
      <h3><span class="ai-icon">🧠</span> 文章导航</h3>
      <div class="ai-nav-actions">
        <button class="ai-nav-btn" id="aiSettingsBtn" title="设置">⚙️</button>
        <button class="ai-nav-btn" id="aiRefreshBtn" title="重新分析">🔄</button>
      </div>
    </div>
    <div class="ai-nav-body" id="aiNavBody">
      <div class="ai-generate-area" id="aiGenerateArea">
        <div class="ai-gen-icon">🧠</div>
        <p>点击下方按钮，AI 将分析文章<br>生成结构化导航</p>
        <button class="ai-generate-btn" id="aiGenerateBtn">▶ 开始分析</button>
      </div>
    </div>
  `;
  document.body.appendChild(navPanel);

  // ── Floating Selection Toolbar ─────────────────
  const selToolbar = document.createElement('div');
  selToolbar.className = 'ai-selection-toolbar';
  selToolbar.innerHTML = `
    <button class="ai-sel-btn" data-mode="explain"><span class="sel-icon">🔍</span>解释</button>
    <button class="ai-sel-btn" data-mode="example"><span class="sel-icon">📝</span>举例</button>
    <div class="ai-sel-divider"></div>
    <button class="ai-sel-btn" data-mode="analyze"><span class="sel-icon">🧩</span>拆解</button>
    <button class="ai-sel-btn" data-mode="discuss"><span class="sel-icon">💬</span>讨论</button>
  `;
  document.body.appendChild(selToolbar);

  // ── Right-click Context Menu ───────────────────
  const ctxMenu = document.createElement('div');
  ctxMenu.className = 'ai-context-menu';
  ctxMenu.innerHTML = `
    <button class="ai-ctx-item" data-mode="explain"><span class="ctx-icon">🔍</span>解释这段内容</button>
    <button class="ai-ctx-item" data-mode="example"><span class="ctx-icon">📝</span>举例说明</button>
    <button class="ai-ctx-item" data-mode="analyze"><span class="ctx-icon">🧩</span>深度拆解</button>
    <div class="ai-ctx-divider"></div>
    <button class="ai-ctx-item" data-mode="discuss"><span class="ctx-icon">💬</span>自由讨论</button>
  `;
  document.body.appendChild(ctxMenu);

  // ── Right Deep Talk Panel ──────────────────────
  const talkOverlay = document.createElement('div');
  talkOverlay.className = 'ai-talk-overlay';
  document.body.appendChild(talkOverlay);

  const talkPanel = document.createElement('div');
  talkPanel.className = 'ai-talk-panel';
  talkPanel.innerHTML = `
    <div class="ai-talk-header">
      <h3>💬 Deep Talk</h3>
      <button class="ai-talk-close" id="aiTalkClose">✕</button>
    </div>
    <div class="ai-talk-context" id="aiTalkContext" style="display:none;">
      <div class="ai-talk-context-label">📌 选中内容</div>
      <div class="ai-talk-context-text" id="aiTalkContextText"></div>
    </div>
    <div class="ai-talk-messages" id="aiTalkMessages"></div>
    <div class="ai-talk-input-area">
      <textarea class="ai-talk-input" id="aiTalkInput" placeholder="输入你的想法..." rows="1"></textarea>
      <button class="ai-talk-send" id="aiTalkSend" title="发送">▶</button>
    </div>
  `;
  document.body.appendChild(talkPanel);

  // ── Settings Modal ─────────────────────────────
  const settingsOverlay = document.createElement('div');
  settingsOverlay.className = 'ai-settings-overlay';
  const cfg = AIService.getConfig();
  settingsOverlay.innerHTML = `
    <div class="ai-settings-modal">
      <div class="ai-settings-title">⚙️ AI 设置</div>
      <div class="ai-settings-group">
        <label>API Key</label>
        <input type="password" id="aiSettingsKey" value="${cfg.apiKey}" />
      </div>
      <div class="ai-settings-group">
        <label>Base URL</label>
        <input type="text" id="aiSettingsUrl" value="${cfg.baseUrl}" />
      </div>
      <div class="ai-settings-group">
        <label>模型</label>
        <select id="aiSettingsModel">
          ${cfg.models.map(m => `<option value="${m.id}" ${m.id === cfg.model ? 'selected' : ''}>${m.name}</option>`).join('')}
        </select>
      </div>
      <div class="ai-settings-actions">
        <button class="ai-btn-cancel" id="aiSettingsCancel">取消</button>
        <button class="ai-btn-save" id="aiSettingsSave">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(settingsOverlay);

  // ══════════════════════════════════════════════════
  //  LEFT NAV PANEL LOGIC
  // ══════════════════════════════════════════════════

  // Toggle nav panel
  navToggle.addEventListener('click', () => {
    const isOpen = navPanel.classList.toggle('open');
    navToggle.classList.toggle('active', isOpen);
    document.body.classList.toggle('ai-nav-open', isOpen);
  });

  // Generate X-Ray analysis
  const generateBtn = document.getElementById('aiGenerateBtn');
  const navBody = document.getElementById('aiNavBody');
  const generateArea = document.getElementById('aiGenerateArea');

  generateBtn.addEventListener('click', () => runXRayAnalysis(false));

  document.getElementById('aiRefreshBtn').addEventListener('click', () => {
    if (confirm('重新分析将覆盖已有的导航数据，确定吗？')) {
      runXRayAnalysis(true);
    }
  });

  async function runXRayAnalysis(forceRefresh) {
    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ 分析中…';

    // Show loading shimmer
    if (generateArea) generateArea.style.display = 'none';
    navBody.innerHTML = `
      <div class="ai-loading">
        <div class="ai-shimmer" style="width:100%"></div>
        <div class="ai-shimmer"></div>
        <div class="ai-shimmer"></div>
        <div class="ai-shimmer"></div>
        <div class="ai-shimmer"></div>
      </div>
    `;

    try {
      if (forceRefresh) {
        // Clear cache
        try {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('deepread', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const tx = db.transaction('xray_cache', 'readwrite');
          tx.objectStore('xray_cache').delete(articleSlug);
        } catch (e) { /* ignore */ }
      }

      xrayData = await AIService.analyzeArticle(articleSlug, articleText);
      renderXRay(xrayData);
      navToggle.querySelector('.badge-dot').classList.add('show');
    } catch (err) {
      navBody.innerHTML = `
        <div class="ai-generate-area">
          <p style="color:var(--accent)">分析失败：${err.message}</p>
          <button class="ai-generate-btn" onclick="location.reload()">重试</button>
        </div>
      `;
    }
  }

  function renderXRay(data) {
    let html = '';

    // Summary
    html += `
      <div class="ai-summary-section">
        <div class="ai-summary-label">📋 全文摘要</div>
        <div class="ai-summary-text">${data.summary}</div>
      </div>
    `;

    // Meta
    const diffStars = '⭐'.repeat(data.difficulty || 3);
    html += `
      <div class="ai-meta-line">
        <span>难度 ${diffStars}</span>
        <span>·</span>
        <span>约 ${data.estimatedMinutes || '?'} 分钟</span>
      </div>
    `;

    // Paragraph navigation
    html += `
      <div class="ai-summary-section" style="margin-top:16px;">
        <div class="ai-summary-label">📊 段落导航</div>
        <ul class="ai-para-list" id="aiParaList">
    `;

    (data.paragraphs || []).forEach((p, i) => {
      const impClass = p.importance === '核心' ? 'core' : (p.importance === '支撑' ? 'support' : 'transition');
      const impLabel = p.importance || '过渡';
      html += `
        <li class="ai-para-item" data-index="${i + 1}" data-anchor="${escapeHtml(p.anchor)}">
          ${escapeHtml(p.title)}
          <span class="ai-para-importance ${impClass}">${impLabel}</span>
        </li>
      `;
    });

    html += '</ul></div>';

    // Key concepts
    if (data.concepts && data.concepts.length > 0) {
      html += `
        <div class="ai-summary-section" style="margin-top:16px;">
          <div class="ai-summary-label">🏷️ 关键概念</div>
          <div class="ai-concepts">
            ${data.concepts.map(c => `<span class="ai-concept-tag" data-concept="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    navBody.innerHTML = html;

    // Bind click events for paragraph navigation
    navBody.querySelectorAll('.ai-para-item').forEach(item => {
      item.addEventListener('click', () => {
        const anchor = item.dataset.anchor;
        scrollToAnchor(anchor);
      });
    });

    // Bind concept tag clicks → open deep talk
    navBody.querySelectorAll('.ai-concept-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const concept = tag.dataset.concept;
        openDeepTalk(concept, 'explain');
      });
    });

    // Setup scroll tracking
    setupScrollTracking(data.paragraphs || []);
  }

  function scrollToAnchor(anchor) {
    if (!anchor) return;
    // Find the text node in the article that contains this anchor
    const walker = document.createTreeWalker(
      articleBody,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(anchor)) {
        const parent = node.parentElement;
        if (parent) {
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight effect
          parent.style.transition = 'background 0.3s';
          parent.style.background = 'var(--accent-light)';
          setTimeout(() => {
            parent.style.background = '';
          }, 2000);
        }
        return;
      }
    }
  }

  function setupScrollTracking(paragraphs) {
    if (!paragraphs.length) return;

    // Build anchor positions
    const anchorElements = [];
    paragraphs.forEach((p, i) => {
      const walker = document.createTreeWalker(
        articleBody,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(p.anchor)) {
          anchorElements.push({ index: i, element: node.parentElement });
          break;
        }
      }
    });

    function updateActiveNav() {
      const scrollTop = window.scrollY + window.innerHeight / 3;
      let activeIndex = 0;

      for (const { index, element } of anchorElements) {
        if (element && element.getBoundingClientRect().top + window.scrollY <= scrollTop) {
          activeIndex = index;
        }
      }

      const items = document.querySelectorAll('.ai-para-item');
      items.forEach((item, i) => {
        item.classList.toggle('active', i === activeIndex);
      });

      // Scroll the active item into view in the nav panel
      const activeItem = items[activeIndex];
      if (activeItem && navPanel.classList.contains('open')) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    window.addEventListener('scroll', updateActiveNav, { passive: true });
    updateActiveNav();
  }

  // ══════════════════════════════════════════════════
  //  TEXT SELECTION & FLOATING TOOLBAR
  // ══════════════════════════════════════════════════

  let selectionTimeout;

  document.addEventListener('mouseup', (e) => {
    // Don't show toolbar if clicking inside panels/menus
    if (e.target.closest('.ai-talk-panel') ||
        e.target.closest('.ai-nav-panel') ||
        e.target.closest('.ai-selection-toolbar') ||
        e.target.closest('.ai-context-menu') ||
        e.target.closest('.ai-settings-overlay')) {
      return;
    }

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text.length > 2 && articleBody.contains(sel.anchorNode)) {
        currentSelectedText = text;
        showSelectionToolbar(sel);
      } else {
        hideSelectionToolbar();
      }
    }, 200);
  });

  function showSelectionToolbar(sel) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    selToolbar.classList.add('visible');
    selToolbar.style.left = (rect.left + rect.width / 2 - selToolbar.offsetWidth / 2 + window.scrollX) + 'px';
    selToolbar.style.top = (rect.top - selToolbar.offsetHeight - 8 + window.scrollY) + 'px';

    // Ensure toolbar stays within viewport
    const tbRect = selToolbar.getBoundingClientRect();
    if (tbRect.left < 8) {
      selToolbar.style.left = (8 + window.scrollX) + 'px';
    }
    if (tbRect.right > window.innerWidth - 8) {
      selToolbar.style.left = (window.innerWidth - selToolbar.offsetWidth - 8 + window.scrollX) + 'px';
    }
  }

  function hideSelectionToolbar() {
    selToolbar.classList.remove('visible');
  }

  function hideContextMenu() {
    ctxMenu.classList.remove('visible');
  }

  // Toolbar button clicks
  selToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.ai-sel-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    hideSelectionToolbar();
    openDeepTalk(currentSelectedText, mode);
  });

  // Hide toolbar on scroll or click elsewhere
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.ai-selection-toolbar')) {
      hideSelectionToolbar();
    }
    if (!e.target.closest('.ai-context-menu')) {
      hideContextMenu();
    }
  });

  // ── Right-click context menu ───────────────────
  articleBody.addEventListener('contextmenu', (e) => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';

    if (text.length > 2) {
      e.preventDefault();
      currentSelectedText = text;
      hideSelectionToolbar();

      ctxMenu.classList.add('visible');
      ctxMenu.style.left = e.pageX + 'px';
      ctxMenu.style.top = e.pageY + 'px';

      // Ensure within viewport
      requestAnimationFrame(() => {
        const rect = ctxMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth - 8) {
          ctxMenu.style.left = (e.pageX - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight - 8) {
          ctxMenu.style.top = (e.pageY - rect.height) + 'px';
        }
      });
    }
  });

  ctxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.ai-ctx-item');
    if (!item) return;
    const mode = item.dataset.mode;
    hideContextMenu();
    openDeepTalk(currentSelectedText, mode);
  });

  // ══════════════════════════════════════════════════
  //  DEEP TALK PANEL
  // ══════════════════════════════════════════════════

  const talkMessages = document.getElementById('aiTalkMessages');
  const talkInput = document.getElementById('aiTalkInput');
  const talkSend = document.getElementById('aiTalkSend');
  const talkContext = document.getElementById('aiTalkContext');
  const talkContextText = document.getElementById('aiTalkContextText');

  function openDeepTalk(selectedText, mode) {
    // Reset chat
    chatHistory = [];
    talkMessages.innerHTML = '';

    // Show selected text context
    if (selectedText) {
      talkContext.style.display = 'block';
      talkContextText.textContent = selectedText.length > 200
        ? selectedText.substring(0, 200) + '…'
        : selectedText;
    } else {
      talkContext.style.display = 'none';
    }

    // Open panel
    talkPanel.classList.add('open');
    talkOverlay.classList.add('open');

    // Build the initial prompt and send
    const modeLabels = {
      explain: '🔍 解释',
      example: '📝 举例',
      analyze: '🧩 拆解',
      discuss: '💬 讨论',
    };

    addMessage('system', `${modeLabels[mode] || '💬 讨论'} 模式`);

    // Build messages
    const messages = AIService.buildTalkMessages(articleText, selectedText, mode, []);

    // The user message is the last message in the array
    const userMsg = messages[messages.length - 1];
    chatHistory.push(userMsg);
    addMessage('user', selectedText.length > 80 ? selectedText.substring(0, 80) + '…' : selectedText);

    // Stream the AI response
    streamAIResponse(messages);
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;

    if (role === 'assistant') {
      div.innerHTML = formatMarkdown(content) + '<span class="typing-cursor"></span>';
    } else {
      div.textContent = content;
    }

    talkMessages.appendChild(div);
    talkMessages.scrollTop = talkMessages.scrollHeight;
    return div;
  }

  function updateAssistantMessage(div, content, streaming) {
    div.innerHTML = formatMarkdown(content) + (streaming ? '<span class="typing-cursor"></span>' : '');
    talkMessages.scrollTop = talkMessages.scrollHeight;
  }

  async function streamAIResponse(messages) {
    isStreaming = true;
    talkSend.disabled = true;

    const msgDiv = addMessage('assistant', '');

    await AIService.streamChat(
      messages,
      // onChunk
      (chunk, fullText) => {
        updateAssistantMessage(msgDiv, fullText, true);
      },
      // onDone
      (fullText) => {
        updateAssistantMessage(msgDiv, fullText, false);
        chatHistory.push({ role: 'assistant', content: fullText });
        isStreaming = false;
        talkSend.disabled = false;
        talkInput.focus();

        // Add suggestion buttons
        addSuggestions(msgDiv);
      },
      // onError
      (err) => {
        updateAssistantMessage(msgDiv, `⚠️ 请求失败：${err.message}`, false);
        isStreaming = false;
        talkSend.disabled = false;
      }
    );
  }

  function addSuggestions(afterDiv) {
    // Extract suggestions from AI response (look for 💡 lines)
    const text = afterDiv.textContent;
    const suggestions = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.includes('💡') || line.includes('你可能还想')) {
        const parts = line.replace(/💡.*?[：:]/, '').split(/[；;、,，]/);
        parts.forEach(p => {
          const s = p.replace(/^\d+[.、]/, '').trim();
          if (s.length > 2 && s.length < 40) suggestions.push(s);
        });
      }
    }

    if (suggestions.length > 0) {
      const sugDiv = document.createElement('div');
      sugDiv.className = 'ai-suggestions';
      suggestions.slice(0, 3).forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'ai-suggestion-btn';
        btn.textContent = s;
        btn.addEventListener('click', () => {
          sendFollowUp(s);
          sugDiv.remove();
        });
        sugDiv.appendChild(btn);
      });
      talkMessages.appendChild(sugDiv);
      talkMessages.scrollTop = talkMessages.scrollHeight;
    }
  }

  // Send follow-up message
  function sendFollowUp(text) {
    if (!text.trim() || isStreaming) return;

    addMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    // Build full message array with system prompt
    const messages = AIService.buildTalkMessages(articleText, currentSelectedText, 'discuss', chatHistory);

    streamAIResponse(messages);
  }

  // Input handling
  talkSend.addEventListener('click', () => {
    sendFollowUp(talkInput.value);
    talkInput.value = '';
    autoResizeInput();
  });

  talkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFollowUp(talkInput.value);
      talkInput.value = '';
      autoResizeInput();
    }
  });

  talkInput.addEventListener('input', autoResizeInput);

  function autoResizeInput() {
    talkInput.style.height = 'auto';
    talkInput.style.height = Math.min(talkInput.scrollHeight, 120) + 'px';
  }

  // Close deep talk
  document.getElementById('aiTalkClose').addEventListener('click', closeDeepTalk);
  talkOverlay.addEventListener('click', closeDeepTalk);

  function closeDeepTalk() {
    talkPanel.classList.remove('open');
    talkOverlay.classList.remove('open');
  }

  // ══════════════════════════════════════════════════
  //  SETTINGS
  // ══════════════════════════════════════════════════

  document.getElementById('aiSettingsBtn').addEventListener('click', () => {
    const cfg = AIService.getConfig();
    document.getElementById('aiSettingsKey').value = cfg.apiKey;
    document.getElementById('aiSettingsUrl').value = cfg.baseUrl;
    document.getElementById('aiSettingsModel').value = cfg.model;
    settingsOverlay.classList.add('open');
  });

  document.getElementById('aiSettingsCancel').addEventListener('click', () => {
    settingsOverlay.classList.remove('open');
  });

  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
  });

  document.getElementById('aiSettingsSave').addEventListener('click', () => {
    AIService.saveConfig({
      apiKey: document.getElementById('aiSettingsKey').value.trim(),
      baseUrl: document.getElementById('aiSettingsUrl').value.trim(),
      model: document.getElementById('aiSettingsModel').value,
    });
    settingsOverlay.classList.remove('open');
  });

  // ══════════════════════════════════════════════════
  //  AUTO-LOAD CACHED X-RAY
  // ══════════════════════════════════════════════════

  (async function () {
    const cached = await AIService.getCachedXRay(articleSlug);
    if (cached && cached.result) {
      xrayData = cached.result;
      renderXRay(xrayData);
      navToggle.querySelector('.badge-dot').classList.add('show');
    }
  })();

  // ══════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatMarkdown(text) {
    if (!text) return '';
    // Simple markdown-like formatting
    let html = escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Paragraphs
    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';
    // Single line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

})();
