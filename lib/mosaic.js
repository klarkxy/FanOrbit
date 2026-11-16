// Character mosaic placement. Coverage and the per-account cap are hard.
// Color is a soft preference applied after every account has one seat.
// Protected seats (named, mutual, high-score) are not moved or replaced.
var FanOrbitMosaic = (function () {
  function plan(spec) {
    var cap = spec && spec.cap != null ? spec.cap : 2;
    var accounts = (spec && spec.accounts ? spec.accounts : []).slice();
    var seen = new Set();
    accounts = accounts.filter(function (row) {
      if (!row || row.id == null || seen.has(String(row.id))) return false;
      seen.add(String(row.id));
      return true;
    });
    var N = accounts.length;
    if (!Number.isFinite(cap) || cap < 1) {
      return fail('次数上限无效', N, accounts);
    }
    if (!N) return fail('没有可用头像', 0, []);

    var maxCells = spec && spec.maxCells;
    var cols = spec && spec.cols ? spec.cols : 0;
    var rows = spec && spec.rows ? spec.rows : 0;
    var adjusted = false;
    if (!(cols > 0) || !(rows > 0)) {
      cols = Math.max(1, Math.ceil(Math.sqrt(N)));
      rows = Math.max(1, Math.ceil(N / cols));
    }
    while (cols * rows < N) {
      if (maxCells && (cols + 1) * rows > maxCells && cols * (rows + 1) > maxCells) {
        return fail('格子上限小于账号数，不能靠删人凑图', N, accounts, { cols: cols, rows: rows, maxCells: maxCells });
      }
      if (cols <= rows) cols += 1;
      else rows += 1;
      adjusted = true;
    }
    var gridCells = cols * rows;
    if (maxCells && gridCells > maxCells) {
      return fail('格子上限小于账号数，不能靠删人凑图', N, accounts, { cols: cols, rows: rows, maxCells: maxCells });
    }

    var cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dx = c + 0.5 - cols / 2;
        var dy = r + 0.5 - rows / 2;
        cells.push({ c: c, r: r, d: dx * dx + dy * dy, id: null, locked: false, copy: 0 });
      }
    }
    cells.sort(function (a, b) { return a.d - b.d || a.r - b.r || a.c - b.c; });

    var scores = accounts.map(function (row) { return Number(row.score) || 0; }).filter(function (n) { return n > 0; });
    scores.sort(function (a, b) { return a - b; });
    var highCut = scores.length ? scores[Math.floor((scores.length - 1) / 2)] : Infinity;

    function isProtected(row) {
      if (row.named || row.must || row.mutual) return true;
      var score = Number(row.score) || 0;
      return score > 0 && score >= highCut;
    }

    var protectedRows = [];
    var openRows = [];
    accounts.forEach(function (row) {
      (isProtected(row) ? protectedRows : openRows).push(row);
    });
    protectedRows.sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0); });
    openRows.sort(function (a, b) { return (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.id).localeCompare(String(b.id)); });

    var count = new Map();
    var seats = new Map();

    function separation(id, c, r) {
      var list = seats.get(id) || [];
      if (!list.length) return Infinity;
      var best = Infinity;
      for (var i = 0; i < list.length; i++) {
        var dist = Math.hypot(list[i].c - c, list[i].r - r);
        if (dist < best) best = dist;
      }
      return best;
    }

    function adjacent(id, c, r) {
      var list = seats.get(id) || [];
      for (var i = 0; i < list.length; i++) {
        if (Math.abs(list[i].c - c) + Math.abs(list[i].r - r) === 1) return true;
      }
      return false;
    }

    function colorDist(row, cell) {
      if (!row.color || !spec.colorAt) return 0;
      var target = spec.colorAt(cell.c, cell.r);
      if (!target) return 0;
      return Math.hypot(row.color[0] - target[0], row.color[1] - target[1], row.color[2] - target[2]);
    }

    function place(cell, row, locked, copy) {
      cell.id = String(row.id);
      cell.locked = !!locked;
      cell.copy = copy;
      count.set(cell.id, (count.get(cell.id) || 0) + 1);
      var list = seats.get(cell.id) || [];
      list.push({ c: cell.c, r: cell.r });
      seats.set(cell.id, list);
    }

    var cursor = 0;
    for (var p = 0; p < protectedRows.length; p++) {
      place(cells[cursor], protectedRows[p], true, 1);
      cursor += 1;
    }

    var pool = openRows.slice();
    for (var n = cursor; n < cells.length && pool.length; n++) {
      var best = 0;
      var bestDist = Infinity;
      for (var k = 0; k < pool.length; k++) {
        var dist = colorDist(pool[k], cells[n]);
        if (dist < bestDist) {
          bestDist = dist;
          best = k;
        }
      }
      place(cells[n], pool.splice(best, 1)[0], false, 1);
      cursor = n + 1;
    }

    var empty = cells.filter(function (cell) { return !cell.id; });
    var room = N * (cap - 1);
    var fillCount = Math.min(empty.length, room);
    var adjacency = 0;
    for (var f = 0; f < fillCount; f++) {
      var cell = empty[f];
      var choice = null;
      var choiceKey = null;
      var fallback = null;
      var fallbackSep = -1;
      for (var q = 0; q < accounts.length; q++) {
        var row = accounts[q];
        var id = String(row.id);
        var used = count.get(id) || 0;
        if (used >= cap) continue;
        var sep = separation(id, cell.c, cell.r);
        var key = [adjacent(id, cell.c, cell.r) ? 0 : 1, sep, -colorDist(row, cell)];
        if (!choice || key[0] > choiceKey[0] || (key[0] === choiceKey[0] && key[1] > choiceKey[1]) || (key[0] === choiceKey[0] && key[1] === choiceKey[1] && key[2] > choiceKey[2])) {
          choice = row;
          choiceKey = key;
        }
        if (sep > fallbackSep) {
          fallback = row;
          fallbackSep = sep;
        }
      }
      if (!choice) break;
      if (choiceKey[0] === 0) adjacency += 1;
      place(cell, choice, false, (count.get(String(choice.id)) || 0) + 1);
    }

    var placedIds = new Map();
    var avatarCells = 0;
    var repeatCells = 0;
    var maxPer = 0;
    cells.forEach(function (cell) {
      if (!cell.id) return;
      avatarCells += 1;
      if (cell.copy > 1) repeatCells += 1;
      placedIds.set(cell.id, (placedIds.get(cell.id) || 0) + 1);
    });
    placedIds.forEach(function (n) { if (n > maxPer) maxPer = n; });

    var problems = [];
    var unused = [];
    accounts.forEach(function (row) {
      var n = placedIds.get(String(row.id)) || 0;
      if (n < 1) unused.push(String(row.id));
      if (n < 1 || n > cap) problems.push(String(row.id) + ' 出现 ' + n + ' 次');
    });
    var T = avatarCells;
    var upper = N * cap;
    if (!(N <= T && T <= upper)) problems.push('有效格数 ' + T + ' 不在 ' + N + '..' + upper);
    var namedMissing = accounts.filter(function (row) {
      return (row.named || row.must) && (placedIds.get(String(row.id)) || 0) < 1;
    }).map(function (row) { return String(row.id); });
    if (namedMissing.length) problems.push('点名或双向候选缺失');

    var lockedOk = true;
    cells.forEach(function (cell) {
      if (!cell.locked || !cell.id) return;
      var owner = accounts.filter(function (row) { return String(row.id) === cell.id; })[0];
      if (!owner || !isProtected(owner)) lockedOk = false;
    });
    if (!lockedOk) problems.push('保护格被换成了非保护账号');

    return {
      ok: problems.length === 0,
      problems: problems,
      cols: cols,
      rows: rows,
      adjusted: adjusted,
      cap: cap,
      cells: cells,
      stats: {
        gridCells: gridCells,
        avatarCells: avatarCells,
        blankCells: gridCells - avatarCells,
        uniqueAccounts: N,
        repeatCells: repeatCells,
        repeatRatio: avatarCells ? repeatCells / avatarCells : 0,
        maxPerAccount: maxPer,
        unusedAccounts: unused.length,
        duplicateAdjacency: adjacency,
        namedMissing: namedMissing
      }
    };
  }

  function fail(reason, N, accounts, extra) {
    return {
      ok: false,
      problems: [reason],
      cols: extra ? extra.cols : 0,
      rows: extra ? extra.rows : 0,
      adjusted: false,
      cap: 0,
      cells: [],
      stats: {
        gridCells: 0,
        avatarCells: 0,
        blankCells: 0,
        uniqueAccounts: N,
        repeatCells: 0,
        repeatRatio: 0,
        maxPerAccount: 0,
        unusedAccounts: accounts.length,
        duplicateAdjacency: 0,
        namedMissing: accounts.filter(function (row) { return row && (row.named || row.must); }).map(function (row) { return String(row.id); })
      }
    };
  }

  return { plan: plan };
})();
