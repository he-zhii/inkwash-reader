/**
 * Rebuild index.html from existing article HTML files in dist/
 * Use this when .md source files are not available.
 */
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const SRC = path.resolve(__dirname, '..', 'src');

// ── Extract metadata from existing article HTML files ──
function extractArticleMeta(htmlPath) {
  const content = fs.readFileSync(htmlPath, 'utf-8');
  const fileName = path.basename(htmlPath, '.html');

  let title = '';
  const titleMatch = content.match(/<h1>([^<]+)<\/h1>/);
  if (titleMatch) title = titleMatch[1].trim();

  let date = '';
  const dateMatch = content.match(/<time>([^<]+)<\/time>/);
  if (dateMatch) date = dateMatch[1].trim();

  let readCount = '';
  const rcMatch = content.match(/<span class="read-count">([^<]+)<\/span>/);
  if (rcMatch) readCount = rcMatch[1].trim();

  const isPaid = content.includes('badge-paid');

  let excerpt = '';
  const exMatch = content.match(/<div class="article-body prose">\s*<p>([\s\S]{0,200}?)<\/p>/);
  if (exMatch) {
    excerpt = exMatch[1].replace(/<[^>]+>/g, '').trim();
    if (excerpt.length > 120) excerpt = excerpt.substring(0, 120) + '…';
  }

  // Extract article index from filename
  const indexMatch = fileName.match(/article-(\d+)/);
  const index = indexMatch ? parseInt(indexMatch[1]) : 0;

  return { fileName, title, date, readCount, isPaid, excerpt, index };
}

// ── Main ──
const articleDir = path.join(DIST, 'article');
const articleFiles = fs.readdirSync(articleDir)
  .filter(f => f.endsWith('.html'))
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || 0);
    const numB = parseInt(b.match(/\d+/)?.[0] || 0);
    return numA - numB;
  });

const articles = articleFiles.map(f => extractArticleMeta(path.join(articleDir, f)));
console.log(`Found ${articles.length} existing article pages`);

// ── Build index HTML ──
let cardsHtml = '';
for (const a of articles) {
  const badge = a.isPaid
    ? '<span class="badge badge-paid">已付费</span>'
    : '<span class="badge badge-free">免费</span>';
  cardsHtml += `
    <a href="article/${a.fileName}.html" class="card" data-paid="${a.isPaid}">
      <h2 class="card-title">${a.title}</h2>
      <div class="card-meta">
        <time>${a.date}</time>
        ${a.readCount ? `<span class="sep">·</span><span>${a.readCount}</span>` : ''}
        <span class="sep">·</span>
        ${badge}
      </div>
      <p class="card-excerpt">${a.excerpt}</p>
    </a>`;
}

const paidCount = articles.filter(a => a.isPaid).length;
const freeCount = articles.filter(a => !a.isPaid).length;

const indexHtml = `<!DOCTYPE html>
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
    <button class="filter-btn" data-filter="paid">已付费 <span class="count">${paidCount}</span></button>
    <button class="filter-btn" data-filter="free">免费 <span class="count">${freeCount}</span></button>
  </section>

  <section class="card-list" id="cardList">
    ${cardsHtml}
  </section>
</main>

<footer class="site-footer">
  <p>碧树西风文集 · 个人阅读整理</p>
</footer>

<script src="js/app.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml, 'utf-8');
console.log(`✓ Rebuilt index.html with ${articles.length} articles`);

// ── Also ensure AI assets are copied ──
const aiFiles = [
  { src: 'ai-style.css', dest: 'css/ai-style.css' },
  { src: 'ai-service.js', dest: 'js/ai-service.js' },
  { src: 'ai-panel.js', dest: 'js/ai-panel.js' },
];

for (const f of aiFiles) {
  const srcPath = path.join(SRC, f.src);
  const destPath = path.join(DIST, f.dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copied ${f.src} → dist/${f.dest}`);
  }
}

// ── Also copy base assets ──
fs.copyFileSync(path.join(SRC, 'style.css'), path.join(DIST, 'css', 'style.css'));
fs.copyFileSync(path.join(SRC, 'app.js'), path.join(DIST, 'js', 'app.js'));
console.log('  Copied base style.css and app.js');
console.log('\n✓ Done! Run "npm start" to view the site.');
