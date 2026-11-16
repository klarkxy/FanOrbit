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
  let currentPng = null;
  let currentStrips = null;
  let currentPieces = null;

  document.addEventListener('DOMContentLoaded', async () => {
    $('saveBtn').addEventListener('click', () => {
      if (currentBlob) downloadBlob(currentBlob, 'FanOrbit.jpg');
    });
    $('pngBtn').addEventListener('click', () => {
      if (currentPng) downloadBlob(currentPng, 'FanOrbit.png');
    });
    $('zipBtn').addEventListener('click', () => {
      if (currentPieces && currentPieces.length) downloadZip(currentPieces);
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
    $('shapeSel').value = config.output || (config.shape === 'square' ? 'square' : 'circle');
    $('selfScaleSel').value = String(FanOrbitLayout.normalizeSelfScale(config));
    $('splitPartsSel').value = String(FanOrbitSlice.normalizeRequested(config.splitParts));
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
      output: $('shapeSel').value,
      shape: $('shapeSel').value === 'square' ? 'square' : 'circle',
      selfScale: FanOrbitLayout.normalizeSelfScale({ selfScale: $('selfScaleSel').value }),
      splitParts: FanOrbitSlice.normalizeRequested($('splitPartsSel').value)
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
    const output = config.output || shape;
    const splitParts = FanOrbitSlice.normalizeRequested(config.splitParts);
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
      const fetchedSelf = await Downloader.fetchOfficial(interactionData.selfAvatar);
      selfBlob = fetchedSelf.blob;
    }

    const ordered = buildOrderedItems(ranked, ok, output === 'circle' || output === 'square' ? unranked : unranked.slice().sort((a, b) => (a.index || 0) - (b.index || 0)), ok);
    if (!output || output === 'circle' || output === 'square') {
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
    await presentCanvas(result && result.canvas, result && result.cuts, result && result.placed, result && result.centerRect, {
      output,
      ordered,
      scored: ranked.length,
      size,
      selfScale,
      splitParts,
      note: result && result.sliceNote,
      colorSort: config.colorSort === true,
      failed: loaded.failed,
      coverage: fansData.coverage,
      scan: interactionData.scan,
      missing: fansData.missing || []
    });
    return;
    }

    await presentFlat(output, fans, loaded, selfBlob, size, bgColor, config, scoreByName, splitParts, fansData, interactionData);
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
    let sliceNote = '';
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
      const corridor = FanOrbitSlice.planCorridor(W, cx, selfHalf + decorR, cutMargin, size, opts.splitParts);
      cuts = corridor.parts > 1 ? corridor.cuts : null;
      sliceNote = corridor.note || '';

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

    const placed = [];
    const centerRect = {
      x: cx - (selfHalf + decorR),
      y: cy - (selfHalf + decorR),
      w: (selfHalf + decorR) * 2,
      h: (selfHalf + decorR) * 2
    };
    // Draw fans: slots are ring-ordered, entries carry the final order.
    for (let i = 0; i < Math.min(entries.length, positions.length); i++) {
      const bmp = entries[i].bitmap;
      const pos = positions[i];
      if (!bmp) continue;

      const drawRadius = pos.s / 2;
      placed.push({ x: pos.x - drawRadius, y: pos.y - drawRadius, w: pos.s, h: pos.s });
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

    return { canvas, cuts, placed, centerRect, sliceNote };
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
    $('targetFile').disabled = !enabled;
  }

  function stripsFrom(width, height, cuts, note) {
    const bounds = [0, ...cuts, width];
    const strips = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      strips.push({ index: i, x: bounds[i], y: 0, w: bounds[i + 1] - bounds[i], h: height });
    }
    return { cuts, parts: strips.length, strips, names: FanOrbitSlice.names(strips.length), note: note || '', reduced: false };
  }

  async function presentCanvas(canvas, cuts, placed, centerRect, info) {
    if (!canvas) {
      setStatus('图片生成失败。');
      setControlsEnabled(true);
      return;
    }
    const png = await canvasToPng(canvas);
    const blob = await canvasToBlob(canvas);
    if (!blob || !png) {
      setStatus('图片生成失败。');
      setControlsEnabled(true);
      return;
    }
    let plan = { cuts: [], parts: 1, strips: [{ index: 0, x: 0, y: 0, w: canvas.width, h: canvas.height }], names: ['01.jpg'], note: info.note || '', reduced: false };
    let audit = FanOrbitSlice.audit(canvas.width, plan.strips, placed || [], centerRect);
    if (cuts && cuts.length) {
      const corridorPlan = stripsFrom(canvas.width, canvas.height, cuts, info.note || '');
      const corridorAudit = FanOrbitSlice.audit(canvas.width, corridorPlan.strips, placed || [], centerRect);
      if (corridorAudit.ok) {
        plan = corridorPlan;
        audit = corridorAudit;
      }
    }
    if ((info.splitParts || 1) > 1) {
      const adaptive = FanOrbitSlice.plan({
        width: canvas.width,
        height: canvas.height,
        requested: info.splitParts,
        minStrip: Math.max(8, info.size || 1),
        obstacles: placed || [],
        center: centerRect
      });
      const adaptiveAudit = FanOrbitSlice.audit(canvas.width, adaptive.strips, placed || [], centerRect);
      if (adaptiveAudit.ok && adaptive.parts > 1) {
        plan = adaptive;
        audit = adaptiveAudit;
      }
    }
    let strips = null;
    if (audit.ok && plan.parts > 1) strips = await sliceStrips(canvas, plan.cuts);
    currentPng = png;
    currentBlob = blob;
    currentStrips = strips;
    currentPieces = strips ? await namedPieces(strips, plan.names) : null;
    $('zipBtn').disabled = !currentPieces;
    $('pngBtn').disabled = false;
    $('saveBtn').disabled = false;
    $('againBtn').disabled = false;
    const previewCanvas = currentPieces ? withCutGuides(canvas, plan.cuts) : canvas;
    const previewBlob = await canvasToBlob(previewCanvas);
    $('preview').src = URL.createObjectURL(previewBlob || blob);
    $('preview').style.display = 'block';
    setControlsEnabled(true);
    const lines = [
      `${info.ordered.length} 位已绘制`,
      info.output === 'square' ? '方形环' : '圆形同心环',
      info.colorSort ? '颜色排序（彩虹环）' : `互动排序 ${info.scored} 位`,
      `中心 ${info.selfScale} 倍`,
      plan.note || (plan.parts > 1 ? `竖裁 ${plan.parts} 条` : '不分图'),
      audit.ok ? '切线没有穿过头像或中心' : ('切图校验失败：' + audit.problems.join('；'))
    ];
    if (info.coverage && info.coverage.note) lines.push(info.coverage.note);
    if (info.scan && info.scan.note) lines.push(info.scan.note);
    if (info.failed) lines.push(`头像下载失败 ${info.failed} 个`);
    if (info.missing && info.missing.length) lines.push(`名单里另有缺失 ${info.missing.length} 条`);
    $('meta').textContent = lines.join(' · ');
    $('report').textContent = lines.join('\n');
    setProgress(1);
    setStatus(audit.ok ? '生成完成' : '生成完成，但切片没有通过校验，未提供切片');
  }

  async function presentFlat(output, fans, loaded, selfBlob, size, bgColor, config, scoreByName, splitParts, fansData, interactionData) {
    const failedRows = loaded.results.filter((row) => row && !row.blob).map((row) => ({
      id: row.id || '',
      username: row.username || '',
      failed: true,
      reason: row.error || '头像下载或解码失败',
      avatar: row.avatar
    }));
    const okFans = fans.filter((fan) => loaded.results.some((row) => row && row.blob && row.username === fan.username));
    const named = String(config.mustNames || '').split(/\s+/).filter(Boolean);
    const built = FanOrbitCoverage.build({
      followers: okFans.map((fan) => {
        const score = scoreByName[(fan.username || '').toLowerCase()];
        return { ...fan, avatarUrl: fan.avatar, score: score ? score.score : 0 };
      }),
      extras: named.map((name) => ({ username: name, named: true })),
      named,
      scores: Object.values(scoreByName || {}),
      missing: (fansDataMissing(loaded))
    });
    built.missing.push(...failedRows.map((row) => ({ id: row.id, username: row.username, reason: row.reason })));
    await Promise.all(loaded.results.filter((row) => row && row.blob).map(async (row) => {
      try { row.image = await createImageBitmap(row.blob); } catch (e) { row.image = null; }
    }));
    if (output === 'grid') {
      const wall = FanOrbitCoverage.orderForWall(okFans, scoreByName);
      const canvas = drawGrid(wall.ranked.concat(wall.unscored), loaded.results, size, bgColor);
      const placed = gridRects(wall.ranked.length + wall.unscored.length, size);
      await presentCanvas(canvas, [], placed, null, {
        output, ordered: wall.ranked.concat(wall.unscored), scored: wall.ranked.length, size, selfScale: 1,
        splitParts, note: wall.label, colorSort: false, failed: failedRows.length,
        coverage: { note: [wall.label + '。普通头像墙每人一格。', fansData.coverage && fansData.coverage.note].filter(Boolean).join(' ') },
        scan: interactionData.scan, missing: built.missing
      });
      return;
    }
    const targetBlob = await readTargetFile() || selfBlob;
    const accounts = await accountColors(built.accounts, loaded.results);
    let colorAt = null;
    let targetBitmap = null;
    if (targetBlob) {
      try { targetBitmap = await createImageBitmap(targetBlob); } catch (e) { targetBitmap = null; }
    }
    const probe = FanOrbitMosaic.plan({ accounts, cap: 2 });
    if (targetBitmap && probe.ok) colorAt = sampleColors(targetBitmap, probe.cols, probe.rows);
    const plan = FanOrbitMosaic.plan({ accounts, cap: 2, cols: probe.cols, rows: probe.rows, colorAt });
    if (!plan.ok) {
      setStatus(plan.problems.join('；') || '马赛克排不开');
      $('report').textContent = plan.problems.join('\n');
      setControlsEnabled(true);
      return;
    }
    const canvas = drawMosaic(plan, accounts, loaded.results, size, bgColor, colorAt);
    const placed = plan.cells.filter((cell) => cell.id).map((cell) => ({
      x: cell.c * size, y: cell.r * size, w: size, h: size
    }));
    const stats = plan.stats;
    await presentCanvas(canvas, [], placed, null, {
      output,
      ordered: accounts,
      scored: accounts.filter((row) => row.score > 0).length,
      size,
      selfScale: 1,
      splitParts,
      note: [
        '角色马赛克',
        `总格 ${stats.gridCells}`,
        `有效头像格 ${stats.avatarCells}`,
        `唯一账号 ${stats.uniqueAccounts}`,
        `唯一图像 ${built.uniqueImages}`,
        `同图账号比例 ${(built.sameImageAccountRatio * 100).toFixed(1)}%`,
        `重复格 ${stats.repeatCells}（${(stats.repeatRatio * 100).toFixed(1)}%）`,
        `每人最多 ${stats.maxPerAccount} 次`,
        `未使用 ${stats.unusedAccounts}`,
        `相邻重复 ${stats.duplicateAdjacency}`,
        targetBitmap ? '使用了轻度调色，头像仍可辨认' : '没有目标图，未做颜色优化',
        `缺失 ${built.missing.length}`,
        fansData.coverage && fansData.coverage.note,
        interactionData.scan && interactionData.scan.note
      ].filter(Boolean).join('，'),
      colorSort: false,
      failed: failedRows.length,
      coverage: fansData.coverage,
      scan: interactionData.scan,
      missing: built.missing
    });
    if (targetBitmap && targetBitmap.close) targetBitmap.close();
  }

  function fansDataMissing() {
    return [];
  }

  function gridRects(count, size) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rects = [];
    for (let i = 0; i < count; i++) {
      rects.push({ x: (i % cols) * size, y: Math.floor(i / cols) * size, w: size, h: size });
    }
    return rects;
  }

  function drawGrid(ordered, results, size, bgColor) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length || 1)));
    const rows = Math.max(1, Math.ceil((ordered.length || 1) / cols));
    const canvas = document.createElement('canvas');
    canvas.width = cols * size;
    canvas.height = rows * size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ordered.forEach((fan, index) => {
      const got = results.find((row) => row && row.username === fan.username && row.blob);
      if (!got) return;
      const x = (index % cols) * size;
      const y = Math.floor(index / cols) * size;
      drawCover(ctx, got.bitmap || null, got, x, y, size);
    });
    return canvas;
  }

  function drawMosaic(plan, accounts, results, size, bgColor, colorAt) {
    const canvas = document.createElement('canvas');
    canvas.width = plan.cols * size;
    canvas.height = plan.rows * size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const byId = new Map(accounts.map((row) => [String(row.id), row]));
    plan.cells.forEach((cell) => {
      if (!cell.id) return;
      const account = byId.get(cell.id);
      const got = results.find((row) => row && account && row.username === account.username && row.blob);
      const x = cell.c * size;
      const y = cell.r * size;
      if (got) drawCover(ctx, null, got, x, y, size);
      if (colorAt) {
        const tint = colorAt(cell.c, cell.r);
        if (tint) {
          ctx.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},0.12)`;
          ctx.fillRect(x, y, size, size);
        }
      }
    });
    return canvas;
  }

  function drawCover(ctx, bitmap, item, x, y, size) {
    // bitmap is created lazily by the caller through createImageBitmap; the
    // download result only has a blob. The async path below is not used.
    if (item.image) {
      ctx.save();
      roundedClip(ctx, x, y, size);
      ctx.drawImage(item.image, x, y, size, size);
      ctx.restore();
    }
  }

  async function accountColors(accounts, results) {
    const out = [];
    for (const account of accounts) {
      const got = results.find((row) => row && row.username === account.username && row.blob);
      let color = null;
      if (got && got.image) {
        try { color = averageColor(got.image); } catch (e) { color = null; }
      }
      out.push({ ...account, color });
    }
    return out;
  }

  function averageColor(bitmap) {
    const box = document.createElement('canvas');
    box.width = 8;
    box.height = 8;
    const g = box.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, 8, 8);
    const data = g.getImageData(0, 0, 8, 8).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++;
    }
    return n ? [r / n, gg / n, b / n] : null;
  }

  function sampleColors(bitmap, cols, rows) {
    const box = document.createElement('canvas');
    box.width = cols;
    box.height = rows;
    const g = box.getContext('2d', { willReadFrequently: true });
    g.drawImage(bitmap, 0, 0, cols, rows);
    const data = g.getImageData(0, 0, cols, rows).data;
    return (c, r) => {
      const i = (r * cols + c) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
  }

  function roundedClip(ctx, x, y, size) {
    ctx.beginPath();
    ctx.rect(x, y, size, size);
  }

  function readTargetFile() {
    const input = $('targetFile');
    const file = input && input.files && input.files[0];
    return file ? Promise.resolve(file) : Promise.resolve(null);
  }

  async function namedPieces(strips, names) {
    const pieces = [];
    for (let i = 0; i < strips.length; i++) {
      const buf = new Uint8Array(await strips[i].arrayBuffer());
      pieces.push({ name: names[i] || (i + 1) + '.jpg', data: buf, blob: strips[i] });
    }
    return pieces;
  }

  function downloadZip(pieces) {
    const bytes = FanOrbitZip.encode(pieces.map((piece) => ({ name: piece.name, data: piece.data })));
    downloadBlob(new Blob([bytes], { type: 'application/zip' }), 'FanOrbit-slices.zip');
  }

  function canvasToPng(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
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
