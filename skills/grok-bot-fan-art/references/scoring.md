# 互动评分规格

公式核对自 FanOrbit `1.3.0`，commit `bb57f9be8cbe9f3b680967510446a8e6248f3a91` 的 [`lib/scoring.js`](../../../lib/scoring.js)。上墙顺序在 [`generator.js`](../../../generator.js)，事件如何变成 `reply` / `quote` / `mention` / `repost` 在 [`lib/interaction.js`](../../../lib/interaction.js)。源码若已变化，以源码为准，并改写本页，不要沿用过期公式。

云端已有工作副本时，直接调用 `computeScores(events, selfLower)`。不要为了调用去 clone 仓库。本机只持有事件 JSON 时，按下面的公式复现，在运行记录里写 `formula-replay` 和冻结的 `now`。官方 X 连接采到的事件用同一公式，**不能**说成和扩展的 fxtwitter / Yahoo / Bing 数据相同。

`selfLower` 必须在调用前规范化。`computeScores` **不会**再规范化这个参数。作者和对象会规范化：去掉一个前导 `@`、trim、转小写。`@@name` 只会变成 `@name`。

## 事件

评分只读 `{ author, target, type, createdAt }`。`tweetId` 不参与加分，只用于采集阶段去重。

丢弃：作者或对象为空，或规范化后作者等于对象，或两边都不是 `selfLower`。未知或缺失的 `type` 改按 `mention`。

```text
TYPE = { reply: 1, quote: 0.8, mention: 0.6, repost: 0.4 }
w = TYPE[type] * timeWeight(createdAt, now)
target == selfLower → author.inbound += w，inboundCount += 1
author == selfLower → target.outbound += w，outboundCount += 1
```

`in` / `out` 是加权和，不是条数。`interactionCount = inboundCount + outboundCount`，是累加的事件条数。一帖出站可以变成多条事件，所以条数可以大于帖数。

## timeWeight

```text
timeWeight(createdAt, now):
  createdAt 缺失或不是有限数 → 1
  t < 1e12 → t = t * 1000
  days = max(0, now - t) / 86400000
  days <= 2 → 1
  days <= 5 → 0.95
  否则 → 0.95 * exp(-(days - 5) / 15)
```

边界含等号。第 5 天整是 `0.95`，刚超过 5 天仍从 `0.95` 接上指数。未来时间被压成 0 天，权重为 1。缺时间也是 1，不要默默丢掉，在记录里注明有多少条走了缺省权重。

仓库函数 `timeWeight(createdAt)` 不接收统一时钟，每次用调用时的 `Date.now()`。复现时对整批冻结同一个 `now`，并写入记录。一天按 86400000 毫秒，不另做时区折算。

## balance 与最终分

```text
total   = in + out
balance = total > 0 ? 2 * min(in, out) / total : 0
base    = in * 1.5 + out * 0.5
score   = round(base * (0.7 + 0.3 * balance) * 1000) / 1000
```

`balance` 为 0 表示加权和只有一边，为 1 表示两边相等。正数的 `round` 是加 0.5 后向下取整（半值远离 0）。没有事件的用户不会出现在结果里。舍入后 `score == 0` 的人，在上墙时和没有记录的人一样对待。

`computeScores` 自身的排序是：`score` 降序，`interactionCount` 降序，然后 `screenName.localeCompare(screenName)`（不传 locale，随运行环境）。**上墙不要用这个用户名序。**

## 上墙顺序

`generator.js` 在 `colorSort !== true` 时：

```text
有记录且 score > 0 → 按 score 降序、interactionCount 降序、fan.index 升序
其余 → shuffle（Fisher–Yates，Math.random）
```

排好的有分列表在前，洗牌后的无分列表在后，再送进 `drawOrbitFromItems`。槽位从内环到外环。`fan.index` 在 `collector.js` 里是首次见到的顺序，从 1 起。Bot 自己的名单用采集顺序的稳定下标，同样从 1 起，并在记录里说明。完全无互动数据时，项目会把所有人洗牌；用户要求原顺序时跳过洗牌，并标记「无互动排序」。不要把洗牌或原顺序叫成互动排序。

`colorSort === true` 时，互动顺序整段不用。所有头像按 `bitmapHue` 从低到高，缺失色相放最后；同一色相保持原下标。色差 `max - min < 14` 的灰度得到哨兵值 361，排到外侧。这是项目行为，不要另写一种彩虹再声称是 FanOrbit。

## 扩展如何识别类型

`scoring.js` 不识别类型。扩展的分类在 `lib/interaction.js`。官方连接要先变成同样的事件形状，再评分。

fxtwitter **入站**一帖只留一种，先匹配先生效：

1. `reposted_by` 存在、不是本人、且原作者是本人 → `repost`（事件作者是转发者，对象是本人）。
2. 否则作者不是本人，且 `replying_to` 是本人 → `reply`。
3. 否则 `quote.author` 是本人 → `quote`。
4. 否则提及里有本人 → `mention`。
5. 否则不产生入站事件。

fxtwitter **出站**要求作者是本人，符合的都算，可以叠加：

- 回复对象不是本人 → 一条 `reply`
- 每个不是本人的提及 → 各一条 `mention`（回复对象若也在提及里，会再记一条 mention）
- 引用对象不是本人 → 一条 `quote`

Yahoo 入站：`replyMentions` 含本人才是 `reply`，否则一律 `mention`，不出 `quote` / `repost`。Yahoo 出站只给每个被提及的他人一条 `mention`。

Bing（`bingEvents`）只产生 `type: 'mention'`：`author` 是推文 URL 里的用户名，`parseBingHtml` 会跳过本人；`target` 固定为本人；`createdAt` 为 `undefined`。`computeScores` 因 `target === selfLower` 把它们记成入站 mention，时间权重为 1。源码注释写的是 “Inbound mentions only.” 不是出站。

官方 X 帖按同一优先级映射，字段以当次 schema 为准（常见是 `referenced_tweets` 的 `replied_to` / `quoted` / `retweeted`，以及提及实体）：

- 入站仍是互斥的四段优先级。区分不了转发、回复、引用时，不要猜成权重更高的类型；只有确实看到提及才记 `mention`，否则不产生这条并记下缺口。
- 出站仍可一帖多条。回复对象和提及都在时，两条都保留。
- 采集阶段按 `tweetId` 去重后再分类。扩展里 fxtwitter 的搜索和主页时间线共用一个 seen，id 即使没产出事件也会占掉。单一官方来源做一次去重即可。
- 扩展把 Yahoo、Bing、fxtwitter **拼在一起时不去重**，同一帖可能加多次。Bot 只用官方连接这一路时，不要再混入那三路，也不要声称结果与扩展运行相同。

`computeScores` 本身不看 `tweetId`，数组里重复的事件会重复加分。去重要在调用之前做完。

## 与 README 的差别

README「评分方法」里的四类权重、方向 1.5 / 0.5，以及 `final = (in×1.5 + out×0.5) × (0.7 + 0.3×balance)` 的外形与代码一致。下面这些以代码为准：

- README 没有定义 `balance`。代码是 `2 * min(in, out) / (in + out)`，用加权和。
- README 只说 5 天之后按 15 天特征时间指数衰减。代码是 `0.95 * exp(-(days - 5) / 15)`，`days <= 2` 为 1，`days <= 5` 为 0.95。
- README 没写缺时间、非法时间、未来时间，也没写小于 `1e12` 的值当秒。
- README 没写最终分四舍五入到三位小数。
- README 的评分来源没写 Bing。Bing 事件会进入 `computeScores`。用法说明的阶段 2 也没写 Bing。
- 「按用户名合并去重」在代码里是按用户**相加**，不是按帖删掉跨源重复。
- README 没写上墙 tie-break。生成页用互动条数，再 `fan.index`。`computeScores` 的最后一步才是 `localeCompare`。
- README 没写 `colorSort` 会盖过互动排序。布局规则那一节写了。

## 必选入图不是分数的一部分

`must_include` 不在 `lib/scoring.js` 里。它是 Bot 的放置约束，定义在 [`../SKILL.md`](../SKILL.md)。不要用提高分数的办法伪造双向互动。没有公开入站和出站证据，就不要把某人算进双向候选。角色马赛克里，解码成功的粉丝全部进入覆盖集；分数只影响谁占主体附近的保护格，不能用来把某人放到 0 次，也不能用来突破每人次数上限。
