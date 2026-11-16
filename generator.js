// FanOrbit generator: draws an orbit avatar wall — the user's own avatar
// at the center, fans sorted by interaction score from the innermost ring
// outward, fans with no interaction data placed randomly among the outer
// rings. Fan avatars share one size; the center avatar is 2x, 3x or 4x.
// Two layout shapes: 圆形 (concentric rings) and 方形 (square rings).
// Optional vertical split writes an odd number of strips (3–19) for an X
// post. Cut lines stay in avatar-free corridors, and the middle strip keeps
// the whole center avatar. Strip count and center scale live in lib/layout.js.

(() => {
  const $ = (id) => document.getElementById(id);
  let currentBlob = null;
  let currentStrips = null;

  document.addEventListener('DOMContentLoaded', async () => {
    $('saveBtn').addEventListener('click', () => {
      if (currentStrips) downloadStrips(currentStrips);
      else if (currentBlob) downloadBlob(currentBlob);
    });
    $('againBtn').addEventListener('click', () => {
      run();
    });
    await initControls();
    run();
  });

  // Shape, center scale and strip count mirror the popup config, so the
  // layout can be tweaked on this page without reopening the control panel.
  async function initControls() {
    let stored = {};
    try {
      stored = await chrome.storage.local.get('config');
    } catch (e) { /* keep defaults */ }
    const config = stored.config || {};
    $('shapeSel').value = config.shape === 'square' ? 'square' : 'circle';
    $('selfScaleSel').value = String(FanOrbitLayout.normalizeSelfScale(config));
    $('splitPartsSel').value = String(FanOrbitLayout.normalizeSplitParts(config));
    $('shapeSel').addEventListener('change', onControlChange);
    $('selfScaleSel').addEventListener('change', onControlChange);
    $('splitPartsSel').addEventListener('change', onControlChange);
  }

  async function onControlChange() {
    let stored = {};
    try {
      stored = await chrome.storage.local.get('config');
    } catch (e) { /* keep defaults */ }
    const config = {
      ...(stored.config || {}),
      shape: $('shapeSel').value === 'square' ? 'square' : 'circle',
      selfScale: FanOrbitLayout.normalizeSelfScale({ selfScale: $('selfScaleSel').value }),
      splitParts: FanOrbitLayout.normalizeSplitParts({ splitParts: $('splitPartsSel').value })
    };
    try {
      await chrome.storage.local.set({ config });
    } catch (e) { /* non-fatal; regenerate anyway */ }
    run();
  }

  async function run() {
    $('saveBtn').disabled = true;
    $('againBtn').disabled = true;
    $('preview').style.display = 'none';
    $('meta').textContent = '';
    setProgress(0);
    currentStrips = null;
    setControlsEnabled(false);

    let stored;
    try {
      stored = await chrome.storage.local.get(['config', 'fansData', 'interactionData']);
    } catch (e) {
      setStatus('读取数据失败：' + ((e && e.message) || e));
      setControlsEnabled(true);
      return;
    }

    const config = stored.config || {};
    const fansData = stored.fansData || { fans: [] };
    const interactionData = stored.interactionData || {};

    const avatarsExtra = interactionData.avatars || {};
    const fans = (fansData.fans || [])
      .map((f) => ({
        username: f.username,
        avatar: f.avatar || avatarsExtra[(f.username || '').toLowerCase()] || null,
        index: f.index || 0
      }))
      .filter((f) => f.avatar);
    if (!fans.length) {
      setStatus('没有可用的头像数据，请先开始粉丝采集。');
      setControlsEnabled(true);
      return;
    }

    const scoreByName = interactionData.scoreByName || {};
    const ranked = [];
    const unranked = [];
    for (const fan of fans) {
      const s = scoreByName[fan.username.toLowerCase()];
      if (s && s.score > 0) ranked.push({ fan, score: s.score, count: s.interactionCount });
      else unranked.push(fan);
    }
    ranked.sort((a, b) => b.score - a.score || b.count - a.count || a.fan.index - b.fan.index);
    shuffle(unranked);

    const size = clampInt(config.avatarSize, 40, 300, 96);
    const bgColor = config.bgColor || '#f5f3ff';
    const shape = config.shape === 'square' ? 'square' : 'circle';
    const splitParts = FanOrbitLayout.normalizeSplitParts(config);
    const selfScale = FanOrbitLayout.normalizeSelfScale(config);

    setStatus('正在加载头像…');
    const loaded = await Downloader.download(fans, (p) => {
      setProgress(p.done / Math.max(1, p.total));
      setStatus(`正在加载头像 ${p.done}/${p.total}…`);
    });
    const ok = loaded.results.filter((x) => x && x.blob);
    if (!ok.length) {
      setStatus('头像加载失败，请检查网络后重新打开此页面。');
      setControlsEnabled(true);
      return;
    }

    // Center avatar (echo the user's own avatar or a placeholder tile).
    let selfBlob = null;
    if (interactionData.selfAvatar) {
      selfBlob = await Downloader.fetchWithRetry(interactionData.selfAvatar, 2);
    }

    const ordered = buildOrderedItems(ranked, ok, unranked, ok);
    if (!ordered.length) {
      setStatus('没有可用的头像数据，请先开始粉丝采集。');
      setControlsEnabled(true);
      return;
    }
    const result = await drawOrbitFromItems(ordered, selfBlob, size, bgColor, {
      colorSort: config.colorSort === true,
      shape,
      splitParts,
      selfScale
    });
    if (!result) {
      setStatus('图片生成失败。');
      setControlsEnabled(true);
      return;
    }

    const { canvas, cuts } = result;
    const blob = await canvasToBlob(canvas);
    if (!blob) {
      setStatus('图片生成失败。');
      setControlsEnabled(true);
      return;
    }
    let strips = null;
    if (splitParts > 1 && cuts) strips = await sliceStrips(canvas, cuts);

    currentBlob = blob;
    currentStrips = strips && cuts && strips.length === cuts.length + 1 ? strips : null;
    $('saveBtn').textContent = currentStrips ? `保存 ${currentStrips.length} 张分图` : '保存 JPG';
    const previewCanvas = currentStrips ? withCutGuides(canvas, cuts) : canvas;
    const previewBlob = currentStrips ? await canvasToBlob(previewCanvas) : blob;
    const previewUrl = URL.createObjectURL(previewBlob || blob);
    $('preview').src = previewUrl;
    $('preview').style.display = 'block';
    $('saveBtn').disabled = false;
    $('againBtn').disabled = false;
    setControlsEnabled(true);
    const scored = ranked.length;
    const parts = [
      `${ordered.length} 位粉丝`,
      shape === 'square' ? '方形网格' : '圆形同心环'
    ];
    if (config.colorSort === true) parts.push('颜色排序（彩虹环）');
    else parts.push(`互动排序 ${scored} 位 · 随机 ${ordered.length - scored} 位`);
    parts.push(`${size}px`);
    parts.push(`中心 ${selfScale} 倍`);
    if (currentStrips) {
      const got = currentStrips.length;
      parts.push(splitParts > got
        ? `竖裁 ${got} 条（请求 ${splitParts} 条，按头像列宽排到这里；预览虚线为切割线）`
        : `竖裁 ${got} 条（预览虚线为切割线）`);
    } else if (splitParts > 1) {
      parts.push(`请求 ${splitParts} 条，当前宽度按一整张输出`);
    }
    parts.push('JPEG 95%');
    $('meta').textContent = parts.join(' · ');
    setProgress(1);
    setStatus(currentStrips
      ? `生成完成，已下载 ${currentStrips.length} 张分图（若浏览器询问，请允许「下载多个文件」）`
      : '生成完成');

    autoDownload();
  }

  // Place ranked fans first (innermost-out), then the shuffled no-data fans
  // in the remaining slots. Returns a flat list in slot order.
  function buildOrderedItems(ranked, okItems, unranked, okAll) {
    const byName = new Map();
    for (const item of okAll) byName.set(item.username.toLowerCase(), item);
    const out = [];
    for (const r of ranked) {
      const item = byName.get(r.fan.username.toLowerCase());
      if (item) out.push(item);
    }
    for (const fan of unranked) {
      const item = byName.get(fan.username.toLowerCase());
      if (item) out.push(item);
    }
    return out;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function drawOrbitFromItems(items, selfBlob, size, bgColor, opts) {
    const count = items.length;
    if (!count) return null;
    const colorSort = opts.colorSort;
    const isSquare = opts.shape === 'square';

    const bitmaps = [];
    for (const item of items) {
      try {
        bitmaps.push(await createImageBitmap(item.blob));
      } catch (e) {
        bitmaps.push(null);
      }
    }

    // Pair every item with its bitmap before any reordering so both stay
    // aligned. With colorSort the hue order forms a smooth rainbow across
    // slots; low-detail hues (grayscale or unreadable pixels) go last.
    let entries = items.map((item, i) => ({ item, bitmap: bitmaps[i], hue: null }));
    if (colorSort) {
      for (const entry of entries) {
        if (!entry.bitmap) continue;
        entry.hue = bitmapHue(entry.bitmap);
      }
      entries = entries
        .map((e, i) => ({ e, i }))
        .sort((a, b) => (a.e.hue ?? 361) - (b.e.hue ?? 361) || a.i - b.i)
        .map((x) => x.e);
    }

    const gap = Math.max(6, Math.round(size * 0.12));
    // Fans share one size. The center self avatar is an integer multiple of
    // that size; interaction rank still decides which ring a fan sits on.
    const selfScale = FanOrbitLayout.normalizeSelfScale({ selfScale: opts.selfScale });
    const selfHalf = Math.round((size * selfScale) / 2);
    // Extra margin between the center avatar and the first ring: the
    // decorative stroke below eats into the raw gap, without a margin the
    // nearest fans visually touch the purple center ring.
    const centerGap = Math.round(size * (isSquare ? 0.7 : 0.4));
    const decorR = Math.max(4, Math.round(size * (isSquare ? 0.12 : 0.08)));
    const pad = Math.round(size * 0.7);
    // Keep-out distance around each planned cut line: slots whose horizontal
    // extent comes this close to a cut are dropped, so no avatar is sliced.
    const cutMargin = Math.max(3, Math.round(size * 0.04));

    // Ring reach is the ring's center offset from the middle: a radius for
    // circles, a half side-length for squares. Ring k grows from ring k-1's
    // own diameter, so the gap stays the same on every ring.
    const rings = [];
    let positions = [];
    let W = 0, H = 0, cx = 0, cy = 0, cuts = null;
    while (positions.length < count && rings.length < 200) {
      const prev = rings[rings.length - 1];
      const s = size;
      const reach = prev
        ? prev.reach + (prev.size + s) / 2 + gap
        : selfHalf + decorR + centerGap + s / 2 + gap;
      let cap;
      if (isSquare) {
        // Slots anchor at the four corners and space evenly along each
        // edge, so corner-adjacent pairs keep the full gap. Capacity is a
        // multiple of 4 to keep all four edges symmetric.
        const perEdge = Math.max(2, Math.floor((2 * reach) / (s + gap)));
        cap = perEdge * 4;
      } else {
        cap = Math.max(8, Math.floor((2 * Math.PI * reach) / (s + gap)));
      }
      rings.push({ reach, size: s, cap });

      const orbitR = reach + s / 2;
      W = Math.ceil(2 * orbitR + pad * 2);
      H = W;
      cx = W / 2;
      cy = H / 2;
      const fitted = FanOrbitLayout.fitSplitParts(opts.splitParts, W, selfHalf + decorR, cutMargin, size);
      cuts = fitted > 1 ? FanOrbitLayout.planCuts(W, cx, selfHalf + decorR, cutMargin, fitted) : null;

      // Regenerate all slot positions against the latest canvas size: the
      // cut corridors depend on W, and every slot must clear the final cuts.
      positions = [];
      for (const ring of rings) {
        if (isSquare) {
          // Walk slot indexes around the perimeter (top edge left→right,
          // then right, bottom, left); slot 0 of each edge sits exactly on
          // the corner. A random whole-slot shift rotates the pattern.
          const perEdge = ring.cap / 4;
          const h = ring.reach;
          const step = (2 * h) / perEdge;
          const shift = Math.floor(Math.random() * ring.cap);
          for (let i = 0; i < ring.cap; i++) {
            const idx = (i + shift) % ring.cap;
            const edge = Math.floor(idx / perEdge);
            const d = (idx % perEdge) * step;
            let x, y;
            if (edge === 0) { x = -h + d; y = -h; }
            else if (edge === 1) { x = h; y = -h + d; }
            else if (edge === 2) { x = h - d; y = h; }
            else { x = -h; y = h - d; }
            positions.push({ x: cx + x, y: cy + y, s: ring.size });
          }
        } else {
          const rotation = Math.random() * Math.PI * 2;
          const angleStep = (Math.PI * 2) / ring.cap;
          for (let i = 0; i < ring.cap; i++) {
            const angle = rotation + i * angleStep;
            positions.push({ x: cx + Math.cos(angle) * ring.reach, y: cy + Math.sin(angle) * ring.reach, s: ring.size });
          }
        }
      }
      if (cuts) {
        positions = positions.filter((p) => !cuts.some((c) => Math.abs(p.x - c) < p.s / 2 + cutMargin));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Draw fans: slots are ring-ordered, entries carry the final order.
    for (let i = 0; i < Math.min(entries.length, positions.length); i++) {
      const bmp = entries[i].bitmap;
      const pos = positions[i];
      if (!bmp) continue;

      const drawRadius = pos.s / 2;
      ctx.save();
      ctx.beginPath();
      slotPath(ctx, pos.x, pos.y, pos.s, isSquare);
      ctx.clip();
      const sw = bmp.width;
      const sh = bmp.height;
      const s = Math.min(sw, sh);
      ctx.drawImage(bmp, (sw - s) / 2, (sh - s) / 2, s, s, pos.x - drawRadius, pos.y - drawRadius, pos.s, pos.s);
      ctx.restore();
      ctx.lineWidth = Math.max(1, Math.round(pos.s * 0.02));
      ctx.strokeStyle = isSquare ? 'rgba(124, 58, 237, 0.22)' : 'rgba(124, 58, 237, 0.35)';
      ctx.beginPath();
      slotPath(ctx, pos.x, pos.y, pos.s, isSquare);
      ctx.stroke();

      if (typeof bmp.close === 'function') bmp.close();
    }

    // Center avatar with a decorative border (disc or rounded square).
    if (isSquare) {
      const selfSide = selfHalf * 2;
      ctx.beginPath();
      roundedRect(ctx, cx - selfHalf - decorR, cy - selfHalf - decorR, selfSide + decorR * 2, selfSide + decorR * 2, Math.round(selfSide * 0.24));
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      // White inner ring between the purple frame and the avatar, so the
      // center block pops out of the surrounding avatar grid.
      const inner = selfHalf + Math.round(decorR * 0.45);
      ctx.beginPath();
      roundedRect(ctx, cx - inner, cy - inner, inner * 2, inner * 2, Math.round(selfSide * 0.2));
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (selfBlob) {
        try {
          const bmp = await createImageBitmap(selfBlob);
          ctx.save();
          ctx.beginPath();
          roundedRect(ctx, cx - selfHalf, cy - selfHalf, selfSide, selfSide, Math.round(selfSide * 0.18));
          ctx.clip();
          const s = Math.min(bmp.width, bmp.height);
          ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, cx - selfHalf, cy - selfHalf, selfSide, selfSide);
          ctx.restore();
          if (typeof bmp.close === 'function') bmp.close();
        } catch (e) {
          drawPlaceholder(ctx, cx, cy, selfHalf, true);
        }
      } else {
        drawPlaceholder(ctx, cx, cy, selfHalf, true);
      }
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, selfHalf + decorR, 0, Math.PI * 2);
      ctx.fillStyle = '#7c3aed';
      ctx.fill();
      if (selfBlob) {
        try {
          const bmp = await createImageBitmap(selfBlob);
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, selfHalf, 0, Math.PI * 2);
          ctx.clip();
          const s = Math.min(bmp.width, bmp.height);
          ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, cx - selfHalf, cy - selfHalf, selfHalf * 2, selfHalf * 2);
          ctx.restore();
          if (typeof bmp.close === 'function') bmp.close();
        } catch (e) {
          drawPlaceholder(ctx, cx, cy, selfHalf, false);
        }
      } else {
        drawPlaceholder(ctx, cx, cy, selfHalf, false);
      }
    }

    return { canvas, cuts };
  }

  function slotPath(ctx, x, y, s, isSquare) {
    if (isSquare) {
      roundedRect(ctx, x - s / 2, y - s / 2, s, s, Math.max(4, Math.round(s * 0.18)));
    } else {
      ctx.arc(x, y, s / 2, 0, Math.PI * 2);
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Slice the finished canvas into vertical strips along the cut lines.
  async function sliceStrips(canvas, cuts) {
    const xs = [0, ...cuts, canvas.width];
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const w = xs[i + 1] - xs[i];
      if (w < 1) return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = canvas.height;
      const g = c.getContext('2d');
      g.drawImage(canvas, xs[i], 0, w, canvas.height, 0, 0, w, canvas.height);
      const b = await canvasToBlob(c);
      if (!b) return null;
      out.push(b);
    }
    return out;
  }

  // Preview-only copy with dashed guide lines at the cut positions.
  function withCutGuides(canvas, cuts) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0);
    const dash = Math.max(8, Math.round(canvas.height * 0.012));
    g.setLineDash([dash, dash]);
    g.lineWidth = Math.max(2, Math.round(canvas.width * 0.002));
    g.strokeStyle = 'rgba(124, 58, 237, 0.85)';
    for (const x of cuts) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, canvas.height);
      g.stroke();
    }
    return c;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });
  }

  // Average color of a bitmap as an HSL hue in [0, 360). Nearly
  // unfollowable pixels (fully faded or grayscale) return a sentinel past
  // the hue range so they sort to the outer end of the rainbow.
  function bitmapHue(bitmap) {
    const n = 24;
    const box = document.createElement('canvas');
    box.width = n;
    box.height = n;
    const g = box.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, n, n);
    let data;
    try {
      data = g.getImageData(0, 0, n, n).data;
    } catch (e) {
      return null;
    }
    let r = 0, gr = 0, b = 0, a = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.5) continue;
      r += data[i] * alpha;
      gr += data[i + 1] * alpha;
      b += data[i + 2] * alpha;
      a += alpha;
    }
    if (!a) return null;
    return rgbToHue(r / a, gr / a, b / a);
  }

  function rgbToHue(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 14) return 361;
    if (max === r) return ((g - b) / d % 6 + 6) % 6 * 60;
    if (max === g) return ((b - r) / d + 2) * 60;
    return ((r - g) / d + 4) * 60;
  }

  function drawPlaceholder(ctx, cx, cy, r, isSquare) {
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    if (isSquare) {
      roundedRect(ctx, cx - r, cy - r, r * 2, r * 2, Math.round(r * 0.36));
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#ede9fe';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 0.9)}px -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText('我', cx, cy);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'FanOrbit.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // Stagger strip downloads so Chrome does not coalesce or drop them.
  function downloadStrips(blobs) {
    blobs.forEach((b, i) => {
      setTimeout(() => downloadBlob(b, `FanOrbit-${i + 1}.jpg`), i * 400);
    });
  }

  function autoDownload() {
    try {
      if (currentStrips) downloadStrips(currentStrips);
      else if (currentBlob) downloadBlob(currentBlob);
    } catch (e) {
      // Blocked without user gesture; the save button remains available.
    }
  }

  function setControlsEnabled(enabled) {
    $('shapeSel').disabled = !enabled;
    $('selfScaleSel').disabled = !enabled;
    $('splitPartsSel').disabled = !enabled;
  }

  function setStatus(text) {
    $('status').textContent = text;
  }

  function setProgress(frac) {
    $('fill').style.width = Math.min(100, Math.round(frac * 100)) + '%';
  }

  function clampInt(v, min, max, def) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
})();
