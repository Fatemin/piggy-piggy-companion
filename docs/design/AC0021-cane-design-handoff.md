# AC0021 · 拐杖装饰 · design handoff

> 需求（用户原话）：（看着老年猪的拐杖）这个拐杖是什么装饰 → 把它加入装饰。
>
> 用户选择（2026-10-19）：解锁 = 长成老年猪；老年猪「跟着阶段」默认拄拐；已经自己搭配过的老年猪不迁移，更新后在衣柜里自己穿上（不改存档）。

## 资产归类（ART.ASSETS 要求每份 handoff 都写这一节）

| 资产 | 类别 | 部位 / 占用 | 来源 |
|---|---|---|---|
| `wear-cane` 拐杖 | 装饰 | hand（新部位，契约升 V3） | 原 `stage-elder` 姿势 `over` 里的拐杖与点地动画，图形和颜色不变 |
| `stage-elder` | 行为 | 不变（空） | 去掉拐杖，只留点头打盹 |
| 26 个身前有道具的姿势 | 行为 | 追加 `hand` | 见下「占用」 |

## 规则

| 项 | 决定 | 理由 |
|---|---|---|
| 部位 | 新部位 `hand`，最后画（最上层）；衣柜里排在「脸上」之后、「身上」之前 | 拐杖在前腿前面，不属于已有的头 / 眼 / 腰 / 脸 / 身上；原来就画在猪的上面 |
| 解锁 | `stage elder`，和白眉白胡子一样从进度推导、不存档 | 用户选择；老猪的进度直接生效 |
| 默认 | `STAGE_OUTFIT.elder = ['whiskers', 'cane']` | 用户选择：跟着阶段的老年猪更新后样子不变 |
| 已搭配的老年猪 | 不迁移，`outfit` 原样；更新后不拄拐 | 用户选择：不升存档版本；衣柜里点一下就回来 |
| 动画 | 拐杖放进穿戴槽，随姿势一起动；自己的点地动画（4 s 轻转 3°）保留 | 装饰都在猪本体分组里；原来拐杖在 `nod` 外面不跟着点头，差别很小 |
| 占用 | 身前有桌子、器材、手持物或前景小动物的姿势声明 `hand`：`away-gym`、`away-gym-weights`、`away-study`、`away-work`、`away-trip-antarctica`、`away-trip-oceania`、`away-trip-sydney`、`job-aitrainer`、`job-coach`、`job-influencer`、`job-label`、`job-odd`、`job-office`、`job-rider`、`job-site`、`job-sorting`、`job-stall`、`job-tea`、`job-vtuber`、`lottery-scratch`、`react-eat`、`react-graduate`、`study-college`、`study-doctor`、`study-graduate`、`study-primary` | 逐个把拐杖合成进全部 85 个姿势看过，这些会与道具叠画；其余（旅行、心情、反应）拄着拐很自然 |
| emoji | 🦯 | Unicode 里没有手杖专用字符，🦯 在各平台都画成一根拐杖 |

## 范围外

- macOS 原生 SwiftPM 悬浮猪（`desktop/`）不接衣柜，行为不变。
- 旧 `look` 接口仍只戴上 / 摘下白眉白胡子，不碰拐杖。
