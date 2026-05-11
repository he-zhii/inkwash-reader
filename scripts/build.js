const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

// ── Helpers ──────────────────────────────────────────────
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(title, index) {
  return `article-${index + 1}`;
}

function extractExcerpt(text, len = 120) {
  const clean = text.replace(/\[.*?\]\(.*?\)/g, '').replace(/[#*_`>\-]/g, '').replace(/\n+/g, ' ').trim();
  return clean.length > len ? clean.substring(0, len) + '…' : clean;
}

// ── Parse one markdown article ───────────────────────────
function parseArticle(filePath, index) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');
  const isPaid = fileName.includes('已付费');
  const lines = raw.split(/\r?\n/);

  // 1. Title
  let title = (lines[0] || '').replace(/^#\s*/, '').replace(/\s*已付费\s*/g, '').trim();

  // 2. Date & read count
  let date = '', readCount = '';
  for (let i = 1; i < Math.min(12, lines.length); i++) {
    const m = lines[i].match(/\*(\d{4}年\d{1,2}月\d{1,2}日[^*]*)\*/);
    if (m) {
      date = m[1].replace(/\s+/g, ' ').trim();
      const rc = lines[i].match(/([\d.]+万?\+?\s*人)/);
      if (rc) readCount = rc[1];
      break;
    }
  }

  // 3. Find body start (after the date/meta line)
  let bodyStart = 1;
  for (let i = 1; i < Math.min(12, lines.length); i++) {
    if (lines[i].match(/\*\d{4}年/)) { bodyStart = i + 1; break; }
    if (lines[i].match(/原创\s+碧树西风/)) { bodyStart = i + 1; }
  }

  // 4. Find footer start
  let footerStart = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '喜欢作者' || t === '钟意作者') { footerStart = i; break; }
  }

  const bodyLines = lines.slice(bodyStart, footerStart);

  // 5. Separate bottom link block from content
  const linkRe = /^\s*\[.+?\]\(https?:\/\/.+?\)\s*$/;
  let linkBlockStart = bodyLines.length;
  for (let i = bodyLines.length - 1; i >= 0; i--) {
    const t = bodyLines[i].trim();
    if (linkRe.test(t)) { linkBlockStart = i; }
    else if (t !== '') { break; }
  }

  const contentLines = bodyLines.slice(0, linkBlockStart);
  const bottomLinkLines = bodyLines.slice(linkBlockStart);

  // 6. Extract bottom links [{title, url}]
  const bottomLinks = [];
  const linkExtract = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
  for (const l of bottomLinkLines) {
    const m = l.match(linkExtract);
    if (m) bottomLinks.push({ title: m[1].trim(), url: m[2] });
  }

  // 7. Clean content markdown
  let content = contentLines.join('\n');
  // Remove bold markers
  content = content.replace(/\*\*(.+?)\*\*/g, '$1');
  // Remove leftover image avatars & QR codes
  content = content.replace(/!\[头像\]\([^)]*\)/g, '');
  content = content.replace(/!\[\]\(https?:\/\/mmbiz\.qpic\.cn[^)]*\)/g, '');
  content = content.replace(/!\[\]\(https?:\/\/wx\.qlogo\.cn[^)]*\)/g, '');
  // Remove stray metadata lines that might have leaked in
  content = content.replace(/^原创\s+碧树西风.*/gm, '');
  // Remove "以下进入正文：" style separators (keep as-is, it's part of content)
  // Remove trailing whitespace lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  // 8. Also extract inline links for cross-reference
  const inlineLinks = [];
  const allLinkRe = /\[([^\]]+)\]\((https?:\/\/mp\.weixin\.qq\.com[^)]+)\)/g;
  let match;
  while ((match = allLinkRe.exec(content)) !== null) {
    inlineLinks.push({ title: match[1].trim(), url: match[2] });
  }

  return {
    index,
    slug: slugify(title, index),
    title,
    date,
    readCount,
    isPaid,
    content,
    bottomLinks,
    inlineLinks,
    excerpt: extractExcerpt(content),
    fileName
  };
}

// ── Render markdown to HTML ──────────────────────────────
function renderMarkdown(md) {
  marked.setOptions({ gfm: true, breaks: true });
  return marked.parse(md);
}

// ── Collect all external links across articles ───────────
function buildLinkIndex(articles) {
  const titleSet = new Set(articles.map(a => a.title));
  const slugMap = {};
  articles.forEach(a => { slugMap[a.title] = a.slug; });

  // Deduplicate links by title
  const allLinks = new Map();
  for (const art of articles) {
    for (const link of [...art.bottomLinks, ...art.inlineLinks]) {
      if (!allLinks.has(link.title)) {
        allLinks.set(link.title, {
          title: link.title,
          url: link.url,
          collected: titleSet.has(link.title),
          slug: slugMap[link.title] || null,
          citedBy: [art.title],
          citedCount: 1
        });
      } else {
        const existing = allLinks.get(link.title);
        if (!existing.citedBy.includes(art.title)) {
          existing.citedBy.push(art.title);
          existing.citedCount++;
        }
      }
    }
  }
  return allLinks;
}

// ── Generate article HTML ────────────────────────────────
function generateArticlePage(article, articles, linkIndex) {
  const bodyHtml = renderMarkdown(article.content);
  const titleSet = new Set(articles.map(a => a.title));
  const slugMap = {};
  articles.forEach(a => { slugMap[a.title] = a.slug; });

  // Build bottom links HTML
  let linksHtml = '';
  if (article.bottomLinks.length > 0) {
    // Deduplicate within this article
    const seen = new Set();
    const unique = article.bottomLinks.filter(l => {
      if (seen.has(l.title)) return false;
      seen.add(l.title);
      return true;
    });

    const collected = unique.filter(l => titleSet.has(l.title));
    const uncollected = unique.filter(l => !titleSet.has(l.title));

    linksHtml += '<section class="related-links">\n<h2>延伸阅读</h2>\n';

    if (collected.length > 0) {
      linksHtml += '<div class="link-group"><h3>已收录</h3><ul>\n';
      for (const l of collected) {
        linksHtml += `<li><a href="${slugMap[l.title]}.html" class="internal-link">${l.title}</a></li>\n`;
      }
      linksHtml += '</ul></div>\n';
    }

    if (uncollected.length > 0) {
      linksHtml += '<div class="link-group uncollected"><h3>待收录</h3><ul>\n';
      for (const l of uncollected) {
        linksHtml += `<li><a href="${l.url}" target="_blank" rel="noopener" class="external-link">${l.title}</a></li>\n`;
      }
      linksHtml += '</ul></div>\n';
    }

    linksHtml += '</section>\n';
  }

  // Paid badge
  const badge = article.isPaid
    ? '<span class="badge badge-paid">已付费</span>'
    : '<span class="badge badge-free">免费</span>';

  // Navigation
  const prev = article.index > 0 ? articles[article.index - 1] : null;
  const next = article.index < articles.length - 1 ? articles[article.index + 1] : null;
  let navHtml = '<nav class="article-nav">';
  navHtml += prev
    ? `<a href="${prev.slug}.html" class="nav-prev">← ${prev.title}</a>`
    : '<span></span>';
  navHtml += next
    ? `<a href="${next.slug}.html" class="nav-next">${next.title} →</a>`
    : '<span></span>';
  navHtml += '</nav>';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${article.title} — 碧树西风文集</title>
<meta name="description" content="${article.excerpt}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/ai-style.css">
</head>
<body>

<header class="site-header">
  <a href="../index.html" class="site-brand">碧树西风文集</a>
  <button class="theme-toggle" id="themeToggle" aria-label="切换主题">
    <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
    <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>
</header>

<main class="article-page">
  <article class="article">
    <header class="article-header">
      <h1>${article.title}</h1>
      <div class="article-meta">
        <span class="author">碧树西风</span>
        <span class="sep">·</span>
        <time>${article.date}</time>
        ${article.readCount ? `<span class="sep">·</span><span class="read-count">${article.readCount}阅读</span>` : ''}
        <span class="sep">·</span>
        ${badge}
      </div>
    </header>
    <div class="article-body prose">
      ${bodyHtml}
    </div>
    ${linksHtml}
  </article>
  ${navHtml}
</main>

<footer class="site-footer">
  <p>碧树西风文集 · 个人阅读整理</p>
</footer>

<script src="../js/app.js"></script>
<script src="../js/ai-service.js"></script>
<script src="../js/ai-panel.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(DIST, 'article', `${article.slug}.html`), html, 'utf-8');
}

// ── Generate index page ──────────────────────────────────
function generateIndex(articles) {
  let cardsHtml = '';
  for (const a of articles) {
    const badge = a.isPaid
      ? '<span class="badge badge-paid">已付费</span>'
      : '<span class="badge badge-free">免费</span>';
    cardsHtml += `
    <a href="article/${a.slug}.html" class="card" data-paid="${a.isPaid}">
      <h2 class="card-title">${a.title}</h2>
      <div class="card-meta">
        <time>${a.date}</time>
        ${a.readCount ? `<span class="sep">·</span><span>${a.readCount}阅读</span>` : ''}
        <span class="sep">·</span>
        ${badge}
      </div>
      <p class="card-excerpt">${a.excerpt}</p>
    </a>`;
  }

  // Count uncollected links
  const linkIndex = buildLinkIndex(articles);
  const uncollectedCount = [...linkIndex.values()].filter(l => !l.collected).length;

  // Build uncollected links page data
  const uncollected = [...linkIndex.values()]
    .filter(l => !l.collected)
    .sort((a, b) => b.citedCount - a.citedCount);

  let uncollectedHtml = '';
  for (const l of uncollected) {
    uncollectedHtml += `
    <li class="pending-link">
      <a href="${l.url}" target="_blank" rel="noopener">${l.title}</a>
      <span class="cite-count">被引用 ${l.citedCount} 次</span>
    </li>`;
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>碧树西风文集</title>
<meta name="description" content="碧树西风付费文章合集，个人阅读整理">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<header class="site-header">
  <a href="index.html" class="site-brand">碧树西风文集</a>
  <button class="theme-toggle" id="themeToggle" aria-label="切换主题">
    <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
    <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>
</header>

<main class="index-page">
  <section class="hero">
    <h1>碧树西风文集</h1>
    <p class="hero-sub">个人付费文章整理 · 共 ${articles.length} 篇</p>
  </section>

  <section class="filters">
    <button class="filter-btn active" data-filter="all">全部 <span class="count">${articles.length}</span></button>
    <button class="filter-btn" data-filter="paid">已付费 <span class="count">${articles.filter(a => a.isPaid).length}</span></button>
    <button class="filter-btn" data-filter="free">免费 <span class="count">${articles.filter(a => !a.isPaid).length}</span></button>
  </section>

  <section class="card-list" id="cardList">
    ${cardsHtml}
  </section>

  ${uncollected.length > 0 ? `
  <section class="pending-section">
    <h2 class="section-title">待收录文章<span class="count">${uncollectedCount}</span></h2>
    <p class="section-desc">以下文章在已收录的文章中被引用，但尚未收录到文集中</p>
    <ul class="pending-list" id="pendingList">
      ${uncollectedHtml}
    </ul>
  </section>` : ''}
</main>

<footer class="site-footer">
  <p>碧树西风文集 · 个人阅读整理</p>
</footer>

<script src="js/app.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf-8');
}

// ── Main ─────────────────────────────────────────────────
function main() {
  const mdFiles = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort();

  console.log(`Found ${mdFiles.length} articles`);

  const articles = mdFiles.map((f, i) => parseArticle(path.join(ROOT, f), i));
  const linkIndex = buildLinkIndex(articles);

  // Prepare output dirs
  ensureDir(DIST);
  ensureDir(path.join(DIST, 'article'));
  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));

  // Copy static assets
  fs.copyFileSync(path.join(SRC, 'style.css'), path.join(DIST, 'css', 'style.css'));
  fs.copyFileSync(path.join(SRC, 'ai-style.css'), path.join(DIST, 'css', 'ai-style.css'));
  fs.copyFileSync(path.join(SRC, 'app.js'), path.join(DIST, 'js', 'app.js'));
  fs.copyFileSync(path.join(SRC, 'ai-service.js'), path.join(DIST, 'js', 'ai-service.js'));
  fs.copyFileSync(path.join(SRC, 'ai-panel.js'), path.join(DIST, 'js', 'ai-panel.js'));

  // Generate pages
  generateIndex(articles);
  articles.forEach(a => generateArticlePage(a, articles, linkIndex));

  // Stats
  const uncollected = [...linkIndex.values()].filter(l => !l.collected);
  console.log(`✓ Generated index + ${articles.length} article pages → dist/`);
  console.log(`  Links: ${linkIndex.size} unique (${linkIndex.size - uncollected.length} collected, ${uncollected.length} pending)`);
}

main();
