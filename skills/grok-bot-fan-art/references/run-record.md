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
  "mustInclude": [{ "id": "0", "notFollower": false, "count": 1, "cells": [[0, 0]], "missingReason": null }],
  "mosaic": { "uniqueAvatars": 0, "cells": 0, "unusedNonMust": 0, "allFollowersIncluded": false },
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

`output` 取 `grid`、`fanorbit` 或 `photomosaic`。`interaction.label` 只在确实按 [scoring.md](scoring.md) 排了有分用户时写「互动排序」；没有数据时写「无互动排序」，并另写是否洗牌。`slices.platformLimit` 写当次查到的能力；没查到就写「未确认」，不要填一个记得的旧张数。
