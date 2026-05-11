// ══════════════════════════════════════════════════
//  DeepRead AI Service — DeepSeek API Integration
// ══════════════════════════════════════════════════

const AIService = (function () {
  // ── Default config ──────────────────────────────
  const DEFAULTS = {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (旧版)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (旧版)' },
    ]
  };

  function getConfig() {
    const stored = localStorage.getItem('deepread_config');
    if (stored) {
      try {
        return { ...DEFAULTS, ...JSON.parse(stored) };
      } catch (e) { /* ignore */ }
    }
    return { ...DEFAULTS };
  }

  function saveConfig(cfg) {
    localStorage.setItem('deepread_config', JSON.stringify(cfg));
  }

  // ── Cache (IndexedDB) ──────────────────────────
  const DB_NAME = 'deepread';
  const DB_VERSION = 1;
  const STORE_NAME = 'xray_cache';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'articleSlug' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCachedXRay(slug) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(slug);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async function setCachedXRay(slug, data) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ articleSlug: slug, ...data, cachedAt: Date.now() });
    } catch (e) { console.warn('Cache write failed', e); }
  }

  // ── API Call (streaming) ───────────────────────
  async function streamChat(messages, onChunk, onDone, onError) {
    const cfg = getConfig();
    const controller = new AbortController();

    try {
      const res = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API Error ${res.status}: ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onChunk(delta, fullText);
            }
          } catch (e) { /* skip malformed JSON */ }
        }
      }

      onDone(fullText);
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err);
      }
    }

    return controller;
  }

  // ── Non-streaming call (for JSON responses) ────
  async function chatJSON(messages) {
    const cfg = getConfig();

    const res = await fetch(cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: 0.4,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content);
  }

  // ── X-Ray Analysis ─────────────────────────────
  async function analyzeArticle(slug, articleText, onProgress) {
    // Check cache first
    const cached = await getCachedXRay(slug);
    if (cached && cached.result) {
      return cached.result;
    }

    if (onProgress) onProgress('analyzing');

    const prompt = `你是一位专业的阅读分析助手。请分析以下文章，输出结构化的阅读辅助信息。

要求：
1. summary：用 3-5 句话概括文章的核心观点和结论（字符串）
2. paragraphs：将文章按语义划分为 5-12 个段落，每个段落给出：
   - anchor（字符串）：该段落开头的前 8-15 个字，用于在原文中精确定位
   - title（字符串）：一句话梗概，不超过 25 字
   - importance（字符串）：核心 / 支撑 / 过渡
3. concepts：提取 3-8 个核心概念或术语（字符串数组）
4. difficulty：阅读难度 1-5（数字）
5. estimatedMinutes：预估阅读时间（数字，分钟）

请严格以 JSON 格式输出，不要输出其他内容。JSON 结构如下：
{
  "summary": "...",
  "paragraphs": [
    { "anchor": "...", "title": "...", "importance": "核心" }
  ],
  "concepts": ["概念1", "概念2"],
  "difficulty": 3,
  "estimatedMinutes": 10
}

文章内容：
---
${articleText}
---`;

    const result = await chatJSON([
      { role: 'user', content: prompt }
    ]);

    // Cache the result
    await setCachedXRay(slug, { result });

    return result;
  }

  // ── Deep Talk ──────────────────────────────────
  function buildTalkMessages(articleText, selectedText, mode, chatHistory) {
    const modeInstructions = {
      explain: '请用通俗易懂的语言解释选中内容的含义。如果涉及专业术语，用生活化的类比来说明。',
      example: '请用 2-3 个具体、生动、有画面感的生活案例来说明选中内容中的概念。',
      analyze: '请深度拆解选中内容的逻辑结构和推理链条。分析作者为什么这样说，论证思路是怎样的。',
      discuss: '基于选中的内容，开展一段深入的讨论。分享你的见解，并提出值得思考的问题。',
    };

    const systemPrompt = `你是一位博学、善于表达的阅读伙伴。用户正在阅读一篇文章，需要你帮助他深入理解文中的内容。

你的风格：
- 像一个聪明的朋友在跟他聊天，不是在上课
- 解释要通俗易懂，多用生活化的类比和例子
- 举例要具体、生动、有画面感
- 如果用户的理解有偏差，温和地纠正
- 每次回答后，简要建议 1-2 个值得追问的方向（用"💡 你可能还想了解："开头）
- 回答用中文，控制在 300 字以内，除非用户要求更详细

完整文章内容（作为你的知识背景，请基于全文上下文来回答）：
---
${articleText}
---`;

    const messages = [{ role: 'system', content: systemPrompt }];

    // Add history
    if (chatHistory && chatHistory.length > 0) {
      messages.push(...chatHistory);
    }

    // If this is the first message (no history), build it from selection + mode
    if (!chatHistory || chatHistory.length === 0) {
      const instruction = modeInstructions[mode] || modeInstructions.discuss;
      messages.push({
        role: 'user',
        content: `我选中了以下文字：\n\n"${selectedText}"\n\n${instruction}`
      });
    }

    return messages;
  }

  return {
    getConfig,
    saveConfig,
    DEFAULTS,
    streamChat,
    chatJSON,
    analyzeArticle,
    buildTalkMessages,
    getCachedXRay,
  };
})();
