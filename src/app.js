// ── Theme Toggle ─────────────────────────────────
(function () {
  const html = document.documentElement;
  const stored = localStorage.getItem('theme');
  if (stored) {
    html.setAttribute('data-theme', stored);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    html.setAttribute('data-theme', 'dark');
  }

  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
})();

// ── Filter Buttons (Index Page) ──────────────────
(function () {
  const buttons = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.card');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      cards.forEach(card => {
        const isPaid = card.dataset.paid === 'true';
        if (filter === 'all') {
          card.classList.remove('hidden');
        } else if (filter === 'paid') {
          card.classList.toggle('hidden', !isPaid);
        } else {
          card.classList.toggle('hidden', isPaid);
        }
      });
    });
  });
})();

// ── Reading Progress Bar (Article Page) ──────────
(function () {
  const bar = document.getElementById('readingProgress');
  if (!bar) return;

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = progress + '%';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();
