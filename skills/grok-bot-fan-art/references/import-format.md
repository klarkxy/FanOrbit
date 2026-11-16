# 公开数据导入格式

扩展用这个文件把 Grok Bot 已经拿到的公开名单接进来。扩展不会连接 Grok Bot，也不会读取 token、cookie 或密码。文件里出现这类字段时，整份导入会被拒绝。

`format` 固定为 `fanorbit-public-v1`。

```json
{
  "format": "fanorbit-public-v1",
  "self": {
    "id": "1",
    "username": "example",
    "avatarUrl": "https://pbs.twimg.com/profile_images/example/face_normal.jpg"
  },
  "followers": [
    {
      "id": "2",
      "username": "fan",
      "avatarUrl": "https://pbs.twimg.com/profile_images/fan/face_normal.jpg",
      "index": 1
    }
  ],
  "missing": [
    { "id": "3", "username": "absent", "reason": "下载失败" }
  ],
  "events": [
    {
      "tweetId": "100",
      "author": "fan",
      "target": "example",
      "type": "reply",
      "createdAt": 1700000000000
    }
  ],
  "coverage": {
    "followersComplete": false,
    "interactionsComplete": false,
    "note": "分页没有结束"
  }
}
```

头像 URL 的主机名必须恰好是 `pbs.twimg.com` 或 `abs.twimg.com`。高清变体只尝试前者的档案图，失败再退回原 URL。默认头像留在 `abs.twimg.com`。相同图像的不同 `id` 仍是两个账号。

`followersComplete` 或 `interactionsComplete` 不是真，扩展就会把对应数据标成不完整，不会补成全量。
