// Shared by the popup and the generator page. Strip count stays odd so the
// center self avatar is the middle image of an X post (at most 20 media,
// so 19 strips). Fan avatars are one size; the center is 2x, 3x or 4x.
var FanOrbitLayout = (function () {
  var SPLIT_MAX = 19;

  function normalizeSplitParts(config) {
    var c = config || {};
    var n = c.splitParts;
    if (n === undefined || n === null || n === '') {
      if (c.split3 === true || (c.split3 === undefined && c.split4 === true)) n = 3;
      else n = 1;
    }
    n = parseInt(n, 10);
    if (!isFinite(n) || n <= 1) return 1;
    n = Math.max(3, Math.min(SPLIT_MAX, n));
    if (n % 2 === 0) n -= 1;
    return n;
  }

  function normalizeSelfScale(config) {
    var c = config || {};
    var n = parseInt(c.selfScale, 10);
    if (!isFinite(n)) n = 3;
    return Math.min(4, Math.max(2, n));
  }

  // Largest odd strip count that still leaves every side strip wide enough
  // for one fan avatar, and the middle strip wide enough for the center block.
  function fitSplitParts(requested, W, selfExtentHalf, cutMargin, avatarSize) {
    var want = normalizeSplitParts({ splitParts: requested });
    if (want <= 1) return 1;
    var edge = cutMargin + 1;
    var centerMin = Math.ceil(2 * (selfExtentHalf + cutMargin));
    var minSide = Math.max(8, Math.round(avatarSize + cutMargin * 2));
    var sideBudget = W - centerMin - edge * 2;
    var pairs = Math.max(0, Math.floor(sideBudget / (2 * minSide)));
    var cap = Math.min(SPLIT_MAX, 1 + 2 * pairs);
    if (cap < 3) return 1;
    if (cap % 2 === 0) cap -= 1;
    return Math.min(want, cap);
  }

  // Vertical cut x-positions. The middle strip is the one that contains the
  // center block [cx - selfExtentHalf, cx + selfExtentHalf]; cuts stay outside
  // that block (plus margin m). Side cuts keep their even shares of the full
  // width, and only compress into the wing when the center block is wider
  // than one share.
  function planCuts(W, cx, selfExtentHalf, m, parts) {
    parts = normalizeSplitParts({ splitParts: parts });
    if (parts < 3) return null;
    var mid = (parts - 1) >> 1;
    var L = Math.round(cx - selfExtentHalf - m - 1);
    var R = Math.round(cx + selfExtentHalf + m + 1);
    var edge = m + 1;
    if (!(L > edge && R < W - edge && L < R)) return null;
    var nCuts = parts - 1;
    var cuts = new Array(nCuts);
    var idealGap = Math.max(1, Math.round(W / parts));

    var i;
    for (i = 0; i < mid; i++) {
      cuts[i] = Math.min(L, Math.max(edge, Math.round(W * (i + 1) / parts)));
    }
    for (i = mid; i < nCuts; i++) {
      cuts[i] = Math.max(R, Math.min(W - edge, Math.round(W * (i + 1) / parts)));
    }

    cuts[mid - 1] = Math.min(cuts[mid - 1], L);
    for (i = mid - 2; i >= 0; i--) {
      if (cuts[i] > L) cuts[i] = L;
      if (cuts[i] >= cuts[i + 1]) cuts[i] = cuts[i + 1] - idealGap;
    }
    if (cuts[0] < edge) {
      for (i = 0; i < mid; i++) cuts[i] = Math.round((i + 1) * L / mid);
      cuts[mid - 1] = L;
    }

    cuts[mid] = Math.max(cuts[mid], R);
    for (i = mid + 1; i < nCuts; i++) {
      if (cuts[i] < R) cuts[i] = R;
      if (cuts[i] <= cuts[i - 1]) cuts[i] = cuts[i - 1] + idealGap;
    }
    if (cuts[nCuts - 1] > W - edge) {
      var span = W - R;
      for (i = 0; i < mid; i++) cuts[mid + i] = Math.round(R + (i * span) / mid);
      cuts[mid] = R;
    }

    for (i = 0; i < nCuts; i++) {
      var lo = i === 0 ? edge : cuts[i - 1] + 1;
      if (cuts[i] < lo) cuts[i] = lo;
      if (cuts[i] > L && cuts[i] < R) cuts[i] = i < mid ? L : R;
      if (i > 0 && cuts[i] <= cuts[i - 1]) cuts[i] = cuts[i - 1] + 1;
      if (cuts[i] > L && cuts[i] < R) return null;
      if (cuts[i] <= 0 || cuts[i] >= W) return null;
    }
    if (cuts[mid - 1] > L || cuts[mid] < R) return null;
    return cuts;
  }

  return {
    SPLIT_MAX: SPLIT_MAX,
    normalizeSplitParts: normalizeSplitParts,
    normalizeSelfScale: normalizeSelfScale,
    fitSplitParts: fitSplitParts,
    planCuts: planCuts
  };
})();
