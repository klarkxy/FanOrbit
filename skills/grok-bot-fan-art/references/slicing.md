# 切图规则

切多少条、横着还是竖着、奇偶、等宽还是不等宽，由 Grok Bot 按**这一次**的用户要求、成图像素、画面里的头像和中心，以及目标平台当时的能力决定。不要把 15 条、20 张或「总是奇数」写成永久规则。

用户指定了条数或版式，优先照做。做不到就说明限制并给出替代（更少的条、多行、方片或只交预览）。用户没指定时，选一个头像仍可辨、切线不穿头、按文件名顺序能无缝拼回的方案，并在运行记录里写理由。

平台一次允许多少张、多宽、什么长宽比，都要在当次工具或页面上确认。确认不了就写未确认。不能保证 X 一定接受 20 张或任何固定张数。又窄又长的条如果当时不能用，减少条数或改变版式，不要为了凑满上限把图切坏。

## 两种切割不要混名

**项目分图**只指调用了 `lib/layout.js` 的 `fitSplitParts` 和 `planCuts`，并且槽位过滤用的是 `generator.js` 里那条走廊条件。函数结果原样采用，包括它把条数改小、改成奇数、或切出不等宽。

**Bot 后处理**是成图之后另切。用户要的条数是 `planCuts` 不会返回的（偶数、1 以外的非奇数、或大于函数上限）时用这条路径，交付里写明「不是 planCuts」。几何约束相同：不切开头像，拼回无缺口、无重叠。

扩展下载名是 `FanOrbit-1.jpg` 这种不补零的名字。Bot 交付的切片改名为 `01`…`NN`，位数按张数补零。不要为此去改 `generator.js`。

## 项目函数实际会做什么

核对自 commit `bb57f9be8cbe9f3b680967510446a8e6248f3a91` 的 [`lib/layout.js`](../../../lib/layout.js) 与 [`generator.js`](../../../generator.js) 的 `drawOrbitFromItems`。源码变了就以源码为准。

`normalizeSelfScale`：解析失败时为 3，否则夹在 2 和 4 之间。

`normalizeSplitParts`：空值时，旧的 `split3 === true`，或 `split3` 未定义且 `split4 === true`，得到 3，否则得到 1。有数值时，小于等于 1 得到 1；否则夹在 3 和 `SPLIT_MAX`（19）之间，偶数减 1。

`fitSplitParts(requested, W, selfExtentHalf, cutMargin, avatarSize)`：先规范化请求。然后

```text
edge = cutMargin + 1
centerMin = ceil(2 * (selfExtentHalf + cutMargin))
minSide = max(8, round(avatarSize + cutMargin * 2))
pairs = max(0, floor((W - centerMin - edge * 2) / (2 * minSide)))
cap = min(19, 1 + 2 * pairs)，若为偶数再减 1
cap < 3 → 1，否则返回 min(请求, cap)
```

`planCuts(W, cx, selfExtentHalf, m, parts)` 在规范化后不足 3 条时返回 `null`。否则 `mid = (parts - 1) >> 1`，保护带为

```text
L = round(cx - selfExtentHalf - m - 1)
R = round(cx + selfExtentHalf + m + 1)
edge = m + 1
```

`L` 放不进左缘和右缘之间就返回 `null`。左侧切线先取 `min(L, max(edge, round(W * (i+1) / parts)))`，右侧先取 `max(R, min(W - edge, round(W * (i+1) / parts)))`。中心块比一条均分更宽时，函数把左右切线压进两翼，均分间距 `idealGap = max(1, round(W / parts))`。最后强制单调、切线不得落在 `(L, R)` 开区间内，且 `cuts[mid - 1] <= L`、`cuts[mid] >= R`。失败返回 `null`。因此中间条可以比两侧宽，两侧也可以因为取整差 1 像素。这是函数结果，不要再改成等宽。

`drawOrbitFromItems` 在要分图时传入的半宽是 `selfHalf + decorR`，边距是 `cutMargin`，不是裸的头像半宽：

```text
gap = max(6, round(size * 0.12))
selfHalf = round((size * selfScale) / 2)
centerGap = round(size * (方形 ? 0.7 : 0.4))
decorR = max(4, round(size * (方形 ? 0.12 : 0.08)))
pad = round(size * 0.7)
cutMargin = max(3, round(size * 0.04))
```

第一环中心距 `selfHalf + decorR + centerGap + size/2 + gap`，之后每环加上 `(上一环边长 + size) / 2 + gap`。圆的容量是 `max(8, floor(2π * reach / (size + gap)))`。方环每边 `max(2, floor(2 * reach / (size + gap)))`，容量为四倍。画布是正方形，`W = ceil(2 * (reach + size/2) + pad * 2)`，中心在 `(W/2, W/2)`。

有切线时丢掉满足 `abs(槽中心 x - 切线) < 边长/2 + cutMargin` 的槽，再继续加环，直到存活槽不少于粉丝数或环数到 200。切线是竖直的，所以看的是水平距离。存活槽的圆边到切线的净距至少为 `cutMargin`（比较用的是严格小于）。

条带矩形与 `sliceStrips` 相同：边界 `[0, ...cuts, W]`，第 i 条源矩形是 `(x = 边界[i], y = 0, w = 边界[i+1] - 边界[i], h = H)`。

圆形粉丝描边是 `rgba(124, 58, 237, 0.35)`，方形象是 `rgba(124, 58, 237, 0.22)`，线宽 `max(1, round(边长 * 0.02))`，描边中心在轮廓上。圆形中心先画半径 `selfHalf + decorR` 的 `#7c3aed` 圆，再把本人头像裁进半径 `selfHalf`。方形另有白环；圆形没有。这些是绘制事实。Bot 后处理若要保住中心，保护的是装饰圆的外缘，不只是头像正方形。

环的起始角和方环的槽位平移使用 `Math.random()`。同一次输入再跑，切线可能因槽位变化而不同。要复现就保存槽位和 `cuts`，不要重跑后声称坐标没变。

## 网格与 photomosaic

沿整格边界或砖缝切。切线可以贴着格的外缘，不能穿过格内头像。覆盖集里每个账号的每一格，包括第二次出现，都要完整落在某一条里。留白可以跟着所在条走。切图不改变 [`../SKILL.md`](../SKILL.md) 里每人 1 到 2 次的覆盖，也不把留白算进人数。条数仍按当次需求和平台现况决定，不固定某一张数。若一条平台限制使格必须被切开，改为更少的条或另一版式，并报告。

## 校验

对最终切片做程序检查，失败就不要说切图完成：

1. 文件名是从 `01` 到 `NN` 的连续顺序，位数一致。
2. 按这个顺序拼回后，覆盖整幅母版：无缺口、无重叠、无超出。竖切时各条 `y = 0`、`h` 等于母版高，相邻 `x` 相接，宽度之和等于母版宽。横切对称处理。
3. 每一条 `w >= 1` 且 `h >= 1`。
4. 竖直切线不穿过任何粉丝圆（或方格）的水平范围，也不穿过中心头像及其装饰外缘。净距记下最小值。
5. 若要求中心完整落在某一条，那一条的 x 区间覆盖中心装饰的左右外缘。
6. `planCuts` 路径还要核对返回值与重新调用 `planCuts` 的结果一致，并且中间条下标是 `(条数 - 1) / 2`。

无损母版（PNG 或未再压缩的像素缓冲）上，切片几何可以和母版逐像素对齐。各自再压成 JPEG 之后，不能保证和母版或彼此逐像素相同。扩展里的 JPEG 质量是 0.95。交付时说明哪一份是母版、哪一份是有损切片。

## 打包

切片放进一个 zip。附件上限以当时聊天或工具的说明为准。超过时做成多份完整 zip，每份自己能解压，按文件名区间分开，而不是必须顺序拼接的分卷。高清母版留在本地，不放进 Git。
