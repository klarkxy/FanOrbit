# FanOrbit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: Chrome Extension](https://img.shields.io/badge/Platform-Manifest%20V3-purple)

将你的头像置于中心（2 / 3 / 4 倍于粉丝头像），粉丝按互动频率由内向外环绕，生成一张同心环「粉丝纪念头像墙」（JPG）。粉丝头像统一大小，无互动记录的粉丝随机散布外环。发到 X 时可以竖切成 3 到 19 的奇数条，正中间一条留住中心头像。

**数据来源全部公开**：粉丝列表来自你已登录浏览器的 followers 页；互动数据来自 fxtwitter / Yahoo! Japan 实时搜索 / Bing 三个免登录公开源，**不需要 X API 密钥**，互动扫描环节也无需登录。

---

**English**: FanOrbit places your own avatar at the center (2×, 3× or 4× a fan avatar) and orbits fans around it as concentric rings, ordered by interaction frequency from the innermost ring outward (optional rainbow color sort by avatar hue). Fan avatars share one size; fans without interaction data sit at random among the outer rings. An optional vertical split writes 3, 5, … or 19 JPEG strips for one X post (up to 20 images; 19 keeps the center avatar on the middle image), with every cut kept in the gap between avatars. Fan collection approach referenced from [qiujiu-dev/XAvatarWall](https://github.com/qiujiu-dev/XAvatarWall); interaction scoring scheme inspired by [acnekot/NekoCircle](https://github.com/acnekot/NekoCircle) (reimplemented, no code copied: NekoCircle is AGPL-3.0).

## 安装 Installation

1. Chrome / Edge：打开 `chrome://extensions`（或 `edge://extensions`）。
2. 开启右上角「开发者模式 / Developer mode」。
3. 「加载已解压的扩展程序 / Load unpacked」，选择本目录 `FanOrbit/`。

## 使用 Usage

1. 点击工具栏 FanOrbit 图标打开控制面板。
2. 输入 X 用户名（不带 `@`），选择数量上限、头像大小、背景色与扫描深度，并可勾选「颜色排序（彩虹环）」：开启后按头像主色的色相从红到紫环绕排布，形成彩虹色环（默认关闭时按互动频率排序）。
3. 布局形状可选「圆形（同心环）」或「方形（方环）」。粉丝头像统一大小，中心头像可选 2 / 3 / 4 倍。分图可选 3、5、…、19 条竖图（`FanOrbit-1.jpg` 起按顺序上传，拼回去仍是原图）。切割线留在头像之间的空隙里，正中间一条完整留住中心头像。X 单帖最多 20 张，19 是中心头像仍落在正中间时的最大条数；画面列宽不够时，实际条数取当前仍能放下头像的最大奇数。生成页顶部也可以直接切换这些选项。
4. 「开始制作」：
   - 阶段 1 — 扩展自动打开 `https://x.com/<用户名>/followers`，自动滚动采集粉丝列表（含断点续采）。
   - 阶段 2 — 后台同时从 Yahoo! 实时搜索与 fxtwitter 抓取公开推文互动（回复 / 引用 / 提及 / 转发），按用户名合并去重并评分。
   - 阶段 3 — 打开生成页，绘制头像墙并自动下载（分图模式下按条数依次下载 JPG，浏览器若询问请允许「下载多个文件」）。

## 布局规则 Layout rules

- 中心：你自己的头像（自动通过 fxtwitter 获取，获取失败时使用占位徽标），边长为粉丝头像的 2 / 3 / 4 倍；与第一环之间留有额外间距。
- 粉丝头像统一大小。内环 → 外环：互动分从高到低。
- 没有任何互动记录的粉丝：随机散布在外侧各环。
- 「颜色排序」开启时，所有头像按主色色相排序后依槽位衔接，形成跨环的彩虹渐变；灰度头像排到最外侧。
- 方形模式：粉丝头像为统一尺寸的圆角方块，沿正方形环逐圈向外扩展（角落槽位锚定在角上，间距均匀），中心按所选倍数占中。
- 分图：按所选奇数条数（3 到 19）规划竖直切割线，正中间一条完整包住中心头像，落在切割线上的槽位让出走廊。中心头像比一条均分更宽时，中间条变宽、两侧在剩余宽度里均分。画面列宽不够排开所请求的条数时，实际条数取仍能让每条放下一个头像的最大奇数。各条宽度可以不同，按顺序拼回仍是原图。

## 评分方法 Scoring

- 事件来源：Yahoo 实时搜索（`@name -from:name` 入站，`ID:name` 出站）、fxtwitter `/search?q=@name` 与 `/profile/name/statuses?with_replies=true`。
- 类型权重：reply 1.0、quote 0.8、mention 0.6、repost 0.4。
- 方向权重：入站（粉丝 → 你）1.5，出站（你 → 粉丝）0.5。
- 时间衰减：2 天内 1.0，5 天内 0.95，之后指数衰减（特征时间 15 天）。
- 双向平衡：`final = (in×1.5 + out×0.5) × (0.7 + 0.3 × balance)`。

## 注意事项 Caveats

- 三个互动数据源的可用性视网络环境而定，扫描节点后会自动降级并在状态栏报告：
  1. **fxtwitter**（全球可用，最稳）：近期回复 / 引用 / 转发 / 提及。
  2. **Yahoo! 实时搜索**：仅限日本出口 IP，约 30 天完整提及历史；无法访问时自动跳过。
  3. **Bing 网页搜索**：全球可用，但依赖搜索引擎对 x.com 的索引（近 7 天）；部分地区的必应会对结果做过滤，效果视环境而定。
- 没有 NekoCircle 那样的服务器代抓能力，所有抓取都在本机进行，因此出口 IP 决定可用源；无日本节点时仅有 fxtwitter + Bing 两源，覆盖范围稍窄，机制上依然完整可用。

- Yahoo! 实时搜索接口仅对日本 IP 开放。所在地无日本节点时该源不可用，扩展会自动回退到 fxtwitter 单源（覆盖范围略小），并在状态栏提示。
- 两个公开源都只覆盖近期（通常数周内）的可检索推文，更早的互动不计入评分——这正与「最近有互动者靠内、长期无互动者靠外」的预期一致。
- 粉丝采集需要浏览器已登录 X，且粉丝页保持打开状态直到采集完成。
- 请自行遵守 X 的服务条款与目标网站的使用政策。

## 项目结构

```
FanOrbit/
├── manifest.json      扩展清单（Manifest V3）
├── popup.html/css/js  控制面板
├── background.js      调度：采集 → 互动扫描 → 评分 → 打开生成页
├── collector.js       粉丝列表采集内容脚本
├── db.js              IndexedDB 头像缓存
├── downloader.js      头像下载（重试 + 缓存）
├── generator.html/js  头像墙绘制（圆形/方形、中心倍数、竖切分图）与 JPG 输出
├── lib/layout.js      分图条数、切割线与中心倍数
├── lib/scoring.js     互动评分
├── lib/interaction.js fxtwitter / Yahoo / Bing 公开数据采集
├── lib/util.js        共享工具函数
├── assets/            图标
└── skills/grok-bot-fan-art/  Grok Bot 专用技能（不参与扩展运行）
```

## Grok Bot 技能

[`skills/grok-bot-fan-art/SKILL.md`](skills/grok-bot-fan-art/SKILL.md) 给已经接上 X 连接的 Grok Bot 用：收集公开粉丝头像，按本仓库的评分公式排序，并做成网格墙、FanOrbit 环或角色马赛克。切图条数由 Bot 按当次需求和当时的平台限制决定。它不改变浏览器扩展的行为，也不表示只有 Grok Bot 能使用 X API。

## 许可证 License

本项目以 [MIT License](LICENSE) 开源。欢迎自由使用、修改与分发（含商用）；请保留版权声明。
