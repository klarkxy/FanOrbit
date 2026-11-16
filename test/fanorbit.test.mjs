import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computeScores } from '../lib/scoring.js';

function load(rel, name) {
  const filename = path.join(process.cwd(), rel);
  const code = fs.readFileSync(filename, 'utf8');
  const value = new Function(`${code}\nreturn ${name};`)();
  globalThis[name] = value;
}

load('lib/avatar-url.js', 'FanOrbitAvatarUrl');
load('lib/import-public.js', 'FanOrbitImport');
load('lib/coverage.js', 'FanOrbitCoverage');
load('lib/mosaic.js', 'FanOrbitMosaic');
load('lib/slice.js', 'FanOrbitSlice');
load('lib/zipstore.js', 'FanOrbitZip');
load('lib/layout.js', 'FanOrbitLayout');

const Url = globalThis.FanOrbitAvatarUrl;
const Import = globalThis.FanOrbitImport;
const Coverage = globalThis.FanOrbitCoverage;
const Mosaic = globalThis.FanOrbitMosaic;
const Slice = globalThis.FanOrbitSlice;
const Zip = globalThis.FanOrbitZip;
const Layout = globalThis.FanOrbitLayout;

test('avatar host is exact and HD falls back to the original URL', () => {
  const ok = 'https://pbs.twimg.com/profile_images/1/face_normal.jpg';
  assert.equal(Url.isOfficialAvatarUrl(ok), true);
  assert.equal(Url.isOfficialAvatarUrl('https://evilpbs.twimg.com/profile_images/1/face_normal.jpg'), false);
  assert.equal(Url.isOfficialAvatarUrl('https://pbs.twimg.com.evil.test/a.jpg'), false);
  assert.equal(Url.hdVariant(ok), 'https://pbs.twimg.com/profile_images/1/face_400x400.jpg');
  assert.equal(Url.hdVariant('https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'), null);
  assert.equal(Url.isOfficialAvatarUrl('https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'), true);
  const plan = Url.fetchPlan(ok);
  assert.deepEqual(plan.try, [
    'https://pbs.twimg.com/profile_images/1/face_400x400.jpg',
    ok
  ]);
  assert.equal(Url.fetchPlan('https://evilpbs.twimg.com/a.jpg').ok, false);
  assert.equal(
    Url.imageKey(ok),
    Url.imageKey('https://pbs.twimg.com/profile_images/1/face_400x400.jpg')
  );
});

test('import rejects credentials, dedupes ids, and keeps failed rows visible', () => {
  const bad = Import.parse({ format: 'fanorbit-public-v1', bearer: 'nope', followers: [], coverage: { followersComplete: true } });
  assert.equal(bad.ok, false);

  const parsed = Import.parse({
    format: 'fanorbit-public-v1',
    coverage: { followersComplete: false, interactionsComplete: false, note: '分页在中途停止' },
    self: { id: '1', username: 'me', avatarUrl: 'https://pbs.twimg.com/profile_images/me/me_normal.jpg' },
    followers: [
      { id: '2', username: 'a', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_normal.jpg', index: 1 },
      { id: '2', username: 'a-again', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_normal.jpg' },
      { id: '3', username: 'b', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_normal.jpg', index: 2 },
      { id: '4', username: 'c', avatarUrl: 'https://evilpbs.twimg.com/a.jpg' },
      { id: '5', username: 'd', decoded: false, avatarUrl: 'https://pbs.twimg.com/profile_images/d/d.jpg', reason: '解码失败' }
    ],
    events: [{ author: 'a', target: 'me', type: 'reply', createdAt: 10, tweetId: '9' }]
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.followers.length, 2);
  assert.deepEqual(parsed.followers.map((row) => row.id), ['2', '3']);
  assert.equal(parsed.missing.length, 2);
  assert.equal(parsed.coverage.followersComplete, false);
  assert.equal(parsed.events.length, 1);
});

test('coverage counts same image on different ids and builds the must set', () => {
  const scores = computeScores([
    { author: 'a', target: 'me', type: 'reply', createdAt: Date.now() },
    { author: 'me', target: 'a', type: 'reply', createdAt: Date.now() },
    { author: 'b', target: 'me', type: 'mention', createdAt: Date.now() }
  ], 'me');
  const built = Coverage.build({
    followers: [
      { id: '2', username: 'a', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_normal.jpg', score: 3 },
      { id: '3', username: 'b', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_400x400.jpg', score: 1 },
      { id: '4', username: 'c', avatarUrl: 'https://abs.twimg.com/sticky/default_profile_images/default_profile.png', score: 0 },
      { id: '5', username: 'd', failed: true, reason: '下载失败' }
    ],
    extras: [
      { id: '9', username: 'guest', avatarUrl: 'https://pbs.twimg.com/profile_images/g/g_normal.jpg', named: true }
    ],
    named: ['guest'],
    scores
  });
  assert.equal(built.uniqueAccounts, 4);
  assert.equal(built.uniqueImages, 3);
  assert.ok(built.sameImageAccountRatio > 0);
  assert.ok(built.mustIds.includes('2'));
  assert.ok(built.mustIds.includes('9'));
  assert.equal(built.mustIds.includes('3'), false);
  assert.equal(built.missing.some((row) => row.id === '5'), true);
  const namedFan = Coverage.build({
    followers: [{ id: '2', username: 'a', avatarUrl: 'https://pbs.twimg.com/profile_images/a/a_normal.jpg' }],
    extras: [{ username: 'a', named: true }],
    named: ['a']
  });
  assert.equal(namedFan.accounts.length, 1);
  assert.equal(namedFan.accounts[0].must, true);
  assert.equal(namedFan.missing.length, 0);

  const wall = Coverage.orderForWall([
    { username: 'c', index: 1 },
    { username: 'a', index: 2 },
    { username: 'b', index: 3 }
  ], { a: { score: 1, interactionCount: 1 }, b: { score: 1, interactionCount: 4 }, c: { score: 0, interactionCount: 0 } });
  assert.equal(wall.label, '互动排序');
  assert.deepEqual(wall.ranked.map((row) => row.username), ['b', 'a']);
  assert.deepEqual(wall.unscored.map((row) => row.username), ['c']);
  const quiet = Coverage.orderForWall([{ username: 'c', index: 1 }], {});
  assert.equal(quiet.label, '无互动排序');
});

test('mosaic keeps every account once or twice and refuses an impossible grid', () => {
  const accounts = [
    { id: '1', score: 5, named: true, color: [255, 0, 0] },
    { id: '2', score: 1, mutual: true, color: [0, 255, 0] },
    { id: '3', score: 0, color: [0, 0, 255] },
    { id: '4', score: 0, color: [255, 255, 0] }
  ];
  const plan = Mosaic.plan({
    accounts,
    cap: 2,
    cols: 3,
    rows: 3,
    colorAt: (c, r) => (c + r) % 2 === 0 ? [255, 0, 0] : [0, 0, 255]
  });
  assert.equal(plan.ok, true);
  const counts = new Map();
  plan.cells.forEach((cell) => {
    if (!cell.id) return;
    counts.set(cell.id, (counts.get(cell.id) || 0) + 1);
  });
  accounts.forEach((row) => {
    const n = counts.get(row.id) || 0;
    assert.ok(n >= 1 && n <= 2, row.id + ' count ' + n);
  });
  assert.equal(plan.stats.unusedAccounts, 0);
  assert.ok(plan.stats.avatarCells >= accounts.length);
  assert.ok(plan.stats.avatarCells <= accounts.length * 2);
  assert.equal(plan.stats.namedMissing.length, 0);
  const locked = plan.cells.filter((cell) => cell.locked).map((cell) => cell.id);
  assert.ok(locked.includes('1'));
  assert.ok(locked.includes('2'));

  const spaced = Mosaic.plan({
    accounts: [{ id: 'a' }, { id: 'b' }],
    cap: 2,
    cols: 2,
    rows: 2
  });
  assert.equal(spaced.ok, true);
  assert.equal(spaced.stats.duplicateAdjacency, 0);
  assert.equal(spaced.stats.maxPerAccount, 2);

  const tight = Mosaic.plan({ accounts: [1, 2, 3, 4, 5, 6].map((id) => ({ id: String(id) })), maxCells: 5 });
  assert.equal(tight.ok, false);
  assert.equal(tight.stats.avatarCells, 0);
  assert.equal(tight.stats.unusedAccounts, 6);
});

test('slices follow the picture instead of the old odd 19-strip cap', () => {
  assert.equal(Layout.normalizeSplitParts({ splitParts: 4 }), 3);
  assert.equal(Layout.normalizeSplitParts({ splitParts: 20 }), 19);
  const open = Slice.plan({
    width: 200,
    height: 40,
    requested: 4,
    obstacles: [
      { x: 10, w: 20 },
      { x: 70, w: 20 },
      { x: 130, w: 20 }
    ],
    center: { x: 70, w: 20 }
  });
  assert.equal(open.parts, 4);
  const audit = Slice.audit(200, open.strips, open.parts ? [
    { x: 10, w: 20 },
    { x: 70, w: 20 },
    { x: 130, w: 20 }
  ] : [], { x: 70, w: 20 });
  assert.equal(audit.ok, true, audit.problems.join(','));
  assert.equal(Slice.names(open.parts)[0], '1.jpg');

  const crowded = Slice.plan({
    width: 100,
    height: 10,
    requested: 8,
    minStrip: 8,
    obstacles: [{ x: 0, w: 40 }, { x: 60, w: 40 }],
    center: { x: 0, w: 40 }
  });
  assert.ok(crowded.parts < 8);
  assert.equal(Slice.audit(100, crowded.strips, [{ x: 0, w: 40 }, { x: 60, w: 40 }], { x: 0, w: 40 }).ok, true);

  const cells = Slice.plan({
    width: 30,
    height: 10,
    requested: 3,
    minStrip: 10,
    obstacles: [{ x: 0, w: 10 }, { x: 10, w: 10 }, { x: 20, w: 10 }]
  });
  assert.deepEqual(cells.cuts, [10, 20]);

  const corridor = Slice.planCorridor(2400, 1200, 40, 4, 32, 24);
  assert.equal(corridor.parts, 24);
  assert.equal(Layout.normalizeSplitParts({ splitParts: 24 }), 19);
  assert.equal(corridor.parts % 2, 0);
  const left = Math.round(1200 - 40 - 4 - 1);
  const right = Math.round(1200 + 40 + 4 + 1);
  const center = { x: left, w: right - left };
  const bounds = [0, ...corridor.cuts, 2400];
  const strips = bounds.slice(0, -1).map((x, i) => ({ index: i, x, y: 0, w: bounds[i + 1] - x, h: 10 }));
  assert.equal(Slice.audit(2400, strips, [], center).ok, true);
});

test('zip round trip and mosaic planning stays responsive', () => {
  const bytes = Zip.encode([
    { name: '01.jpg', data: new Uint8Array([1, 2, 3, 4]) },
    { name: '02.jpg', data: new Uint8Array([5, 6]) }
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanorbit-zip-'));
  const file = path.join(dir, 'slices.zip');
  fs.writeFileSync(file, bytes);
  const listing = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print("\\n".join(z.namelist())); print(z.read("01.jpg").hex())', file], { encoding: 'utf8' });
  assert.match(listing, /01\.jpg/);
  assert.match(listing, /01020304/);

  const many = Array.from({ length: 1500 }, (_, i) => ({ id: String(i + 1), score: i % 17 }));
  const started = Date.now();
  const plan = Mosaic.plan({ accounts: many, cap: 2 });
  const elapsed = Date.now() - started;
  assert.equal(plan.ok, true);
  assert.equal(plan.stats.unusedAccounts, 0);
  assert.ok(plan.stats.maxPerAccount <= 2);
  assert.ok(elapsed < 5000, 'elapsed ' + elapsed);
});
