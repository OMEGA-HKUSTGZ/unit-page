const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The intro video autoplays muted; respect reduced-motion preferences.
const intro = document.querySelector('.intro-video');
if (intro && reducedMotion) {
  intro.removeAttribute('autoplay');
  intro.pause();
}

// The Hugging Face demo loads only when asked, so the page keeps its own look
// and a sleeping Space does not greet every visitor.
document.querySelectorAll('[data-space-src]').forEach((host) => {
  host.querySelector('[data-space-load]')?.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.src = host.dataset.spaceSrc;
    frame.title = 'UniT demo on Hugging Face Spaces';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    frame.allowFullscreen = true;
    host.replaceChildren(frame);
    frame.focus();
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

// ========================================
// Image lightbox (ported from the original UniT page)
//
// Overview and Results figures need to remain readable on narrow screens
// without forcing horizontal page scroll.  The inline images stay scaled to
// their cards; tapping one opens a fixed full-screen viewer with wheel,
// button, double-tap, drag, and pinch zoom.
// ========================================
function initImageLightbox() {
    const images = Array.from(document.querySelectorAll(
        '#overview .media-frame img, #results .media-frame img'
    ));
    if (!images.length) return;

    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.hidden = true;
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Image viewer');
    lightbox.innerHTML = `
        <div class="image-lightbox-viewport" data-lightbox-close>
            <img class="image-lightbox-img" alt="">
        </div>
        <button type="button" class="image-lightbox-close" aria-label="Close image viewer">&times;</button>
        <div class="image-lightbox-toolbar" aria-label="Image zoom controls">
            <button type="button" class="image-lightbox-control" data-zoom="out" aria-label="Zoom out">−</button>
            <button type="button" class="image-lightbox-control" data-zoom="reset" aria-label="Reset zoom">1×</button>
            <button type="button" class="image-lightbox-control" data-zoom="in" aria-label="Zoom in">+</button>
        </div>
    `;
    document.body.appendChild(lightbox);

    const viewport = lightbox.querySelector('.image-lightbox-viewport');
    const lightboxImg = lightbox.querySelector('.image-lightbox-img');
    const closeBtn = lightbox.querySelector('.image-lightbox-close');
    const controls = lightbox.querySelectorAll('.image-lightbox-control');
    const maxScale = 8;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let activePointers = new Map();
    let dragLast = null;
    let pinchStart = null;
    let lastFocused = null;
    let moved = false;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const pointerList = () => Array.from(activePointers.values());
    const pointerDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const pointerCenter = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const setScale = (nextScale) => {
        scale = clamp(nextScale, 1, maxScale);
        if (scale === 1) {
            panX = 0;
            panY = 0;
        }
        applyTransform();
    };

    const applyTransform = () => {
        lightboxImg.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
        lightboxImg.classList.toggle('is-zoomed', scale > 1);
    };

    const resetView = () => {
        scale = 1;
        panX = 0;
        panY = 0;
        moved = false;
        activePointers.clear();
        dragLast = null;
        pinchStart = null;
        lightboxImg.classList.remove('is-dragging');
        applyTransform();
    };

    const zoomBy = (factor) => {
        setScale(scale * factor);
    };

    const openLightbox = (sourceImg) => {
        lastFocused = document.activeElement;
        resetView();
        lightboxImg.src = sourceImg.currentSrc || sourceImg.src;
        lightboxImg.alt = sourceImg.alt || 'Expanded image';
        lightbox.hidden = false;
        requestAnimationFrame(() => {
            lightbox.classList.add('open');
            document.body.classList.add('lightbox-open');
            closeBtn.focus({ preventScroll: true });
            if (typeof lightbox.requestFullscreen === 'function' && matchMedia('(max-width: 800px), (pointer: coarse)').matches) {
                lightbox.requestFullscreen().catch(() => {});
            }
        });
    };

    const closeLightbox = () => {
        lightbox.classList.remove('open');
        document.body.classList.remove('lightbox-open');
        resetView();
        if (document.fullscreenElement === lightbox && typeof document.exitFullscreen === 'function') {
            document.exitFullscreen().catch(() => {});
        }
        lightbox.hidden = true;
        lightboxImg.removeAttribute('src');
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus({ preventScroll: true });
        }
    };

    images.forEach((img) => {
        img.classList.add('zoomable-image');
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', 'Open image full screen');
        img.addEventListener('click', () => openLightbox(img));
        img.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            openLightbox(img);
        });
    });

    closeBtn.addEventListener('click', closeLightbox);
    viewport.addEventListener('click', (e) => {
        if (!moved && e.target === viewport) closeLightbox();
    });
    lightboxImg.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    lightbox.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === '+' || e.key === '=') zoomBy(1.35);
        if (e.key === '-') zoomBy(1 / 1.35);
        if (e.key === '0') resetView();
    });

    controls.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.zoom;
            if (action === 'in') zoomBy(1.35);
            if (action === 'out') zoomBy(1 / 1.35);
            if (action === 'reset') resetView();
        });
    });

    lightboxImg.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    lightboxImg.addEventListener('dblclick', (e) => {
        e.preventDefault();
        setScale(scale > 1 ? 1 : 2.5);
    });

    lightboxImg.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        moved = false;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        lightboxImg.setPointerCapture?.(e.pointerId);
        if (activePointers.size === 1) {
            dragLast = { x: e.clientX, y: e.clientY };
            lightboxImg.classList.toggle('is-dragging', scale > 1);
        } else if (activePointers.size === 2) {
            const [a, b] = pointerList();
            pinchStart = {
                distance: pointerDistance(a, b) || 1,
                center: pointerCenter(a, b),
                scale,
                panX,
                panY
            };
        }
    });

    lightboxImg.addEventListener('pointermove', (e) => {
        if (!activePointers.has(e.pointerId)) return;
        const previous = activePointers.get(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (Math.abs(e.clientX - previous.x) > 2 || Math.abs(e.clientY - previous.y) > 2) {
            moved = true;
        }

        if (activePointers.size >= 2 && pinchStart) {
            const [a, b] = pointerList();
            const currentDistance = pointerDistance(a, b) || pinchStart.distance;
            const currentCenter = pointerCenter(a, b);
            scale = clamp(pinchStart.scale * currentDistance / pinchStart.distance, 1, maxScale);
            panX = scale === 1 ? 0 : pinchStart.panX + currentCenter.x - pinchStart.center.x;
            panY = scale === 1 ? 0 : pinchStart.panY + currentCenter.y - pinchStart.center.y;
            applyTransform();
            return;
        }

        if (scale > 1 && dragLast) {
            panX += e.clientX - dragLast.x;
            panY += e.clientY - dragLast.y;
            dragLast = { x: e.clientX, y: e.clientY };
            applyTransform();
        }
    });

    const endPointer = (e) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size < 2) pinchStart = null;
        if (activePointers.size === 1) {
            const [remaining] = pointerList();
            dragLast = remaining;
        } else {
            dragLast = null;
            lightboxImg.classList.remove('is-dragging');
        }
    };

    lightboxImg.addEventListener('pointerup', endPointer);
    lightboxImg.addEventListener('pointercancel', endPointer);
}

initImageLightbox();
