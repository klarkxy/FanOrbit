// Official avatar URLs only. Hostname must match exactly: a suffix such as
// evilpbs.twimg.com is not Twitter. HD variants apply to profile images on
// pbs.twimg.com. Default avatars on abs.twimg.com stay on that host.
var FanOrbitAvatarUrl = (function () {
  var PROFILE_HOST = 'pbs.twimg.com';
  var DEFAULT_HOST = 'abs.twimg.com';

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function isProfileHost(url) {
    return hostnameOf(url) === PROFILE_HOST;
  }

  function isDefaultHost(url) {
    return hostnameOf(url) === DEFAULT_HOST;
  }

  function isOfficialAvatarUrl(url) {
    return isProfileHost(url) || isDefaultHost(url);
  }

  function hdVariant(url) {
    if (!isProfileHost(url)) return null;
    var u;
    try {
      u = new URL(url);
    } catch (e) {
      return null;
    }
    if (u.pathname.indexOf('/profile_images/') === -1) return null;
    var next = u.pathname
      .replace(/_normal(\.[a-z]+)$/i, '_400x400$1')
      .replace(/_mini(\.[a-z]+)$/i, '_400x400$1')
      .replace(/_bigger(\.[a-z]+)$/i, '_400x400$1')
      .replace(/_reasonably_small(\.[a-z]+)$/i, '_400x400$1')
      .replace(/_200x200(\.[a-z]+)$/i, '_400x400$1');
    if (next === u.pathname) return null;
    u.pathname = next;
    return u.toString();
  }

  // URLs to try, HD first. The caller must discard a candidate that does
  // not return a decodable image and continue down the list.
  function fetchPlan(url) {
    if (!isOfficialAvatarUrl(url)) {
      return { ok: false, reason: '不是官方头像主机', try: [] };
    }
    var hd = hdVariant(url);
    return { ok: true, reason: '', try: hd ? [hd, url] : [url] };
  }

  function imageKey(url) {
    try {
      var u = new URL(url);
      u.pathname = u.pathname.replace(
        /_(normal|mini|bigger|reasonably_small|200x200|400x400)(\.[a-z]+)$/i,
        '$2'
      );
      return u.hostname.toLowerCase() + u.pathname;
    } catch (e) {
      return String(url || '');
    }
  }

  return {
    PROFILE_HOST: PROFILE_HOST,
    DEFAULT_HOST: DEFAULT_HOST,
    hostnameOf: hostnameOf,
    isOfficialAvatarUrl: isOfficialAvatarUrl,
    hdVariant: hdVariant,
    fetchPlan: fetchPlan,
    imageKey: imageKey
  };
})();
