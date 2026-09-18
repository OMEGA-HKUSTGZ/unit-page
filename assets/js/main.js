const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The intro video autoplays muted; respect reduced-motion preferences.
const intro = document.querySelector('.intro-video');
if (intro && reducedMotion) {
  intro.removeAttribute('autoplay');
  intro.pause();
}

// Example clips play on hover (pointer) or tap (touch), one at a time.
const clips = [...document.querySelectorAll('.examples video')];
const pauseOthers = (current) =>
  clips.forEach((v) => v !== current && !v.paused && v.pause());
clips.forEach((video) => {
  video.addEventListener('mouseenter', () => {
    pauseOthers(video);
    video.play().catch(() => {});
  });
  video.addEventListener('mouseleave', () => video.pause());
  video.addEventListener('click', () => {
    if (video.paused) {
      pauseOthers(video);
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });
});

// Accessible tabs for the results section.
document.querySelectorAll('[data-tabs]').forEach((root) => {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
});

// Copy BibTeX.
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const text = document.querySelector(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1800);
  });
});
