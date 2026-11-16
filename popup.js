import { computeScores } from './lib/scoring.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_CONFIG = {
  username: '',
  maxCount: 'all',
  avatarSize: 96,
  bgColor: '#f5f3ff',
  scanMode: 'fast',
  selfScale: 3,
  colorSort: false,
  output: 'circle',
  mustNames: '',
  splitParts: 1
};

function requestedParts(value) {
  const n = parseInt(value, 10);
  if (!isFinite(n) || n <= 1) return 1;
  return n;
}

  document.addEventListener('DOMContentLoaded', async () => {
    const { config } = await chrome.storage.local.get('config');
    const c = { ...DEFAULT_CONFIG, ...(config || {}) };
    $('username').value = c.username || '';
    $('maxCount').value = c.maxCount === 'all' ? '' : c.maxCount;
    $('avatarSize').value = c.avatarSize;
    $('bgColor').value = c.bgColor;
    $('scanMode').value = c.scanMode || 'fast';
    $('selfScale').value = String(FanOrbitLayout.normalizeSelfScale(c));
    $('colorSort').checked = c.colorSort === true;
    $('output').value = c.output || (c.shape === 'square' ? 'square' : 'circle');
    $('mustNames').value = c.mustNames || '';
    $('splitParts').value = String(requestedParts(c.splitParts));

    $('startBtn').addEventListener('click', start);
    $('genBtn').addEventListener('click', openGen);
    $('importFile').addEventListener('change', importFile);

    chrome.storage.onChanged.addListener(updateFromStorage);
    refreshStatus();
  });

  async function collectConfig() {
    const stored = await chrome.storage.local.get('config');
    const config = {
      ...(stored.config || {}),
      ...DEFAULT_CONFIG,
      username: $('username').value.trim().replace(/^@/, ''),
      maxCount: $('maxCount').value === '' ? 'all' : String($('maxCount').value),
      avatarSize: clampInt($('avatarSize').value, 40, 300, 96),
      bgColor: $('bgColor').value || '#f5f3ff',
      scanMode: $('scanMode').value,
      selfScale: FanOrbitLayout.normalizeSelfScale({ selfScale: $('selfScale').value }),
      colorSort: $('colorSort').checked,
      output: $('output').value,
      shape: $('output').value === 'square' ? 'square' : 'circle',
      mustNames: $('mustNames').value,
      splitParts: requestedParts($('splitParts').value)
    };
    await chrome.storage.local.set({ config });
    return config;
  }

  async function start() {
    const config = await collectConfig();
    if (!config.username) {
      $('status').textContent = '请先输入 X 用户名';
      return;
    }
    $('startBtn').disabled = true;
    $('status').textContent = '已开始，正在打开粉丝页…';
    chrome.runtime.sendMessage({ type: 'START' });
  }

  async function openGen() {
    chrome.runtime.sendMessage({ type: 'GEN_OPEN' });
  }

  async function refreshStatus() {
    const stored = await chrome.storage.local.get();
    updateFromStorage({
      config: { newValue: stored.config },
      progress: { newValue: stored.progress },
      fansData: { newValue: stored.fansData },
      interactionData: { newValue: stored.interactionData }
    });
  }

  function updateFromStorage(changes) {
    if (changes.progress) {
      const p = changes.progress.newValue || {};
      $('status').textContent = p.message || '待开始';
      const frac = p.max > 0 ? Math.min(1, (p.current || 0) / p.max) : 0;
      $('fill').style.width = Math.round(frac * 100) + '%';
    }
    if (changes.fansData || changes.interactionData) {
      chrome.storage.local.get(['fansData', 'interactionData']).then((s) => {
        const fans = (s.fansData && s.fansData.total) || 0;
        const missing = (s.fansData && s.fansData.missing && s.fansData.missing.length) || 0;
        const scored = s.interactionData ? Object.keys(s.interactionData.scores || {}).length : 0;
        const cover = s.fansData && s.fansData.coverage && s.fansData.coverage.note;
        const scan = s.interactionData && s.interactionData.scan && s.interactionData.scan.note;
        $('meta').textContent = [`可用头像 ${fans} 位`, missing ? `缺失 ${missing}` : '', `有分数 ${scored} 位`, cover || '', scan || ''].filter(Boolean).join(' · ');
      });
    }
  }

async function importFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = FanOrbitImport.parse(await file.text());
  } catch (e) {
    $('status').textContent = '导入失败：文件无法读取';
    return;
  }
  if (!parsed.ok) {
    $('status').textContent = '导入被拒绝：' + parsed.problems.join('；');
    return;
  }
  const config = await collectConfig();
  const username = (parsed.self && parsed.self.username) || config.username;
  if (!username) {
    $('status').textContent = '导入文件没有本人用户名，也没有在面板里填写。不能把这份数据当成完整名单。';
    return;
  }
  const fans = parsed.followers.map((row, index) => ({
    id: row.id,
    username: row.username,
    avatar: row.avatarUrl,
    index: row.index || index + 1
  }));
  const selfName = (parsed.self && parsed.self.username) || username;
  const scores = computeScores(parsed.events, selfName.replace(/^@/, '').trim().toLowerCase());
  const note = parsed.coverage.note || (parsed.coverage.followersComplete ? '' : '导入文件没有声明粉丝名单已经完整');
  await chrome.storage.local.set({
    config: { ...config, username: username.replace(/^@/, '').trim(), active: false, status: 'imported' },
    fansData: {
      username: username.replace(/^@/, '').trim(),
      fans,
      total: fans.length,
      collectedAt: Date.now(),
      missing: parsed.missing,
      coverage: {
        source: 'import',
        followersComplete: parsed.coverage.followersComplete === true,
        expected: null,
        collected: fans.length,
        note
      }
    },
    interactionData: {
      username: username.replace(/^@/, '').trim(),
      scores,
      scoreByName: Object.fromEntries(scores.map((row) => [row.screenName, row])),
      avatars: {},
      selfAvatar: (parsed.self && parsed.self.avatarUrl) || '',
      sources: ['import'],
      failures: [],
      scan: {
        channel: 'imported-public-file',
        mode: 'import',
        complete: parsed.coverage.interactionsComplete === true,
        note: parsed.coverage.interactionsComplete
          ? '导入文件声明互动已经完整。插件没有复核 Grok Bot 的采集过程。'
          : '导入的互动不是完整历史。插件没有 Grok Bot 的 X 连接，不能补采。'
      },
      events: parsed.events,
      scannedAt: Date.now()
    },
    progress: {
      current: fans.length,
      max: fans.length,
      message: `已导入 ${fans.length} 个可用头像，缺失 ${parsed.missing.length} 条。${note}`
    }
  });
  $('status').textContent = `已导入 ${fans.length} 个可用头像，缺失 ${parsed.missing.length} 条。${note}`;
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
