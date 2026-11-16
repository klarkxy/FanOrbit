// Adaptive vertical slices. A requested count is a wish, not a platform
// maximum and not the extension's old odd-only 19-strip planCuts cap.
// Cuts that would pass through an avatar or the center are not used.
var FanOrbitSlice = (function () {
  function normalizeRequested(value) {
    var n = parseInt(value, 10);
    if (!isFinite(n) || n <= 1) return 1;
    return n;
  }

  function names(count) {
    var width = String(Math.max(1, count)).length;
    var out = [];
    for (var i = 1; i <= count; i++) {
      out.push(String(i).padStart(width, '0') + '.jpg');
    }
    return out;
  }

  function blocksOf(obstacles, center) {
    var blocks = [];
    (obstacles || []).forEach(function (rect) {
      if (!rect || !(rect.w > 0)) return;
      blocks.push([rect.x, rect.x + rect.w]);
    });
    if (center && center.w > 0) blocks.push([center.x, center.x + center.w]);
    blocks.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    blocks.forEach(function (block) {
      // Ranges that only touch at an edge stay separate so the shared
      // boundary can be a cut. Overlapping ranges still merge.
      if (!merged.length || block[0] >= merged[merged.length - 1][1]) merged.push(block.slice());
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], block[1]);
    });
    return merged;
  }

  function cutsInside(cuts, blocks) {
    for (var i = 0; i < cuts.length; i++) {
      var cut = cuts[i];
      for (var b = 0; b < blocks.length; b++) {
        if (blocks[b][0] < cut && cut < blocks[b][1]) return true;
      }
    }
    return false;
  }

  function plan(spec) {
    var width = spec.width;
    var height = spec.height;
    var requested = normalizeRequested(spec.requested);
    var minStrip = spec.minStrip > 0 ? spec.minStrip : 1;
    var blocks = blocksOf(spec.obstacles, spec.center);
    if (!(width > 1) || !(height > 0)) {
      return { cuts: [], parts: 1, strips: [], names: names(1), reduced: false, note: '画面尺寸无效' };
    }
    if (requested === 1) return finish(width, height, [], 1, false, '');

    function attempt(parts) {
      var cuts = [];
      for (var i = 1; i < parts; i++) {
        var ideal = width * i / parts;
        var cut = snap(ideal, cuts, blocks, width);
        if (cut == null) return null;
        cuts.push(cut);
      }
      cuts.sort(function (a, b) { return a - b; });
      for (var c = 1; c < cuts.length; c++) {
        if (cuts[c] <= cuts[c - 1]) return null;
      }
      if (cutsInside(cuts, blocks)) return null;
      var bounds = [0].concat(cuts, [width]);
      for (var w = 0; w < bounds.length - 1; w++) {
        if (bounds[w + 1] - bounds[w] < minStrip) return null;
      }
      if (spec.center && spec.center.w > 0) {
        var held = false;
        for (var s = 0; s < bounds.length - 1; s++) {
          if (bounds[s] <= spec.center.x && spec.center.x + spec.center.w <= bounds[s + 1]) held = true;
        }
        if (!held) return null;
      }
      return cuts;
    }

    var parts = requested;
    var cuts = null;
    while (parts >= 1) {
      cuts = parts === 1 ? [] : attempt(parts);
      if (cuts) break;
      parts -= 1;
    }
    if (!cuts) cuts = [];
    var note = cuts.length + 1 === requested ? '' : '请求 ' + requested + ' 条，按头像和中心之间的空隙排到 ' + (cuts.length + 1) + ' 条';
    return finish(width, height, cuts, cuts.length + 1, cuts.length + 1 !== requested, note);
  }

  function snap(ideal, used, blocks, width) {
    var best = null;
    var bestDist = Infinity;
    var cursor = 0;
    var ranges = blocks.concat([[width, width]]);
    for (var i = 0; i < ranges.length; i++) {
      var start = Math.ceil(cursor);
      var end = Math.floor(ranges[i][0]);
      for (var x = start; x <= end; x++) {
        if (x <= 0 || x >= width || used.indexOf(x) !== -1) continue;
        var dist = Math.abs(x - ideal);
        if (dist < bestDist) {
          bestDist = dist;
          best = x;
        }
      }
      cursor = ranges[i][1];
    }
    return best;
  }

  function finish(width, height, cuts, parts, reduced, note) {
    var bounds = [0].concat(cuts, [width]);
    var strips = [];
    for (var i = 0; i < bounds.length - 1; i++) {
      strips.push({
        index: i,
        x: bounds[i],
        y: 0,
        w: bounds[i + 1] - bounds[i],
        h: height
      });
    }
    return {
      cuts: cuts,
      parts: parts,
      strips: strips,
      names: names(parts),
      reduced: reduced,
      note: note
    };
  }

  // Orbit corridors: drop slots near these lines before drawing. Any
  // requested count is allowed. The result can be even, and it is not
  // capped at 19. The center block stays inside one strip.
  function planCorridor(W, cx, selfExtentHalf, margin, avatarSize, requested) {
    var want = normalizeRequested(requested);
    if (want <= 1) return { cuts: [], parts: 1, reduced: false, note: '' };
    var L = Math.round(cx - selfExtentHalf - margin - 1);
    var R = Math.round(cx + selfExtentHalf + margin + 1);
    var center = { x: L, w: Math.max(1, R - L) };
    var minSide = Math.max(8, Math.round(avatarSize + margin * 2));
    var obstacles = [];
    if (L > minSide) obstacles.push({ x: 0, w: 0 });
    var planned = plan({
      width: W,
      height: 1,
      requested: want,
      obstacles: [],
      center: center,
      minStrip: minSide
    });
    // Reject a plan whose side strips cannot hold one avatar when the
    // canvas is wide enough to do better by asking for fewer strips.
    function sidesOk(result) {
      if (result.parts <= 1) return true;
      return result.strips.every(function (strip) {
        var holdsCenter = strip.x <= center.x && center.x + center.w <= strip.x + strip.w;
        return holdsCenter || strip.w >= minSide;
      });
    }
    var parts = want;
    var result = planned;
    while (result.parts > 1 && !sidesOk(result)) {
      parts -= 1;
      result = plan({ width: W, height: 1, requested: parts, obstacles: obstacles, center: center, minStrip: minSide });
    }
    if (!sidesOk(result)) {
      return { cuts: [], parts: 1, reduced: true, note: '当前宽度排不开所请求的条数' };
    }
    var note = result.parts === want ? '' : '请求 ' + want + ' 条，按中心块和头像列宽排到 ' + result.parts + ' 条';
    return { cuts: result.cuts, parts: result.parts, reduced: result.parts !== want, note: note || result.note };
  }

  function audit(width, strips, obstacles, center) {
    var problems = [];
    if (!strips.length) problems.push('没有切片');
    var cover = 0;
    for (var i = 0; i < strips.length; i++) {
      var strip = strips[i];
      if (!(strip.w >= 1) || !(strip.h >= 1)) problems.push('切片尺寸无效');
      if (i > 0 && strip.x !== strips[i - 1].x + strips[i - 1].w) problems.push('切片没有接上');
      cover += strip.w;
    }
    if (strips.length && (strips[0].x !== 0 || cover !== width)) problems.push('切片没有覆盖整幅宽度');
    var cuts = [];
    for (var c = 1; c < strips.length; c++) cuts.push(strips[c].x);
    (obstacles || []).forEach(function (rect) {
      cuts.forEach(function (cut) {
        if (rect.x < cut && cut < rect.x + rect.w) problems.push('切线穿过头像');
      });
    });
    if (center && center.w > 0) {
      var held = strips.some(function (strip) {
        return strip.x <= center.x && center.x + center.w <= strip.x + strip.w;
      });
      if (!held) problems.push('中心没有完整落在一条里');
    }
    return { ok: problems.length === 0, problems: problems };
  }

  return {
    normalizeRequested: normalizeRequested,
    names: names,
    plan: plan,
    planCorridor: planCorridor,
    audit: audit
  };
})();
