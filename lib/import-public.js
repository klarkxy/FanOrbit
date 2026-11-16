// fanorbit-public-v1: a local file the user exports from a Grok Bot run or
// writes by hand. It carries public ids, usernames, avatar URLs and public
// interaction events. It is not a connection to Grok Bot and must not
// contain tokens, cookies or passwords.
var FanOrbitImport = (function () {
  var FORMAT = 'fanorbit-public-v1';
  var BANNED_KEY = /token|cookie|authorization|bearer|password|oauth|secret/i;

  function bannedKey(key) {
    return BANNED_KEY.test(String(key || ''));
  }

  function walkKeys(value, path, problems) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) walkKeys(value[i], path + '[' + i + ']', problems);
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      if (bannedKey(keys[k])) problems.push('不允许的字段 ' + path + keys[k]);
      walkKeys(value[keys[k]], path + keys[k] + '.', problems);
    }
  }

  function asObject(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw;
  }

  function parse(raw) {
    var problems = [];
    var data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return { ok: false, problems: ['JSON 无法解析'], coverage: null, followers: [], missing: [], events: [], self: null };
      }
    }
    data = asObject(data);
    if (!data) return { ok: false, problems: ['根节点必须是对象'], coverage: null, followers: [], missing: [], events: [], self: null };
    walkKeys(data, '', problems);
    if (data.format !== FORMAT) problems.push('format 必须是 ' + FORMAT);
    var coverageIn = asObject(data.coverage) || {};
    var coverage = {
      followersComplete: coverageIn.followersComplete === true,
      interactionsComplete: coverageIn.interactionsComplete === true,
      note: typeof coverageIn.note === 'string' ? coverageIn.note : ''
    };
    if (!coverage.followersComplete && !coverage.note) {
      coverage.note = '导入文件没有声明粉丝名单已经完整';
    }

    var self = null;
    if (data.self != null) {
      var s = asObject(data.self);
      if (!s) problems.push('self 必须是对象');
      else {
        self = {
          id: s.id == null ? '' : String(s.id),
          username: s.username == null ? '' : String(s.username),
          avatarUrl: s.avatarUrl == null ? '' : String(s.avatarUrl)
        };
        if (self.avatarUrl && !FanOrbitAvatarUrl.isOfficialAvatarUrl(self.avatarUrl)) {
          problems.push('self.avatarUrl 不是官方头像主机');
          self.avatarUrl = '';
        }
      }
    }

    var followers = [];
    var missing = [];
    var seen = new Set();
    var list = Array.isArray(data.followers) ? data.followers : [];
    for (var i = 0; i < list.length; i++) {
      var row = asObject(list[i]);
      if (!row) {
        missing.push({ id: '', username: '', reason: '第 ' + (i + 1) + ' 行不是对象' });
        continue;
      }
      var id = row.id == null ? '' : String(row.id).trim();
      var username = row.username == null ? '' : String(row.username).replace(/^@/, '').trim();
      if (!id) {
        missing.push({ id: '', username: username, reason: '缺少 id' });
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      var avatarUrl = row.avatarUrl == null ? '' : String(row.avatarUrl);
      var failed = row.decoded === false || row.failed === true || !avatarUrl;
      if (!failed && !FanOrbitAvatarUrl.isOfficialAvatarUrl(avatarUrl)) {
        missing.push({ id: id, username: username, reason: '头像主机不受支持' });
        continue;
      }
      if (failed) {
        missing.push({ id: id, username: username, reason: row.reason ? String(row.reason) : '头像缺失或下载失败' });
        continue;
      }
      followers.push({
        id: id,
        username: username,
        avatarUrl: avatarUrl,
        index: Number.isFinite(Number(row.index)) ? Number(row.index) : followers.length + 1
      });
    }

    var extraMissing = Array.isArray(data.missing) ? data.missing : [];
    for (var m = 0; m < extraMissing.length; m++) {
      var miss = asObject(extraMissing[m]) || {};
      missing.push({
        id: miss.id == null ? '' : String(miss.id),
        username: miss.username == null ? '' : String(miss.username),
        reason: miss.reason ? String(miss.reason) : '导入时标记为缺失'
      });
    }

    var events = [];
    var eventList = Array.isArray(data.events) ? data.events : [];
    for (var e = 0; e < eventList.length; e++) {
      var ev = asObject(eventList[e]);
      if (!ev) continue;
      events.push({
        tweetId: ev.tweetId == null ? '' : String(ev.tweetId),
        author: ev.author == null ? '' : String(ev.author),
        target: ev.target == null ? '' : String(ev.target),
        type: ev.type == null ? '' : String(ev.type),
        createdAt: Number.isFinite(Number(ev.createdAt)) ? Number(ev.createdAt) : undefined
      });
    }

    return {
      ok: problems.length === 0,
      problems: problems,
      format: FORMAT,
      self: self,
      followers: followers,
      missing: missing,
      events: events,
      coverage: coverage
    };
  }

  return { FORMAT: FORMAT, parse: parse };
})();
