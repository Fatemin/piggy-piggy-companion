// [dsh-piggy-claude-code mod] Translations for index: keys are the Chinese source strings.
// See i18n.js and locales/GLOSSARY.md.
//
// The snapshot's own words (age, durations) and the slash command's replies
// that do not go through render.js. Data labels live in locales/data.js.
// {name} is the pig's name and is never translated; {cmd} is the command name.
export default {
  ja: {
    // --- age and durations --------------------------------------------------
    '还没拆开': 'まだ箱の中',
    '活了 {span}': '{span}生きた',
    '今天刚出生': 'きょう生まれた',
    '1 天大': '生まれて1日',
    '{days} 天大': '生まれて{days}日',
    '{n} 分钟': '{n}分',
    '{n} 小时': '{n}時間',
    '{n} 天': '{n}日',
    // --- host ---------------------------------------------------------------
    '[dsh-pig] 路由注册失败，猪只能用命令访问': '[dsh-pig] ルートを登録できませんでした。コマンドからだけ使えます',
    '[hatch|feed|bathe|play|pet|sleep|wake|study <科目>|work <job>|trip <目的地>|shop|buy|use|weigh|wear [装饰]|lang <zh|ja|en>|about]':
      '[hatch|feed|bathe|play|pet|sleep|wake|study <科目>|work <バイト>|trip <行き先>|shop|buy|use|weigh|wear [アイテム]|lang <zh|ja|en>|about]',
    // [ST0004] /pig wear
    '👗 跟着阶段穿了': '👗 成長に合わせて着るようにした',
    '👗 全脱了，光溜溜的': '👗 ぜんぶぬいだ。すっぽんぽん',
    '衣柜里没有「{name}」。/{cmd} wear 看看有什么。': 'クローゼットに「{name}」はないよ。/{cmd} wear で見てみて。',
    '🔒 {item}还没解锁：{hint}': '🔒 {item}はまだ使えない：{hint}',
    '👗 戴上了{item}': '👗 {item}を身につけた',
    '👗 摘下了{item}': '👗 {item}をはずした',
    '😴 {name} 去睡觉了。睡着时只会变饿，心情和清洁会慢慢恢复。': '😴 {name}はおやすみ中。ねている間はおなかがへるだけで、きげんときれいさは少しずつもどります。',
    '☀️ {name} 醒了。': '☀️ {name}がおきた。',
    '{name} 已经在睡了。': '{name}はもうねています。',
    '{name} 本来就醒着。': '{name}はもうおきています。',
    '🐖 猪摔了一跤：{error}': '🐖 ブタがころんじゃった：{error}',
    '猪': 'この子',
    // --- care ---------------------------------------------------------------
    '{name} 正在外面，回来再说。': '{name}はおでかけ中。帰ってきてからにしてね。',
    '{name} 已经走了…用 {item} 可以救回来。': '{name}はもういない…{item}で生きかえらせられます。',
    '🐖 {action} 没做成。': '🐖 {action}できなかった。',
    '这里已经住着 {name} 了 🐖': 'ここにはもう{name}が住んでいるよ 🐖',
    // --- going out ----------------------------------------------------------
    '没有「{key}」这份工作。/{cmd} work 看有哪些。': '「{key}」というバイトはないよ。/{cmd} work で確認してね。',
    '用法：/{cmd} study <科目>[,科目…] <{stages}>\n科目：{subjects}\n一次最多：{limits}\n每门课上限：{caps}（其余不限）': '使い方：/{cmd} study <科目>[,科目…] <{stages}>\n科目：{subjects}\nいちどに受けられる数：{limits}\n1科目の上限：{caps}（ほかは無制限）',
    '没有「{key}」这个目的地。/{cmd} trip 看有哪些。': '「{key}」という行き先はないよ。/{cmd} trip で確認してね。',
    '{name} 没在外面。': '{name}はおでかけしていないよ。',
    '{name} 提前回来了，退回 {coins} 猪币。': '{name}が早めに帰ってきた。{coins} ブーコインもどってきた。',
    '{name} 提前回来了，这趟白跑。': '{name}が早めに帰ってきた。むだ足だった。',
    // --- shop and bag -------------------------------------------------------
    '{price} 猪币': '{price} ブーコイン',
    '🛒 商店（你有 {coins} 猪币）\n{lines}\n\n买：/{cmd} buy <物品>': '🛒 おみせ（{coins} ブーコイン持っています）\n{lines}\n\n買う：/{cmd} buy <アイテム>',
    '没有「{name}」这样东西。/{cmd} shop 看货架。': '「{name}」というものはないよ。/{cmd} shop で売り場を見てね。',
    '没有「{name}」这样东西。': '「{name}」というものはないよ。',
    // --- look and name ------------------------------------------------------
    '用法：/{cmd} look 老年 | 原版': '使い方：/{cmd} look おじいブタ | オリジナル',
    '要长到 80 kg、变成老年猪之后才能换样子': '80 kg になっておじいブタになってから、見た目を変えられるよ',
    '现在换不了样子': '今は見た目を変えられない',
    '🐖 换回原版小猪的样子了': '🐖 オリジナルのこブタの姿にもどした',
    '🐖 换成老年猪的样子了': '🐖 おじいブタの姿にした',
    '用法：/{cmd} name <名字>（16 字以内）': '使い方：/{cmd} name <名前>（16文字まで）',
    '从今天起，它叫「{name}」🐖': '今日から「{name}」という名前だよ 🐖',
    '不认识「{sub}」。可用：/{cmd} · {list}': '「{sub}」はわからないよ。使えるもの：/{cmd} · {list}',
    // --- refusals -----------------------------------------------------------
    '{name} 已经走了…': '{name}はもういない…',
    '{name} 已经在外面了。': '{name}はもうおでかけ中。',
    '{name} 病着，不能出门 —— 先治好它。': '{name}はびょうきで出かけられない。先に治してあげてね。',
    '{name} 太饿了，先喂点东西。': '{name}はおなかぺこぺこ。先にごはんをあげてね。',
    '钱不够，需要 {price} 猪币，你只有 {coins}。': 'ブーコインが足りない。{price} ブーコイン必要だけど、{coins} しかない。',
    '没有这个选项。': 'そのメニューはないよ。',
    '这份工作要求：{list}。': 'このしごとには {list} が必要だよ。',
    '{trait} {need}（现在 {have}）': '{trait} {need}（いま {have}）',
    '现在没法出门。': '今は出かけられない。',
    '{name} 身体太虚了，先把病治好、养养身体。': '{name}は体が弱りすぎ。先に病気を治して、休ませてあげてね。',
    '{stage}一次最多上 {max} 门课。': '{stage}はいちどに {max} 科目までだよ。',
    '{stage}每门课最多上 {max} 次，{subjects}已经上满了。': '{stage}は1科目 {max} 回まで。{subjects}はもう受けきったよ。',
    '{stage}还没解锁。': '{stage}はまだ解放されていないよ。',
    '{stage}还没解锁：要先「{label}」（{done}/{need}）。': '{stage}はまだ解放されていないよ：先に「{label}」（{done}/{need}）。',
    // --- world map (snapshot) -----------------------------------------------
    '⚖️体重 +{kg} kg': '⚖️体重 +{kg} kg',
    // --- shop shelves -------------------------------------------------------
    '【{shelf}】': '【{shelf}】',
    '    改名用：/{cmd} name <名字>（第一次起名免费）': '    名前を変えるとき用：/{cmd} name <名前>（さいしょの名づけは無料）',
    '    买了就穿上，衣柜里随时换：/{cmd} wear': '    買ったらすぐ身につける。クローゼットでいつでも着がえ：/{cmd} wear',
    '已拥有': '持ってる',
    // --- naming -------------------------------------------------------------
    '第一次起名免费；以后再改名要用一张{card}（商店 {price} 猪币）。': 'さいしょの名づけは無料。次から名前を変えるには{card}が1枚いるよ（おみせで {price} ブーコイン）。',
    '🪪 用掉了一张{card}，还剩 {left} 张。': '🪪 {card}を1枚使った。のこり {left} 枚。',
    '🪪 {name} 已经有名字了，再改名要用一张{card}（{price} 猪币，商店「{shelf}」货架上有）。\n买：/{cmd} buy {key}，然后再 /{cmd} name <新名字>': '🪪 {name}にはもう名前があるよ。変えるには{card}が1枚いるよ（{price} ブーコイン、おみせの「{shelf}」の棚にあるよ）。\n買う：/{cmd} buy {key}、それから /{cmd} name <新しい名前>',
    '它本来就叫「{name}」呀，没改。': 'もともと「{name}」だよ。変わってないよ。',
  },
  en: {
    // --- age and durations --------------------------------------------------
    '还没拆开': 'still in the box',
    '活了 {span}': 'Lived {span}',
    '今天刚出生': 'born today',
    '1 天大': '1 day old',
    '{days} 天大': '{days} days old',
    '{n} 分钟': '{n} min',
    '{n} 小时': '{n} h',
    '{n} 天': '{n} days',
    // --- host ---------------------------------------------------------------
    '[dsh-pig] 路由注册失败，猪只能用命令访问': '[dsh-pig] Could not register the routes; the pig is command-only',
    '[hatch|feed|bathe|play|pet|sleep|wake|study <科目>|work <job>|trip <目的地>|shop|buy|use|weigh|wear [装饰]|lang <zh|ja|en>|about]':
      '[hatch|feed|bathe|play|pet|sleep|wake|study <subject>|work <job>|trip <place>|shop|buy|use|weigh|wear [item]|lang <zh|ja|en>|about]',
    // [ST0004] /pig wear
    '👗 跟着阶段穿了': '👗 Dressed to match its stage again',
    '👗 全脱了，光溜溜的': '👗 Took everything off',
    '衣柜里没有「{name}」。/{cmd} wear 看看有什么。': 'There is no "{name}" in the wardrobe. /{cmd} wear shows what there is.',
    '🔒 {item}还没解锁：{hint}': '🔒 {item} is locked: {hint}',
    '👗 戴上了{item}': '👗 Put on the {item}',
    '👗 摘下了{item}': '👗 Took off the {item}',
    '😴 {name} 去睡觉了。睡着时只会变饿，心情和清洁会慢慢恢复。': '😴 {name} went to bed. Asleep it only gets hungrier; mood and cleanliness slowly come back.',
    '☀️ {name} 醒了。': '☀️ {name} is awake.',
    '{name} 已经在睡了。': '{name} is already asleep.',
    '{name} 本来就醒着。': '{name} is already awake.',
    '🐖 猪摔了一跤：{error}': '🐖 The pig tripped: {error}',
    '猪': 'Your pig',
    // --- care ---------------------------------------------------------------
    '{name} 正在外面，回来再说。': "{name} is out. Try again when it's back.",
    '{name} 已经走了…用 {item} 可以救回来。': '{name} is gone… A {item} can bring it back.',
    '🐖 {action} 没做成。': "🐖 {action} didn't work.",
    '这里已经住着 {name} 了 🐖': '{name} already lives here 🐖',
    // --- going out ----------------------------------------------------------
    '没有「{key}」这份工作。/{cmd} work 看有哪些。': 'No job called "{key}". See /{cmd} work.',
    '用法：/{cmd} study <科目>[,科目…] <{stages}>\n科目：{subjects}\n一次最多：{limits}\n每门课上限：{caps}（其余不限）': 'Usage: /{cmd} study <subject>[,subject…] <{stages}>\nSubjects: {subjects}\nMost at once: {limits}\nLessons per subject: {caps} (no limit elsewhere)',
    '没有「{key}」这个目的地。/{cmd} trip 看有哪些。': 'No place called "{key}". See /{cmd} trip.',
    '{name} 没在外面。': "{name} isn't out.",
    '{name} 提前回来了，退回 {coins} 猪币。': '{name} came back early; {coins} oinks refunded.',
    '{name} 提前回来了，这趟白跑。': '{name} came back early, all for nothing.',
    // --- shop and bag -------------------------------------------------------
    '{price} 猪币': '{price} oinks',
    '🛒 商店（你有 {coins} 猪币）\n{lines}\n\n买：/{cmd} buy <物品>': '🛒 Shop (you have {coins} oinks)\n{lines}\n\nBuy: /{cmd} buy <item>',
    '没有「{name}」这样东西。/{cmd} shop 看货架。': 'No such thing as "{name}". See /{cmd} shop.',
    '没有「{name}」这样东西。': 'No such thing as "{name}".',
    // --- look and name ------------------------------------------------------
    '用法：/{cmd} look 老年 | 原版': 'Usage: /{cmd} look elder | original',
    '要长到 80 kg、变成老年猪之后才能换样子': 'It can change its look once it reaches 80 kg and becomes an Elder pig',
    '现在换不了样子': "Can't change its look right now",
    '🐖 换回原版小猪的样子了': '🐖 Back to the Original piglet look',
    '🐖 换成老年猪的样子了': '🐖 Switched to the Elder pig look',
    '用法：/{cmd} name <名字>（16 字以内）': 'Usage: /{cmd} name <name> (up to 16 characters)',
    '从今天起，它叫「{name}」🐖': 'From today it is called "{name}" 🐖',
    '不认识「{sub}」。可用：/{cmd} · {list}': 'Unknown command "{sub}". Try: /{cmd} · {list}',
    // --- refusals -----------------------------------------------------------
    '{name} 已经走了…': '{name} is gone…',
    '{name} 已经在外面了。': '{name} is already out.',
    '{name} 病着，不能出门 —— 先治好它。': "{name} is sick and can't go out — cure it first.",
    '{name} 太饿了，先喂点东西。': '{name} is too hungry. Feed it first.',
    '钱不够，需要 {price} 猪币，你只有 {coins}。': 'Not enough oinks: it costs {price}, you have {coins}.',
    '没有这个选项。': 'No such option.',
    '这份工作要求：{list}。': 'This job needs {list}.',
    '{trait} {need}（现在 {have}）': '{trait} {need} (now {have})',
    '现在没法出门。': "Can't go out right now.",
    '{name} 身体太虚了，先把病治好、养养身体。': '{name} is too weak. Cure it and let it rest first.',
    '{stage}一次最多上 {max} 门课。': '{stage}: at most {max} subjects at once.',
    '{stage}每门课最多上 {max} 次，{subjects}已经上满了。': '{stage} allows {max} lessons per subject; {subjects} already used them up.',
    '{stage}还没解锁。': "{stage} isn't unlocked yet.",
    '{stage}还没解锁：要先「{label}」（{done}/{need}）。': "{stage} isn't unlocked yet: first {label} ({done}/{need}).",
    // --- world map (snapshot) -----------------------------------------------
    '⚖️体重 +{kg} kg': '⚖️Weight +{kg} kg',
    // --- shop shelves -------------------------------------------------------
    '【{shelf}】': '[{shelf}]',
    '    改名用：/{cmd} name <名字>（第一次起名免费）': '    For renaming: /{cmd} name <name> (the first name is free)',
    '    买了就穿上，衣柜里随时换：/{cmd} wear': '    Worn as soon as it is bought; change in the wardrobe: /{cmd} wear',
    '已拥有': 'owned',
    // --- naming -------------------------------------------------------------
    '第一次起名免费；以后再改名要用一张{card}（商店 {price} 猪币）。': 'The first name is free; after that each rename takes a {card} ({price} oinks in the shop).',
    '🪪 用掉了一张{card}，还剩 {left} 张。': '🪪 Used one {card}; {left} left.',
    '🪪 {name} 已经有名字了，再改名要用一张{card}（{price} 猪币，商店「{shelf}」货架上有）。\n买：/{cmd} buy {key}，然后再 /{cmd} name <新名字>': '🪪 {name} already has a name. Renaming takes a {card} ({price} oinks, on the "{shelf}" shelf in the shop).\nBuy: /{cmd} buy {key}, then /{cmd} name <new name>',
    '它本来就叫「{name}」呀，没改。': "It's already called \"{name}\" — nothing changed.",
  },
}
