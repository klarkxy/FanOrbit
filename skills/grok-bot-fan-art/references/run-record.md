# 运行记录

每次生成在本地写一份 JSON。它只给当次交付和断点续用，**不要提交到 GitHub**，也不要把粉丝清单、关系或头像打进仓库。下面是字段形状，示例值都是占位，不是某一次真实运行。

```json
{
  "skill": "grok-bot-fan-art",
  "output": "fanorbit",
  "shape": "circle",
  "selfScale": 3,
  "fetchedAt": "1970-01-01T00:00:00Z",
  "meId": "0",
  "publicFollowerCount": null,
  "uniqueFollowerIds": 0,
  "paginationExhausted": false,
  "stoppedReason": "next_token exhausted | quota | error",
  "downloadFailures": [{ "id": "0", "reason": "decode failed" }],
  "interaction": {
    "used": false,
    "label": "无互动排序",
    "windowStart": null,
    "windowEnd": null,
    "method": "",
    "paginationExhausted": false,
    "truncated": [],
    "missingCreatedAt": 0,
    "scoring": "computeScores | formula-replay",
    "now": null,
    "sourceNote": "官方 X 公开事件，公式与 lib/scoring.js 相同，数据不同于扩展的 fxtwitter/Yahoo/Bing"
  },
  "mustInclude": [{ "id": "0", "notFollower": false, "protected": true, "count": 1, "cells": [[0, 0]], "missingReason": null }],
  "mosaic": {
    "gridCells": 0,
    "avatarCells": 0,
    "uniqueAccounts": 0,
    "uniqueImages": 0,
    "repeatCells": 0,
    "repeatRatio": 0,
    "sameImageAccountRatio": 0,
    "maxPerAccount": 0,
    "maxPerAccountCap": 2,
    "capChangedByUser": false,
    "unusedAccounts": 0,
    "perIdCountOk": false,
    "namedExtrasOk": false,
    "duplicateAdjacency": 0,
    "missingCount": 0,
    "downloadFailures": 0,
    "colorTradeoff": ""
  },
  "slices": {
    "kind": "planCuts | bot-postprocess | none",
    "count": 0,
    "widths": [],
    "reason": "",
    "platformLimit": "未确认",
    "minAvatarClearancePx": null,
    "centerContained": null,
    "reassembly": "ok",
    "master": "lossless-local",
    "jpegPixelIdentity": false
  }
}
```

CSV 清单至少有这些列：`id`，`username`，`profile_image_url`，`file`，`fetched_at`，`http_status`，`decoded`，`is_default_avatar`，`not_follower`。`decoded` 为假的行保留。`is_default_avatar` 为真且解码成功的行仍是粉丝。

`output` 取 `grid`、`fanorbit` 或 `photomosaic`。`interaction.label` 只在确实按 [scoring.md](scoring.md) 排了有分用户时写「互动排序」；没有数据时写「无互动排序」，并另写是否洗牌。`slices.platformLimit` 写当次查到的能力；没查到就写「未确认」，不要填一个记得的旧张数。切图条数仍按当次需求和平台现况决定，不要把某一固定条数写进 `slices.count` 以外的默认值。

角色马赛克的 `mosaic` 按 [`../SKILL.md`](../SKILL.md) 的硬约定填写。`gridCells` 含留白，`avatarCells` 只数放了头像的格。`uniqueAccounts` 是解码成功的粉丝与额外点名者按数字 id 去重后的人数，不要用 `gridCells` 或 `avatarCells` 代替。`uniqueImages` 按图像内容计，同一张图的多个账号仍各自计入 `uniqueAccounts`。`sameImageAccountRatio` 含默认头像。`repeatCells` 是第二次出现所占的格数，`repeatRatio = repeatCells / avatarCells`（分母为 0 时写 0）。`maxPerAccountCap` 默认 2；只有用户明确改过才把 `capChangedByUser` 设为真。`unusedAccounts` 必须为 0，`perIdCountOk` 表示每个覆盖 id 的次数都在 1 和上限之间。`namedExtrasOk` 表示每个已取得头像的额外点名者次数不少于 1。`missingCount` 与 `downloadFailures` 是没有进入覆盖集的人数和下载失败数，原因留在本地清单里，不要因为他们没进图就把 `perIdCountOk` 写成全体粉丝已入图。`colorTradeoff` 用一句话说明颜色还原和头像识别度的取舍。缺失 id 列表只留在本地，不提交到 GitHub。
