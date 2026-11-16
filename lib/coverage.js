// Who must appear, and which accounts have a usable official avatar.
// Counts are by account id. Identical images do not merge two accounts.
var FanOrbitCoverage = (function () {
  function normName(raw) {
    return String(raw || '').replace(/^@/, '').trim().toLowerCase();
  }

  function accountId(raw) {
    if (raw && raw.id != null && String(raw.id).trim()) return String(raw.id).trim();
    var name = normName(raw && (raw.username || raw.screenName));
    return name ? 'name:' + name : '';
  }

  function mutualNames(scoreEntries) {
    var names = new Set();
    var list = scoreEntries || [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      var inn = row.inboundCount || 0;
      var out = row.outboundCount || 0;
      if (inn > 0 && out > 0 && row.screenName) names.add(normName(row.screenName));
    }
    return names;
  }

  function build(spec) {
    var followers = (spec && spec.followers) || [];
    var extras = (spec && spec.extras) || [];
    var named = new Set(((spec && spec.named) || []).map(normName).filter(Boolean));
    var mutual = spec && spec.mutualNames instanceof Set ? spec.mutualNames : mutualNames(spec && spec.scores);
    var missing = [];
    var map = new Map();

    function take(raw, isExtra) {
      var id = accountId(raw);
      var username = raw && (raw.username || raw.screenName) ? String(raw.username || raw.screenName) : '';
      var name = normName(username);
      if (!id) {
        missing.push({ id: '', username: username, reason: '缺少 id' });
        return;
      }
      var url = raw.avatarUrl || raw.avatar || '';
      var failed = !!(raw && (raw.decoded === false || raw.failed === true || raw.error));
      if (!url || failed || !FanOrbitAvatarUrl.isOfficialAvatarUrl(url)) {
        if (isExtra && name) {
          var values = Array.from(map.values());
          for (var n = 0; n < values.length; n++) {
            if (normName(values[n].username) === name) {
              values[n].named = true;
              values[n].must = true;
              return;
            }
          }
        }
        missing.push({
          id: id,
          username: username,
          reason: (raw && raw.reason) || (failed ? '头像下载或解码失败' : '没有可用的官方头像 URL')
        });
        return;
      }
      var prev = map.get(id);
      var flags = {
        named: isExtra || named.has(name) || !!(raw && raw.named),
        mutual: mutual.has(name) || !!(raw && raw.mutual)
      };
      if (!prev) {
        map.set(id, {
          id: id,
          username: username,
          avatarUrl: url,
          imageKey: FanOrbitAvatarUrl.imageKey(url),
          index: Number.isFinite(Number(raw.index)) ? Number(raw.index) : map.size + 1,
          score: Number(raw.score) || 0,
          named: flags.named,
          mutual: flags.mutual,
          must: flags.named || flags.mutual
        });
      } else {
        prev.named = prev.named || flags.named;
        prev.mutual = prev.mutual || flags.mutual;
        prev.must = prev.must || prev.named || prev.mutual;
        if ((Number(raw.score) || 0) > prev.score) prev.score = Number(raw.score) || 0;
      }
    }

    for (var i = 0; i < followers.length; i++) take(followers[i], false);
    for (var j = 0; j < extras.length; j++) take(extras[j], true);

    var accounts = Array.from(map.values());
    var imageCounts = new Map();
    for (var a = 0; a < accounts.length; a++) {
      var key = accounts[a].imageKey;
      imageCounts.set(key, (imageCounts.get(key) || 0) + 1);
    }
    var shared = 0;
    imageCounts.forEach(function (n) {
      if (n > 1) shared += n;
    });

    return {
      accounts: accounts,
      missing: missing.concat((spec && spec.missing) || []),
      uniqueAccounts: accounts.length,
      uniqueImages: imageCounts.size,
      sameImageAccountRatio: accounts.length ? shared / accounts.length : 0,
      mustIds: accounts.filter(function (row) { return row.must; }).map(function (row) { return row.id; })
    };
  }

  function orderForWall(fans, scoreByName) {
    var ranked = [];
    var unscored = [];
    var scores = scoreByName || {};
    for (var i = 0; i < fans.length; i++) {
      var fan = fans[i];
      var key = normName(fan.username || fan.screenName);
      var row = key ? scores[key] : null;
      if (row && row.score > 0) ranked.push({ fan: fan, score: row.score, count: row.interactionCount || 0 });
      else unscored.push(fan);
    }
    ranked.sort(function (a, b) {
      return b.score - a.score || b.count - a.count || (a.fan.index || 0) - (b.fan.index || 0);
    });
    unscored.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
    return {
      ranked: ranked.map(function (row) { return row.fan; }),
      unscored: unscored,
      label: ranked.length ? '互动排序' : '无互动排序'
    };
  }

  return {
    normName: normName,
    mutualNames: mutualNames,
    build: build,
    orderForWall: orderForWall
  };
})();
