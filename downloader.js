// Avatar downloader: fetch avatar blobs into the IndexedDB cache, with
// retry and per-URL de-duplication.

globalThis.Downloader = (() => {
  const CONCURRENCY = 8;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isImage(blob) {
    if (!blob || blob.size <= 0) return false;
    if (!blob.type) return true;
    return blob.type.indexOf('image/') === 0;
  }

  async function fetchOfficial(url) {
    const plan = (typeof FanOrbitAvatarUrl !== 'undefined')
      ? FanOrbitAvatarUrl.fetchPlan(url)
      : { ok: true, reason: '', try: [url] };
    if (!plan.ok) return { blob: null, reason: plan.reason, used: '', fallback: false };
    for (let i = 0; i < plan.try.length; i++) {
      const candidate = plan.try[i];
      let blob = null;
      try {
        blob = await AvatarCache.get(candidate);
      } catch (e) {
        blob = null;
      }
      if (!blob || !isImage(blob)) blob = await fetchWithRetry(candidate);
      if (blob && isImage(blob)) {
        try {
          await AvatarCache.put(candidate, blob);
        } catch (e) {
          // Cache failure is not fatal.
        }
        return { blob: blob, reason: '', used: candidate, fallback: i > 0 };
      }
    }
    return { blob: null, reason: '下载或解码失败', used: '', fallback: false };
  }

  async function fetchWithRetry(url, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error('empty image');
        return blob;
      } catch (e) {
        if (i === attempts - 1) return null;
        await sleep(500 * (i + 1));
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  async function download(items, onProgress) {
    const results = new Array(items.length);
    let cursor = 0;
    let done = 0;
    let failed = 0;

    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) break;
        const item = items[idx];
        let blob = null;
        let reason = '';
        let fallback = false;
        if (item && item.avatar) {
          try {
            const fetched = await fetchOfficial(item.avatar);
            blob = fetched.blob;
            reason = fetched.reason || '';
            fallback = !!fetched.fallback;
          } catch (e) {
            blob = null;
            reason = '下载或解码失败';
          }
        } else {
          reason = '没有头像 URL';
        }
        results[idx] = { ...item, blob, cached: !!blob, error: blob ? '' : reason, fallback };
        if (!blob) failed++;
        done++;
        if (onProgress) {
          try {
            onProgress({ done, total: items.length, failed });
          } catch (e) {
            // Ignore progress callback failures.
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, items.length)) }, worker));
    return { results, failed, ok: results.filter((r) => r && r.blob) };
  }

  return { download, fetchWithRetry, fetchOfficial };
})();
