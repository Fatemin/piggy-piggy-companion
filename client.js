/**
 * dsh-pig · client — the floating pig. 🐖
 *
 * Hand-written browser bundle: DSH loads it through `window.__ModuleLoader__`,
 * so no bundler is involved. Raw DOM and `fetch` only — no React, no imports.
 *
 * Layout follows the original QQ 宠物: the pet sits at the top, and a cream icon
 * bar sits directly beneath it. Six icons — 状态 · 学习 · 打工 · 商店 · 旅行 ·
 * 背包 — switch what the area below the bar shows, so nothing ever needs typing.
 *
 * Every value the host sends goes through `normalize()` first. A host/client
 * version mismatch must degrade to sane defaults and an explanation, never to a
 * screen full of `undefined`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-piggy',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var STATE_URL = '/dsh-pig/state'
    // Hand-drawn stages are served from the plugin's own /art route.
    var ART_URL = '/dsh-pig/art/'
    // Poses drawn on top of the stage's body. A mood without one (fine) keeps
    // the stage drawing; each file animates itself.
    var MOOD_ART = {
      sick: 'mood-sick', hungry: 'mood-hungry', dirty: 'mood-dirty', sleepy: 'mood-sleepy', asleep: 'mood-asleep',
      happy: 'mood-happy', lonely: 'mood-lonely',
      working: 'away-work', studying: 'away-study', traveling: 'away-trip',
      // [Q0016] at the gym
      exercising: 'away-gym',
    }
    var LEVELED_MOODS = { sick: true, hungry: true, dirty: true, lonely: true }
    // Being away at a particular school stage or in a particular region has its own pose.
    var STUDY_ART = { primary: 'study-primary', college: 'study-college', graduate: 'study-graduate', doctor: 'study-doctor' }
    var TRIP_ART = {
      china: 'away-trip-china', eastasia: 'away-trip-eastasia', southasia: 'away-trip-southasia', europe: 'away-trip-europe',
      americas: 'away-trip-americas', mideast: 'away-trip-mideast', oceania: 'away-trip-oceania',
    }
    // [ST0011] ...and every destination has its own, ahead of its region's.
    var PLACE_ART = {
      beijing: 'away-trip-beijing', chengdu: 'away-trip-chengdu', xian: 'away-trip-xian', shanghai: 'away-trip-shanghai',
      tokyo: 'away-trip-tokyo', seoul: 'away-trip-seoul', ulaanbaatar: 'away-trip-ulaanbaatar',
      bangkok: 'away-trip-bangkok', singapore: 'away-trip-singapore', newdelhi: 'away-trip-newdelhi',
      paris: 'away-trip-paris', rome: 'away-trip-rome', london: 'away-trip-london',
      newyork: 'away-trip-newyork', mexicocity: 'away-trip-mexicocity', rio: 'away-trip-rio',
      dubai: 'away-trip-dubai', cairo: 'away-trip-cairo', nairobi: 'away-trip-nairobi',
      sydney: 'away-trip-sydney', auckland: 'away-trip-auckland', antarctica: 'away-trip-antarctica',
    }
    // [ST0022] ...and every gym class (data.js GYM_CLASSES); the treadmill is the generic gym.
    var GYM_ART = { treadmill: 'away-gym', weights: 'away-gym-weights', trainer: 'away-gym-trainer' }
    // [ST0004] What the pig wears goes on every pose's URL (`?wear=bow,glasses`);
    // the art route pours those decorations into the pose (ART.ASSETS.V3).
    // One-shot poses for the care buttons and verdicts.
    var REACT_ART = {
      feed: 'react-eat', bathe: 'react-bathe', play: 'react-play', pet: 'react-pet',
      refuse: 'react-refuse', cure: 'react-cure', graduate: 'react-graduate',
      // The scratch card: scratching, then one of three verdicts.
      scratch: 'lottery-scratch', jackpot: 'lottery-jackpot', win: 'lottery-win', lose: 'lottery-lose',
    }
    var ACT_URL = '/dsh-pig/act'
    // [ST0007] the desktop app's updater; other hosts answer 404 and the panel
    // shows nothing about updates.
    var UPDATE_URL = '/pig/update'
    var UPDATE_STATUSES = ['idle', 'checking', 'latest', 'available', 'downloading', 'installing']
    // [ST0014] the cloud login of the pig server; hosts without one answer 404.
    var CLOUD_URL = '/pig/cloud'
    var CLOUD_PHASES = ['signed-out', 'code-sent', 'linking', 'choose', 'idle', 'syncing', 'offline', 'error']
    var POLL_MS = 4000
    var MOUNTED = 'data-dsh-pig'
    var OPEN_KEY = 'dsh-pig:open'
    var POSITION_KEY = 'dsh-pig:position'
    var devMode = false
    // Must match `.dp-card{width}` — used to keep the panel inside the window.
    var PANEL_WIDTH = 292
    var PANEL_GAP = 8
    var PANEL_MARGIN = 10
    var PANEL_MIN_HEIGHT = 120
    // Must match `--scene-open` in the CSS (a test keeps them honest). The pig
    // is clamped against this rather than its collapsed height, so opening the
    // panel can never shove the hud off the top of the window.
    var SCENE_RESERVE = 132
    // Must match `.dp-scene{padding-inline}`. The pig's on-screen footprint is
    // the glyph plus this padding; clamping by the glyph alone leaves it a few
    // pixels over the edge.
    var PIG_PADDING_X = 6
    // [dsh-piggy-claude-code mod] the floating panel can be resized from its
    // top-left corner and its top/left edges. The size the user chose; the
    // default width (PANEL_WIDTH) is also the smallest one.
    var CARD_SIZE_KEY = 'dsh-pig:cardSize'
    var CARD_MIN_HEIGHT = 360
    // [dsh-piggy-claude-code mod] the big panel (`ctx.layout === 'split'`):
    // which skin, whether the spreadsheet shows the pig as a picture, and how
    // quickly two Escapes must follow each other to count as the boss key.
    var SKIN_KEY = 'dsh-pig:skin'
    var PIC_KEY = 'dsh-pig:xlPic'
    var BOSS_ESC_MS = 600
    var XL_TITLE = '季度预算.xlsx - Excel'
    var XL_RIBBON = ['文件', '开始', '插入', '页面布局', '公式', '数据', '审阅', '视图']
    var XL_COLUMNS = 'ABCDEFGHIJKLMNOPQRST'
    var XL_ROWS = 300

    var TABS = [
      { key: 'status', label: '状态', emoji: '📋' },
      // [ST0014] login, the pig pen and which pen mates show; only on hosts
      // that run the cloud sync (see visibleTabs).
      { key: 'online', label: '在线', emoji: '🌐' },
      { key: 'study', label: '学习', emoji: '📚' },
      { key: 'work', label: '打工', emoji: '💼' },
      { key: 'shop', label: '商店', emoji: '🛒' },
      { key: 'travel', label: '旅行', emoji: '🧳' },
      { key: 'bag', label: '背包', emoji: '🎒' },
    ]

    /** Developer mode: off unless asked for, and remembered across reloads. */
    var DEV_KEY = 'dsh-pig:dev'
    var DEV_TAB = { key: 'dev', label: '调试', emoji: '🔧' }

    // -------------------------------------------------------------------
    // [dsh-piggy-claude-code mod] Chinese · Japanese · English.
    //
    // Same idea as the host's i18n.js, which this bundle cannot import:
    // gettext style, the Chinese text in the code IS the key, a missing key
    // falls back to Chinese, and `{name}` placeholders are filled from params
    // so word order can differ per language. Terms follow locales/GLOSSARY.md.
    // Only text the client itself owns goes through here; every label the host
    // sends (items, jobs, stages, illnesses, announcements…) arrives already
    // translated and must not be translated twice.
    // -------------------------------------------------------------------
    var LANG_KEYS = ['zh', 'ja', 'en']
    var LANG_NAMES = { zh: '中文', ja: '日本語', en: 'English' }
    var I18N = {
      ja: {
        // tabs
        '状态': 'ようす', '学习': '勉強', '打工': 'バイト', '商店': 'おみせ',
        '旅行': '旅行', '背包': 'バッグ', '调试': 'デバッグ',
        // care
        '喂食': 'ごはん', '洗澡': 'おふろ', '玩耍': 'あそぶ', '摸摸': 'なでなで',
        // the box
        '里面好像有东西…': 'なにか入ってるみたい…',
        '动了！再戳一下！': 'うごいた！もう一回つついて！',
        '戳三下': '3回つついて', '哇——！': 'わあ——！',
        '一个{box}': '{box}がひとつ',
        '点开拆开它': 'つついてあけよう',
        '门口放着一个纸盒，里面窸窸窣窣 📦': '玄関にダンボール箱がひとつ。中でごそごそ音がする 📦',
        '拆开纸盒': '箱をあける',
        '拆开就会蹦出一只小猪 —— 不用敲命令': 'あけるとこブタが飛び出すよ —— コマンドはいらないよ',
        // empty shelves
        '没有吃的啦，快去买一点 🍎': 'たべものがないよ、買いに行こう 🍎',
        '没有洗浴用品了，去买点吧 🧼': 'おふろ用品がないよ、買いに行こう 🧼',
        '没有玩具了，去商店看看 🪀': 'おもちゃがないよ、おみせを見てみて 🪀',
        // shop shelves and item kinds
        '食物': 'たべもの', '洗浴': 'おふろ用品', '玩具': 'おもちゃ', '药品': 'くすり', '复活': 'よみがえり',
        '对症！': 'これが効く！', '药': 'くすり', '复活用': 'よみがえり用',
        // school
        '小学': '小学校', '大学': '大学', '研究生': '大学院',
        // fallbacks for fields an older host did not send
        '猪猪': 'ブーちゃん', '小猪': 'こブタ', '还不错': 'まあまあ', '生病': 'びょうき',
        '工作': 'しごと', '课': 'じゅぎょう', '学段': '学校', '目的地': '行き先',
        '物品': 'アイテム', '外面': 'おでかけ先', '纸盒': 'ダンボール箱',
        // the pig itself
        '左键摸摸 · 右键打开面板 · 拖动可移动': '左クリックでなでなで · 右クリックでパネル · ドラッグで移動',
        '孵出来啦！': '出てきた！', '吃掉了！': 'たべた！', '洗干净啦～': 'きれいになった～',
        '好开心！': 'たのしい！', '好舒服…': 'きもちいい…', '出门打工！': 'バイトに行ってくる！',
        '上学去！': '学校に行ってくる！', '出发旅行！': '旅行に出発！', '提前回来了…': '早めに帰ってきた…',
        '买到了！': '買えた！', '用掉了。': '使った。', '我长大啦！': '大きくなったよ！',
        '在忙': 'はたらき中', '在念书': '勉強中', '在路上': '旅行中', '在外面': 'おでかけ中',
        '{what}：{label}': '{what}：{label}',
        // status tab
        '饱食': 'おなか', '心情': 'きげん', '清洁': 'きれいさ', '健康': '健康',
        '智力': 'かしこさ', '魅力': 'みりょく', '武力': 'ちから', '体重': '体重', '年龄': '年齢',
        '再长 {kg} kg 就长成下一阶段了': 'あと {kg} kg で次の姿に育つよ',
        // [ST0004] the wardrobe
        '衣柜': 'クローゼット', '跟着阶段': '成長に合わせる', '还没解锁：{hint}': 'まだ使えない：{hint}', '什么也没穿': 'なにも着ていない',
        '头上': 'あたま', '眼睛': 'め', '腰上': 'こし', '脸上': 'かお',
        '不在家': 'おでかけ中', '{n}s': '{n}秒', '语言': '言語',
        // care item picker
        '喂点什么？': 'なにを食べさせる？', '用哪个洗澡？': 'どれでおふろにする？',
        '拿哪个玩具？': 'どのおもちゃにする？', '用哪个？': 'どれを使う？',
        '{label}（自带）': '{label}（いつでもある）', '用': '使う', '算了': 'やめる',
        // study tab
        '宿主还没提供课程表。': 'ホストからまだ時間割が届いていないよ。',
        '{time} · 学费 {tuition} 🪙 · 属性 +{gain}': '{time} · 授業料 {tuition} 🪙 · 能力 +{gain}',
        '要先念完{label}（{done}/{need}）': '先に{label}を卒業してね（{done}/{need}）',
        '已上 {n} 次': 'じゅぎょう {n} 回',
        // work tab
        '宿主还没提供工作列表。': 'ホストからまだバイトのリストが届いていないよ。',
        '赚 {coins} 🪙': '{coins} 🪙 もらえる', '省 {pct}% 时间': '時間 {pct}% 短縮',
        '报酬 +{pct}%': '報酬 +{pct}%', '去上课就能涨': 'じゅぎょうで上がるよ', '出发': '出発',
        // shop tab
        '宿主还没提供货架。': 'ホストからまだ商品が届いていないよ。',
        '现在需要': 'いま必要', '买': '買う',
        // travel and bag tabs
        '宿主还没提供目的地。': 'ホストからまだ行き先が届いていないよ。',
        '纪念品': 'おみやげ', '还没出过远门。': 'まだ遠くへ行ったことがないよ。',
        '背包空空的 —— 去「商店」买点东西。': 'バッグはからっぽ —— 「おみせ」でなにか買おう。',
        '使用': '使う', '收藏册还空着。': 'コレクションはまだからっぽ。',
        // durations
        '{n} 天': '{n}日', '{n} 小时': '{n}時間', '{n} 分钟': '{n}分',
        // banners
        '宿主是旧版本': 'ホストが古いバージョンです',
        '猪币、健康、打工、商店这些是新增的，重启 dsh（不是刷新页面）之后才会出现。':
          'ブーコイン・健康・バイト・おみせは新しい機能です。dsh を再起動すると出てきます（ページの再読み込みではなく）。',
        '{name} 走了': '{name} はいってしまった',
        '{name} 走了，灵魂还留在墓碑上 👻': '{name} はいってしまった。たましいがまだおはかにいるよ 👻',
        '用还魂丹可以把它叫回来，或者领养一只新的小猪': 'よみがえりの薬で呼びもどせるよ。新しい子をむかえることもできるよ',
        '在「背包」里用还魂丹就能救回来（猪币、收藏、上过的课都保留）':
          '「バッグ」でよみがえりの薬を使えば助かるよ（ブーコイン・コレクション・じゅぎょうはそのまま）',
        '领养新猪': '新しい子をむかえる',
        '{name}（第 {stage}/4 期）': '{name}（{stage}/4 期）',
        '需要「{cure}」—— 去商店买对应的药': '「{cure}」が必要 —— おみせで病気に合ったくすりを買おう',
        '带病也能出门，但报酬只有一半；在外面病情会走得更快，躺着养最省':
          'びょうきでもおでかけできるけど報酬は半分。外ではびょうきが早く進むから、休むのがいちばん',
        '钱不够也没关系 —— 先去打工，赚够 {price} 🪙 买「{item}」':
          'お金が足りなくても大丈夫 —— バイトで {price} 🪙 かせいで「{item}」を買おう',
        '在外面：{label}': 'おでかけ中：{label}', '还有 {n} 秒': 'あと {n} 秒', '叫它回来': '呼びもどす',
        // messages
        '猪有新消息': 'ブタからお知らせ', '连接不上宿主': 'ホストにつながらない',
        '背包里没有能用的东西': 'バッグに使えるものがないよ',
        '还要等 {n} 秒': 'あと {n} 秒まってね', '钱不够': 'お金が足りない', '它在外面': 'おでかけ中だよ',
        '太虚弱了，先养好再出门': '弱ってるよ。元気になってからおでかけしよう', '太饿了': 'おなかぺこぺこ',
        '药不对症': 'くすりが合ってない', '背包里没有': 'バッグにないよ', '它没生病': 'びょうきじゃないよ',
        '它已经走了…': 'もういってしまった…', '它没在外面': 'おでかけしてないよ',
        '不认识这种语言': 'その言語はわからないよ',
        '这个操作没成': 'うまくいかなかった', '操作没送到宿主': 'ホストに届かなかった',
        // developer mode
        '开发者模式 · Ctrl+Shift+D 关闭': '開発者モード · Ctrl+Shift+D でオフ',
        '还没有猪。先「拆开纸盒」再调。': 'まだブタがいないよ。先に「箱をあける」してね。',
        '开发者模式已开': '開発者モード オン', '开发者模式已关': '開発者モード オフ',
        '资源': 'リソース', '生死': '生と死', '面板': 'パネル',
        '满状态': '全回復', '饿': 'はらぺこ', '脏': 'よごれ', '孤单': 'さみしい', '困': 'ねむい',
        '感冒一期': 'かぜ（1期）', '肺炎': '肺炎', '肺结核': '結核', '胃癌': '胃がん', '治好': '治す',
        '青年': 'わかブタ', '中年': 'おとなブタ', '老年': 'おじいブタ', '老死': '寿命',
        '全套药': 'くすりセット', '弄死': '死なせる', '领养': '新しい子をむかえる', '重置': 'リセット',
        '展开/收起': '開く/閉じる', '+1 小时': '+1 時間', '+1 天': '+1 日',
        '当前：{stage} · 健康 {health} · 🪙 {coins}': '今：{stage} · 健康 {health} · 🪙 {coins}',
        // [dsh-piggy-claude-code mod] naming, the travel world, multi-lesson study
        '博士': '博士課程', '博士毕业': '博士号', '道具': 'どうぐ', '改名': 'なまえを変える',
        '起个名字 · 免费': 'なまえをつけよう · 無料',
        '改名会用掉 1 张 🪪（还有 {n} 张）': 'なまえを変えると 🪪 を1枚使うよ（のこり {n} 枚）',
        '改名要用一张 🪪 更名卡 —— 商店里有卖，{price} 🪙': 'なまえを変えるには 🪪 名前変更カードがいるよ —— おみせで {price} 🪙',
        '最多 16 个字': '16文字まで', '确定': 'けってい', '去商店': 'おみせへ',
        '名字要 1–16 个字': 'なまえは1〜16文字だよ', '和现在的名字一样': 'いまのなまえと同じだよ',
        '改名要一张 🪪 更名卡（商店 {price} 🪙）': '🪪 名前変更カードがいるよ（おみせで {price} 🪙）',
        '好名字！': 'いいなまえ！',
        '这是旅行限定，商店不卖': 'これは旅行限定。おみせでは売ってないよ',
        '更名卡要在「状态」里改名时用': '名前変更カードは「ようす」でなまえを変えるときに使うよ',
        '装扮': 'きせかえ', '衣柜装扮，买一次一直有': 'クローゼットのきせかえ。一度買えばずっと使える', '已拥有': '持ってる', '已经在衣柜里了': 'もうクローゼットにあるよ',
        // [ST0020] the daily-limited emergency ration
        '每天限 {n} 个': '1日{n}個まで', '今天已买完': '今日はもう買った', '明天再来': 'また明日', '这个每天只能买一个，明天再来': 'これは1日1個まで。また明日ね',
        '这一段一次最多上 {n} 门课': 'ここでは一度に {n} こまでだよ',
        '可以一起上 {n} 门 · 已选 {k}': '{n} こまで一緒にうけられるよ · えらんだ数 {k}',
        '每门限 {cap} 次': '1科目 {cap} 回まで', '本段 {n}/{cap}': 'ここで {n}/{cap}', '已满': 'うけきった',
        '这一段每门课最多上 {n} 次': 'ここは1科目 {n} 回までだよ',
        '上课 × {n}（学费 {total} 🪙）': 'じゅぎょう × {n}（授業料 {total} 🪙）',
        '先选课': 'じゅぎょうをえらんでね', '用来改名': 'なまえを変えるのに使う',
        '✈️ 限定': '✈️ 旅行限定',
        '毕业证': '卒業証書', '收藏品': 'コレクション',
        '消耗品': 'どうぐ', '去「旅行」出发 →': '「旅行」で出かける →', '去「学习」上课 →': '「勉強」で授業へ →', '还没有毕业证。': 'まだ卒業証書はないよ。',
        '再上 {left} 节再发一张': 'あと {left} こまでもう1枚', '上满 {need} 节发证（{done}/{need}）': '{need} こまでもらえる（{done}/{need}）',
        '家': 'おうち', '每跨一个时区 +{cost} 🪙 · +{hours} 小时': '時差1時間ごとに +{cost} 🪙 · +{hours} 時間',
        '刚从{place}回来': '{place}から帰ってきたよ', '新！': 'はじめて！', '还带回了：': 'ほかにも：',
        '集齐了「{region}」！': '「{region}」コンプリート！', '集齐奖励：{list}': 'コンプリート報酬：{list}',
        '已生效': '発動中', '🔒 集齐后解锁': '🔒 コンプリートで解放', '去{place}能带回来': '{place}で手に入るよ',
        '以前的纪念品：{list}': 'むかしのおみやげ：{list}', '已获得称号': '称号ゲット！',
        '环球旅行家': '世界一周トラベラー', '地区': 'エリア',
        // [dsh-piggy-claude-code mod] the resizable panel and the big panel
        '打开大面板': '大きいパネルを開く', '拖动调整大小 · 双击还原': 'ドラッグでサイズ変更 · ダブルクリックで元にもどす',
        '猪币': 'ブーコイン', '伪装成表格': '表計算に変装',
        '老板键：连按两次 Esc 或 Ctrl+Shift+E': 'ボスキー：Esc を2回 または Ctrl+Shift+E',
        // the spreadsheet disguise, in Excel's own Japanese wording
        '季度预算.xlsx - Excel': '四半期予算.xlsx - Excel',
        '文件': 'ファイル', '开始': 'ホーム', '插入': '挿入', '页面布局': 'ページ レイアウト',
        '公式': '数式', '数据': 'データ', '审阅': '校閲', '视图': '表示',
        '粘贴': '貼り付け', '条件格式': '条件付き書式', '图片': '画像', '显示/隐藏小猪': 'ブタの表示/非表示',
        '名称框': '名前ボックス', '新工作表': '新しいシート', '就绪': '準備完了',
        '平均值：{n}': '平均: {n}', '计数：{n}': 'データの個数: {n}', '求和：{n}': '合計: {n}',
        '普通': '標準', '返回游戏': 'ゲームにもどる', '返回': 'もどる',
        // [dsh-piggy-claude-code mod] job ladder, shop effects, sorted bag, scratch cards
        '饱食 {n}': 'おなか {n}', '心情 {n}': 'きげん {n}', '清洁 {n}': 'きれいさ {n}',
        '治：{list}': '治る：{list}', '死后用来复活': 'いってしまった子を呼びもどす',
        '没有效果': 'こうかなし', '收入随机 {min}–{max} 🪙': '報酬ランダム {min}–{max} 🪙',
        '高阶': '上級', '需要 {list}': '{list} が必要',
        '这份工作要求：{list}': 'このしごとには {list} が必要だよ',
        '刮彩票': 'スクラッチくじ', '{price} 🪙 一张 · 每 {n} 分钟一次': '1枚 {price} 🪙 · {n}分に1回',
        '刮一张': 'けずる', '{time} 后再来': 'あと {time}',
        '中了{prize}！+{coins} 🪙': '{prize}！ +{coins} 🪙', '谢谢参与…下次一定': 'はずれ…次こそ',
        '一等奖': '1等', '二等奖': '2等', '三等奖': '3等', '安慰奖': '残念賞', '谢谢参与': 'はずれ',
        // [ST0015] blackjack
        '赌场': 'カジノ', '返回商店': 'ショップにもどる',
        // [Q0016] the gym
        '健身房': 'ジム', '返回打工': 'バイトにもどる', '在健身': 'ジムで運動中',
        '体重 {weight} · 最低 {kg} kg': '体重 {weight} · 下限 {kg} kg',
        '已经练成肌肉猪': 'マッチョなブタになった',
        '一共瘦掉 {lost}/{need} kg 练成肌肉猪': '合計 {lost}/{need} kg やせるとマッチョなブタに',
        '已经瘦到 {kg} kg，不能再减了': 'もう {kg} kg、これ以上はやせられない',
        '瘦 {kg} kg': '-{kg} kg',
        '身上': 'からだ',
        '手上': 'て',
        '21 点': 'ブラックジャック', '下注 {min} 起 · {n} 点以上才能停': '{min} 🪙 から · {n} 以上でスタンド',
        '{total} 点': '{total}', '{total} 点（A 算 11）': '{total}（A=11）', '爆了': 'バースト',
        '下注 {bet} 🪙': 'ベット {bet} 🪙', '下注 {bet}': '{bet} 賭ける', '上一手': '前回',
        '要牌': 'ヒット', '停牌': 'スタンド', '{n} 点起才能停': '{n} からスタンド',
        '正好 21 点！+{coins} 🪙': 'ぴったり21！ +{coins} 🪙', '{total} 点，×{m}，+{coins} 🪙': '{total} で ×{m}、+{coins} 🪙',
        '爆了！{total} 点，输掉 {bet} 🪙': 'バースト！ {total}、{bet} 🪙 負け',
        '不到 {n} 点不能停，再要一张吧': '{n} 未満はスタンドできないよ、もう1枚引こう',
        '先把这一手打完': 'まずこの勝負を終わらせよう', '桌上没有牌': 'テーブルにカードがないよ', '没有这个下注': 'そのベットはないよ',
        '其他': 'そのほか', '成长 {pct}%': '成長 {pct}%',
        // [dsh-piggy-claude-code mod] sleep
        '睡觉': 'ねる', '叫醒': 'おこす', '晚安…': 'おやすみ…', '早上好！': 'おはよう！',
        '{name} 在睡觉': '{name}はおやすみ中',
        '睡着时只会变饿，心情和清洁会慢慢恢复': 'ねている間はおなかがへるだけ。きげんときれいさは少しずつもどります',
        '跟着电脑一起睡的，电脑醒来它就起床': 'パソコンといっしょにねたので、パソコンがおきたらおきます',
        '它已经在睡了': 'もうねています', '它本来就醒着': 'もうおきています',
        // [ST0007] updates
        '有新版本 v{version}': '新しいバージョン v{version} があります',
        '当前版本 v{current}': 'いまのバージョン v{current}',
        '立即更新': '今すぐアップデート', '再试一次': 'もう一度ためす', '打开下载页面': 'ダウンロードページを開く',
        '更新失败：{message}': 'アップデートに失敗しました：{message}',
        '这份猪猪不能自己更新，请从下载页面下载新版本安装。': 'このアプリは自分でアップデートできません。ダウンロードページから新しいバージョンを入れてください。',
        '正在下载 v{version}… {percent}%': 'v{version} をダウンロード中… {percent}%',
        '正在安装 v{version}，猪猪马上回来…': 'v{version} をインストール中。すぐもどってくるよ…',
        '检查更新': 'アップデートを確認', '正在检查更新…': 'アップデートを確認中…',
        '检查更新失败': 'アップデートを確認できませんでした', '已经是最新版本': '最新バージョンです',
        '有新版本 v{version} 啦，右键打开面板更新': '新しいバージョン v{version} が出たよ。右クリックでパネルを開いてアップデートしてね',
        // [ST0014] cloud sync
        '邮箱格式不对': 'メールアドレスの形式が正しくありません',
        '服务器地址要以 https:// 开头': 'サーバーのアドレスは https:// で始めてください',
        '刚发过验证码，{n} 秒后再试': 'コードを送ったばかりです。{n} 秒後にもう一度どうぞ',
        '验证码发得太多了，过一会儿再试': 'コードを送りすぎました。しばらくしてからどうぞ',
        '输错太多次，这个网络被冻结 {n} 分钟': '間違いが多すぎたので、このネットワークは {n} 分間ロックされています',
        '验证码不对，或者已经过期': 'コードが違うか、期限が切れています',
        '这个邮箱不在邀请名单里': 'このメールアドレスは招待リストにありません',
        '验证码邮件没发出去，稍后再试': 'コードのメールを送れませんでした。しばらくしてからどうぞ',
        '连不上云端': 'クラウドにつながりません',
        '这台设备已经在别处退出登录': 'この端末はほかの場所でログアウトされました',
        '先发送验证码': '先にコードを送ってください',
        '出错了（{reason}）': 'エラーが起きました（{reason}）',
        '还没同步过': 'まだ同期していません',
        '刚刚同步': 'さっき同期しました',
        '{n} 分钟前同步': '{n} 分前に同期',
        '{n} 小时前同步': '{n} 時間前に同期',
        '验证码是 6 位数字': 'コードは 6 桁の数字です',
        '云端已经有一只猪了': 'クラウドにはもうブタがいます',
        '云端：{name}（{coins} 🪙）· 这台电脑：{local}（{localCoins} 🪙）': 'クラウド：{name}（{coins} 🪙）・このパソコン：{local}（{localCoins} 🪙）',
        '一个账号只能养一只猪。用云端的猪的话，这台电脑上的猪会存成备份文件。': '1 つのアカウントで飼えるブタは 1 匹だけです。クラウドのブタにすると、このパソコンのブタはバックアップファイルに保存されます。',
        '用云端的猪': 'クラウドのブタにする',
        '退出登录': 'ログアウト',
        '连不上云端，联网后自动同步': 'クラウドにつながりません。つながったら自動で同期します',
        '正在同步…': '同期中…',
        '{n} 条待上传': '未送信 {n} 件',
        '同步': '同期', '退出': 'ログアウト',
        '正在连接云端…': 'クラウドに接続中…',
        '云同步': 'クラウド同期',
        '验证码已发到 {email}': '{email} にコードを送りました',
        '未登录': '未ログイン', '登录': 'ログイン',
        '输入邮件里的 6 位验证码（10 分钟内有效）': 'メールに届いた 6 桁のコードを入れてください（10 分間有効）',
        '验证码': 'コード', '重新发送': 'もう一度送る',
        '用邮箱登录，多台电脑养同一只猪。不用密码，每次登录发验证码。': 'メールでログインすると、何台のパソコンでも同じブタを飼えます。パスワードは不要で、ログインのたびにコードが届きます。',
        '云端地址 https://…': 'クラウドのアドレス https://…',
        '邮箱': 'メールアドレス', '发送验证码': 'コードを送る',
        '验证码已发出，去邮箱看看': 'コードを送りました。メールを見てね',
        '用了云端的猪，这台电脑的猪已经备份': 'クラウドのブタにしました。このパソコンのブタはバックアップ済みです',
        '已退出登录，猪留在这台电脑上': 'ログアウトしました。ブタはこのパソコンに残っています',
        '另一台电脑上先发生了别的事，刚才的操作没有生效': 'ほかのパソコンで先に別のことが起きたので、さっきの操作は取り消されました',
        // [ST0014] 在线 tab
        '在线': 'オンライン', '朋友加入后，可以选择让它们的猪出现在你的猪旁边。': '友だちが入ったら、そのブタをあなたのブタの横に出すか選べます。',
        '全部': 'ぜんぶ', '只有自己': '自分だけ', '{n} 只': '{n} 匹', '桌面上显示：{who}': 'デスクに表示：{who}',
        '只看自己': '自分だけ', '全部显示': 'ぜんぶ表示', '显示中': '表示中', '不显示': '非表示',
        // [ST0026] the pen on the desk
        '桌面猪圈 {w}×{h}': 'デスクのブタ小屋 {w}×{h}', '桌面上还没有猪圈': 'デスクにはまだブタ小屋がありません',
        '在桌面上圈一块': 'デスクに囲う', '重新圈': '囲いなおす', '拆掉': 'こわす',
        '在桌面上拖出一块地方，没事做的朋友的猪就在里面跑来跑去、打滚、躺着。': 'デスクの上をドラッグして囲むと、ひまな友だちのブタがその中で走りまわったり、ころがったり、寝そべったりします。',
        // [ST0014 P3] pig pen
        '猪圈': 'ブタ小屋', '和朋友的猪一起出门：快 30%、收获多 30%': '友だちのブタといっしょにおでかけ：30% 速く、30% 多くもらえる',
        '建一个': 'つくる', '加入': '入る', '6 位邀请码': '6 文字の招待コード', '邀请码 {code}': '招待コード {code}',
        '退出猪圈': '小屋を出る', '已经走了': 'もういない', '在睡觉': '寝ている', '在家': 'おうちにいる', '（你）': '（あなた）',
        '等朋友接受：一起去 {what}': '友だちの返事待ち：いっしょに {what}', '撤回': '取り消す',
        '{from} 邀请一起去 {what}': '{from} から「いっしょに {what}」のおさそい', '一起去': 'いっしょに行く', '邀请': 'さそう',
        '没有这个邀请码的猪圈': 'その招待コードの小屋はありません', '这个猪圈满了': 'この小屋はいっぱいです',
        '已经在一个猪圈里了': 'もう小屋に入っています', '这个邀请已经失效了': 'このおさそいはもう終わりました',
        '条件还不够': '条件が足りない', '身体太虚': '体が弱っている', '这门课在这个学段上满了': 'この学年ではもう受けられない',
        '朋友的猪去不了：{why}': '友だちのブタは行けません：{why}', '你的猪去不了：{why}': 'あなたのブタは行けません：{why}',
        '邀请发出去了，10 分钟内有效': 'おさそいを送りました（10 分間有効）', '一起出发！': 'いっしょに出発！',
      },
      en: {
        // tabs
        '状态': 'Status', '学习': 'Study', '打工': 'Work', '商店': 'Shop',
        '旅行': 'Travel', '背包': 'Bag', '调试': 'Debug',
        // care
        '喂食': 'Feed', '洗澡': 'Bathe', '玩耍': 'Play', '摸摸': 'Pat',
        // the box
        '里面好像有东西…': 'Something is in there…',
        '动了！再戳一下！': 'It moved! Poke it again!',
        '戳三下': 'Poke 3 times', '哇——！': 'Whoa—!',
        '一个{box}': 'A {box}',
        '点开拆开它': 'Poke it open',
        '门口放着一个纸盒，里面窸窸窣窣 📦': 'There is a box at the door, and something is rustling inside 📦',
        '拆开纸盒': 'Open the box',
        '拆开就会蹦出一只小猪 —— 不用敲命令': 'Open it and a piglet pops out — no commands needed',
        // empty shelves
        '没有吃的啦，快去买一点 🍎': 'No food left, go buy some 🍎',
        '没有洗浴用品了，去买点吧 🧼': 'No bath things left, go buy some 🧼',
        '没有玩具了，去商店看看 🪀': 'No toys left, have a look in the shop 🪀',
        // shop shelves and item kinds
        '食物': 'Food', '洗浴': 'Bath', '玩具': 'Toys', '药品': 'Medicine', '复活': 'Revival',
        '对症！': 'The right medicine!', '药': 'medicine', '复活用': 'for revival',
        // school
        '小学': 'Primary school', '大学': 'University', '研究生': 'Graduate school',
        // fallbacks for fields an older host did not send
        '猪猪': 'Piggy', '小猪': 'Piglet', '还不错': 'Doing fine', '生病': 'Sick',
        '工作': 'Job', '课': 'Lesson', '学段': 'School', '目的地': 'Destination',
        '物品': 'Item', '外面': 'somewhere', '纸盒': 'box',
        // the pig itself
        '左键摸摸 · 右键打开面板 · 拖动可移动': 'Left-click to pat · right-click for the panel · drag to move',
        '孵出来啦！': 'Out it comes!', '吃掉了！': 'Yum, all gone!', '洗干净啦～': 'Squeaky clean～',
        '好开心！': 'So much fun!', '好舒服…': 'That feels nice…', '出门打工！': 'Off to work!',
        '上学去！': 'Off to school!', '出发旅行！': 'Off on a trip!', '提前回来了…': 'Back early…',
        '买到了！': 'Got it!', '用掉了。': 'Used it.', '我长大啦！': 'I grew up!',
        '在忙': 'Working', '在念书': 'Studying', '在路上': 'Traveling', '在外面': 'Out',
        '{what}：{label}': '{what}: {label}',
        // status tab
        '饱食': 'Fullness', '心情': 'Mood', '清洁': 'Cleanliness', '健康': 'Health',
        '智力': 'Smarts', '魅力': 'Charm', '武力': 'Strength', '体重': 'Weight', '年龄': 'Age',
        '再长 {kg} kg 就长成下一阶段了': '{kg} kg more to grow into the next stage',
        // [ST0004] the wardrobe
        '衣柜': 'Wardrobe', '跟着阶段': 'Match the stage', '还没解锁：{hint}': 'Locked: {hint}', '什么也没穿': 'Nothing on',
        '头上': 'Head', '眼睛': 'Eyes', '腰上': 'Waist', '脸上': 'Face',
        '不在家': 'out', '{n}s': '{n}s', '语言': 'Language',
        // care item picker
        '喂点什么？': 'What should it eat?', '用哪个洗澡？': 'Bathe with what?',
        '拿哪个玩具？': 'Which toy?', '用哪个？': 'Use which one?',
        '{label}（自带）': '{label} (always there)', '用': 'Use', '算了': 'Never mind',
        // study tab
        '宿主还没提供课程表。': 'The host has not sent a timetable yet.',
        '{time} · 学费 {tuition} 🪙 · 属性 +{gain}': '{time} · tuition {tuition} 🪙 · stats +{gain}',
        '要先念完{label}（{done}/{need}）': 'Finish {label} first ({done}/{need})',
        '已上 {n} 次': '{n} lessons so far',
        // work tab
        '宿主还没提供工作列表。': 'The host has not sent any jobs yet.',
        '赚 {coins} 🪙': 'earns {coins} 🪙', '省 {pct}% 时间': '{pct}% faster',
        '报酬 +{pct}%': 'pay +{pct}%', '去上课就能涨': 'lessons raise this', '出发': 'Go',
        // shop tab
        '宿主还没提供货架。': 'The host has not stocked the shop yet.',
        '现在需要': 'needed now', '买': 'Buy',
        // travel and bag tabs
        '宿主还没提供目的地。': 'The host has not sent any destinations yet.',
        '纪念品': 'Souvenirs', '还没出过远门。': 'No trips yet.',
        '背包空空的 —— 去「商店」买点东西。': 'The bag is empty — buy something in the Shop.',
        '使用': 'Use', '收藏册还空着。': 'The collection is still empty.',
        // durations
        '{n} 天': '{n} days', '{n} 小时': '{n} h', '{n} 分钟': '{n} min',
        // banners
        '宿主是旧版本': 'The host is out of date',
        '猪币、健康、打工、商店这些是新增的，重启 dsh（不是刷新页面）之后才会出现。':
          'Oinks, health, work and the shop are new. They appear after restarting dsh (not just reloading the page).',
        '{name} 走了': '{name} has passed away',
        '{name} 走了，灵魂还留在墓碑上 👻': '{name} has passed away; its soul still lingers at the grave 👻',
        '用还魂丹可以把它叫回来，或者领养一只新的小猪': 'A revival pill can call it back, or you can adopt a new piglet',
        '在「背包」里用还魂丹就能救回来（猪币、收藏、上过的课都保留）':
          'Use a revival pill from the Bag to bring it back (oinks, collection and lessons are kept)',
        '领养新猪': 'Adopt a new pig',
        '{name}（第 {stage}/4 期）': '{name} (stage {stage}/4)',
        '需要「{cure}」—— 去商店买对应的药': 'Needs "{cure}" — buy the right medicine in the Shop',
        '带病也能出门，但报酬只有一半；在外面病情会走得更快，躺着养最省':
          'It can still go out while sick, but for half pay, and the illness gets worse faster outside. Resting is best.',
        '钱不够也没关系 —— 先去打工，赚够 {price} 🪙 买「{item}」':
          'Short of oinks? Go to work first and earn {price} 🪙 for "{item}"',
        '在外面：{label}': 'Out: {label}', '还有 {n} 秒': '{n}s left', '叫它回来': 'Call back',
        // messages
        '猪有新消息': 'News from your pig', '连接不上宿主': "Can't reach the host",
        '背包里没有能用的东西': 'Nothing usable in the bag',
        '还要等 {n} 秒': 'Wait {n}s more', '钱不够': 'Not enough oinks', '它在外面': "It's out",
        '太虚弱了，先养好再出门': 'Too weak. Rest up before going out', '太饿了': 'Too hungry',
        '药不对症': 'Wrong medicine', '背包里没有': 'Not in the bag', '它没生病': "It isn't sick",
        '它已经走了…': "It's gone…", '它没在外面': "It isn't out",
        '不认识这种语言': 'Unknown language',
        '这个操作没成': "That didn't work", '操作没送到宿主': "Couldn't reach the host",
        // developer mode
        '开发者模式 · Ctrl+Shift+D 关闭': 'Developer mode · Ctrl+Shift+D to turn off',
        '还没有猪。先「拆开纸盒」再调。': 'No pig yet. Open the box first.',
        '开发者模式已开': 'Developer mode on', '开发者模式已关': 'Developer mode off',
        '资源': 'Resources', '生死': 'Life and death', '面板': 'Panel',
        '满状态': 'Max all', '饿': 'Hungry', '脏': 'Dirty', '孤单': 'Lonely', '困': 'Sleepy',
        '感冒一期': 'Cold, stage 1', '肺炎': 'Pneumonia', '肺结核': 'Tuberculosis', '胃癌': 'Stomach cancer', '治好': 'Cure',
        '青年': 'Young pig', '中年': 'Grown pig', '老年': 'Elder pig', '老死': 'Old age',
        '全套药': 'All medicines', '弄死': 'Kill', '领养': 'Adopt', '重置': 'Reset',
        '展开/收起': 'Open/close', '+1 小时': '+1 h', '+1 天': '+1 day',
        '当前：{stage} · 健康 {health} · 🪙 {coins}': 'Now: {stage} · Health {health} · 🪙 {coins}',
        // [dsh-piggy-claude-code mod] naming, the travel world, multi-lesson study
        '博士': 'Doctorate', '博士毕业': 'PhD', '道具': 'Items', '改名': 'Rename',
        '起个名字 · 免费': 'Give it a name · free',
        '改名会用掉 1 张 🪪（还有 {n} 张）': 'Renaming uses one 🪪 ({n} left)',
        '改名要用一张 🪪 更名卡 —— 商店里有卖，{price} 🪙': 'Renaming needs a 🪪 rename card — the Shop sells them for {price} 🪙',
        '最多 16 个字': 'Up to 16 characters', '确定': 'OK', '去商店': 'To the Shop',
        '名字要 1–16 个字': 'A name is 1–16 characters', '和现在的名字一样': "That's already its name",
        '改名要一张 🪪 更名卡（商店 {price} 🪙）': 'Needs a 🪪 rename card ({price} 🪙 in the Shop)',
        '好名字！': 'Nice name!',
        '这是旅行限定，商店不卖': "That's travel-only; the Shop doesn't sell it",
        '更名卡要在「状态」里改名时用': 'Rename cards are spent when renaming on the Status tab',
        '装扮': 'Dress-up', '衣柜装扮，买一次一直有': 'For the wardrobe; buy once, keep for good', '已拥有': 'Owned', '已经在衣柜里了': 'Already in the wardrobe',
        // [ST0020] the daily-limited emergency ration
        '每天限 {n} 个': '{n} a day', '今天已买完': 'sold out today', '明天再来': 'Tomorrow', '这个每天只能买一个，明天再来': 'Only one a day; come back tomorrow',
        '这一段一次最多上 {n} 门课': 'Up to {n} lessons at once here',
        '可以一起上 {n} 门 · 已选 {k}': 'Take up to {n} together · {k} picked',
        '每门限 {cap} 次': '{cap} per subject', '本段 {n}/{cap}': 'here {n}/{cap}', '已满': 'done',
        '这一段每门课最多上 {n} 次': 'At most {n} lessons per subject here',
        '上课 × {n}（学费 {total} 🪙）': 'Study × {n} (tuition {total} 🪙)',
        '先选课': 'Pick lessons first', '用来改名': 'For renaming',
        '✈️ 限定': '✈️ Travel only',
        '毕业证': 'Diplomas', '收藏品': 'Collectible',
        '消耗品': 'Supplies', '去「旅行」出发 →': 'Go travelling →', '去「学习」上课 →': 'Go to class →', '还没有毕业证。': 'No diplomas yet.',
        '再上 {left} 节再发一张': '{left} more lessons for another', '上满 {need} 节发证（{done}/{need}）': 'Awarded after {need} lessons ({done}/{need})',
        '家': 'Home', '每跨一个时区 +{cost} 🪙 · +{hours} 小时': 'Each time zone crossed: +{cost} 🪙 · +{hours} h',
        '刚从{place}回来': 'Just back from {place}', '新！': 'New!', '还带回了：': 'Also brought: ',
        '集齐了「{region}」！': '{region} complete!', '集齐奖励：{list}': 'Complete set: {list}',
        '已生效': 'active', '🔒 集齐后解锁': '🔒 unlocks on completion', '去{place}能带回来': 'Found in {place}',
        '以前的纪念品：{list}': 'Old souvenirs: {list}', '已获得称号': 'Title earned!',
        '环球旅行家': 'Globetrotter', '地区': 'Region',
        // [dsh-piggy-claude-code mod] the resizable panel and the big panel
        '打开大面板': 'Open the big panel', '拖动调整大小 · 双击还原': 'Drag to resize · double-click to reset',
        '猪币': 'Oinks', '伪装成表格': 'Disguise as a spreadsheet',
        '老板键：连按两次 Esc 或 Ctrl+Shift+E': 'Boss key: Esc twice or Ctrl+Shift+E',
        // the spreadsheet disguise, in Excel's own English wording
        '季度预算.xlsx - Excel': 'Quarterly Budget.xlsx - Excel',
        '文件': 'File', '开始': 'Home', '插入': 'Insert', '页面布局': 'Page Layout',
        '公式': 'Formulas', '数据': 'Data', '审阅': 'Review', '视图': 'View',
        '粘贴': 'Paste', '条件格式': 'Conditional Formatting', '图片': 'Picture', '显示/隐藏小猪': 'Show/hide the pig',
        '名称框': 'Name Box', '新工作表': 'New sheet', '就绪': 'Ready',
        '平均值：{n}': 'Average: {n}', '计数：{n}': 'Count: {n}', '求和：{n}': 'Sum: {n}',
        '普通': 'Normal', '返回游戏': 'Back to the game', '返回': 'Back',
        // [dsh-piggy-claude-code mod] job ladder, shop effects, sorted bag, scratch cards
        '饱食 {n}': 'Fullness {n}', '心情 {n}': 'Mood {n}', '清洁 {n}': 'Clean {n}',
        '治：{list}': 'Cures: {list}', '死后用来复活': 'Brings a lost pig back',
        '没有效果': 'No effect', '收入随机 {min}–{max} 🪙': 'random pay {min}–{max} 🪙',
        '高阶': 'Pro', '需要 {list}': 'Needs {list}',
        '这份工作要求：{list}': 'This job needs {list}',
        '刮彩票': 'Scratch cards', '{price} 🪙 一张 · 每 {n} 分钟一次': '{price} 🪙 each · one every {n} min',
        '刮一张': 'Scratch', '{time} 后再来': 'again in {time}',
        '中了{prize}！+{coins} 🪙': '{prize}! +{coins} 🪙', '谢谢参与…下次一定': 'No luck… next time',
        '一等奖': '1st prize', '二等奖': '2nd prize', '三等奖': '3rd prize', '安慰奖': 'Consolation prize', '谢谢参与': 'No luck',
        // [ST0015] blackjack
        '赌场': 'Casino', '返回商店': 'Back to the shop',
        // [Q0016] the gym
        '健身房': 'Gym', '返回打工': 'Back to work', '在健身': 'At the gym',
        '体重 {weight} · 最低 {kg} kg': 'Weight {weight} · floor {kg} kg',
        '已经练成肌肉猪': 'Already a muscle pig',
        '一共瘦掉 {lost}/{need} kg 练成肌肉猪': 'Lose {lost}/{need} kg in all to become a muscle pig',
        '已经瘦到 {kg} kg，不能再减了': 'Down to {kg} kg already, it can’t lose any more',
        '瘦 {kg} kg': '-{kg} kg',
        '身上': 'Body',
        '手上': 'Hand',
        '21 点': 'Blackjack', '下注 {min} 起 · {n} 点以上才能停': 'bets from {min} 🪙 · stand on {n}+',
        '{total} 点': '{total}', '{total} 点（A 算 11）': '{total} (A=11)', '爆了': 'bust',
        '下注 {bet} 🪙': 'Bet {bet} 🪙', '下注 {bet}': 'Bet {bet}', '上一手': 'Last hand',
        '要牌': 'Hit', '停牌': 'Stand', '{n} 点起才能停': 'Stand from {n}',
        '正好 21 点！+{coins} 🪙': 'Exactly 21! +{coins} 🪙', '{total} 点，×{m}，+{coins} 🪙': '{total}, ×{m}, +{coins} 🪙',
        '爆了！{total} 点，输掉 {bet} 🪙': 'Bust! {total}, lost {bet} 🪙',
        '不到 {n} 点不能停，再要一张吧': 'Under {n} you can\'t stand — draw another',
        '先把这一手打完': 'Finish this hand first', '桌上没有牌': 'No hand on the table', '没有这个下注': 'No such bet',
        '其他': 'Other', '成长 {pct}%': 'Growth {pct}%',
        // [dsh-piggy-claude-code mod] sleep
        '睡觉': 'Sleep', '叫醒': 'Wake up', '晚安…': 'Good night…', '早上好！': 'Good morning!',
        '{name} 在睡觉': '{name} is sleeping',
        '睡着时只会变饿，心情和清洁会慢慢恢复': 'Asleep it only gets hungrier; mood and cleanliness slowly come back',
        '跟着电脑一起睡的，电脑醒来它就起床': 'It fell asleep with the computer and gets up when the computer wakes',
        '它已经在睡了': "It's already asleep", '它本来就醒着': "It's already awake",
        // [ST0007] updates
        '有新版本 v{version}': 'New version v{version}',
        '当前版本 v{current}': 'You have v{current}',
        '立即更新': 'Update now', '再试一次': 'Try again', '打开下载页面': 'Open the download page',
        '更新失败：{message}': 'Update failed: {message}',
        '这份猪猪不能自己更新，请从下载页面下载新版本安装。': 'This copy cannot update itself. Download the new version from the download page.',
        '正在下载 v{version}… {percent}%': 'Downloading v{version}… {percent}%',
        '正在安装 v{version}，猪猪马上回来…': 'Installing v{version}, back in a moment…',
        '检查更新': 'Check for updates', '正在检查更新…': 'Checking for updates…',
        '检查更新失败': 'Could not check for updates', '已经是最新版本': 'Up to date',
        '有新版本 v{version} 啦，右键打开面板更新': 'v{version} is out! Right-click to open the panel and update',
        // [ST0014] cloud sync
        '邮箱格式不对': 'That email address does not look right',
        '服务器地址要以 https:// 开头': 'The server address must start with https://',
        '刚发过验证码，{n} 秒后再试': 'A code was just sent; try again in {n} s',
        '验证码发得太多了，过一会儿再试': 'Too many codes; try again later',
        '输错太多次，这个网络被冻结 {n} 分钟': 'Too many wrong codes: this network is locked for {n} min',
        '验证码不对，或者已经过期': 'Wrong or expired code',
        '这个邮箱不在邀请名单里': 'This address is not on the invite list',
        '验证码邮件没发出去，稍后再试': 'The code email could not be sent; try again later',
        '连不上云端': 'Cannot reach the cloud',
        '这台设备已经在别处退出登录': 'This device was signed out from elsewhere',
        '先发送验证码': 'Send a code first',
        '出错了（{reason}）': 'Something went wrong ({reason})',
        '还没同步过': 'Not synced yet',
        '刚刚同步': 'Synced just now',
        '{n} 分钟前同步': 'Synced {n} min ago',
        '{n} 小时前同步': 'Synced {n} h ago',
        '验证码是 6 位数字': 'The code is 6 digits',
        '云端已经有一只猪了': 'There is already a pig in the cloud',
        '云端：{name}（{coins} 🪙）· 这台电脑：{local}（{localCoins} 🪙）': 'Cloud: {name} ({coins} 🪙) · This computer: {local} ({localCoins} 🪙)',
        '一个账号只能养一只猪。用云端的猪的话，这台电脑上的猪会存成备份文件。': 'One account keeps one pig. If you take the cloud pig, the pig on this computer is saved to a backup file.',
        '用云端的猪': 'Take the cloud pig',
        '退出登录': 'Sign out',
        '连不上云端，联网后自动同步': 'Cannot reach the cloud; it syncs once you are online',
        '正在同步…': 'Syncing…',
        '{n} 条待上传': '{n} waiting to upload',
        '同步': 'Sync', '退出': 'Sign out',
        '正在连接云端…': 'Connecting to the cloud…',
        '云同步': 'Cloud sync',
        '验证码已发到 {email}': 'Code sent to {email}',
        '未登录': 'Not signed in', '登录': 'Sign in',
        '输入邮件里的 6 位验证码（10 分钟内有效）': 'Enter the 6-digit code from the email (valid for 10 minutes)',
        '验证码': 'Code', '重新发送': 'Send again',
        '用邮箱登录，多台电脑养同一只猪。不用密码，每次登录发验证码。': 'Sign in with your email to keep one pig on several computers. No password: each sign-in sends a code.',
        '云端地址 https://…': 'Cloud address https://…',
        '邮箱': 'Email', '发送验证码': 'Send code',
        '验证码已发出，去邮箱看看': 'Code sent. Check your email',
        '用了云端的猪，这台电脑的猪已经备份': 'Took the cloud pig; the one on this computer is backed up',
        '已退出登录，猪留在这台电脑上': 'Signed out. The pig stays on this computer',
        '另一台电脑上先发生了别的事，刚才的操作没有生效': 'Something else happened first on another computer, so that last action did not count',
        // [ST0014] 在线 tab
        '在线': 'Online', '朋友加入后，可以选择让它们的猪出现在你的猪旁边。': "Once friends join, you can choose to show their pigs next to yours.",
        '全部': 'everyone', '只有自己': 'just mine', '{n} 只': '{n} pigs', '桌面上显示：{who}': 'On the desk: {who}',
        '只看自己': 'Just mine', '全部显示': 'Show all', '显示中': 'Shown', '不显示': 'Hidden',
        // [ST0026] the pen on the desk
        '桌面猪圈 {w}×{h}': 'Desk pen {w}×{h}', '桌面上还没有猪圈': 'No pen on the desk yet',
        '在桌面上圈一块': 'Fence one in', '重新圈': 'Redraw', '拆掉': 'Take down',
        '在桌面上拖出一块地方，没事做的朋友的猪就在里面跑来跑去、打滚、躺着。': "Drag out a patch of the desk, and friends' pigs with nothing to do run about, roll and lounge in it.",
        // [ST0014 P3] pig pen
        '猪圈': 'Pig pen', '和朋友的猪一起出门：快 30%、收获多 30%': "Head out with friends' pigs: 30% faster, 30% more",
        '建一个': 'Make one', '加入': 'Join', '6 位邀请码': '6-letter code', '邀请码 {code}': 'code {code}',
        '退出猪圈': 'Leave', '已经走了': 'Gone', '在睡觉': 'Asleep', '在家': 'At home', '（你）': '(you)',
        '等朋友接受：一起去 {what}': 'Waiting for a friend: {what} together', '撤回': 'Withdraw',
        '{from} 邀请一起去 {what}': '{from} asks you along: {what}', '一起去': 'Go together', '邀请': 'Invite',
        '没有这个邀请码的猪圈': 'No pen has that code', '这个猪圈满了': 'That pen is full',
        '已经在一个猪圈里了': 'Already in a pen', '这个邀请已经失效了': 'That invite is over',
        '条件还不够': 'not qualified yet', '身体太虚': 'too weak', '这门课在这个学段上满了': 'that class is used up at this stage',
        '朋友的猪去不了：{why}': "Your friend's pig cannot go: {why}", '你的猪去不了：{why}': 'Your pig cannot go: {why}',
        '邀请发出去了，10 分钟内有效': 'Invite sent (valid for 10 minutes)', '一起出发！': 'Off together!',
      },
    }
    // English singulars, picked when `params.n === 1`. Japanese and Chinese
    // have no plural, so this is the only language that needs them.
    var I18N_EN_ONE = {
      '{n} 天': '{n} day',
      '已上 {n} 次': '{n} lesson so far',
    }

    var normalizeLang = v => (typeof v === 'string' && LANG_KEYS.indexOf(v) >= 0 ? v : 'zh')

    function fillParams(text, params) {
      if (params === undefined || params === null) return text
      return text.replace(/\{(\w+)\}/g, function (whole, key) {
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole
      })
    }

    /** Translate one Chinese source string into `lang`, falling back to the Chinese. */
    function tr(lang, zh, params) {
      if (typeof zh !== 'string') return zh
      var target = normalizeLang(lang)
      var text = zh
      if (target === 'en' && params && params.n === 1 && I18N_EN_ONE[zh] !== undefined) {
        text = I18N_EN_ONE[zh]
      } else if (target !== 'zh' && Object.prototype.hasOwnProperty.call(I18N[target], zh)) {
        text = I18N[target][zh]
      }
      return fillParams(text, params)
    }

    // The language of the last rendered snapshot (`view.lang`). Text is built
    // on every render, so a switch shows up on the next one without a reload.
    var currentLang = 'zh'
    function T(zh, params) { return tr(currentLang, zh, params) }

    var MODES = ['feed', 'bathe', 'play', 'pet']
    var CARE_LABEL = { feed: ['喂食', '🍎'], bathe: ['洗澡', '🛁'], play: ['玩耍', '🎾'], pet: ['摸摸', '❤️'] }
    // What the pig says when the shelf it needs is bare. Being told plainly
    // beats a generic "that did not work".
    /** A new pig arrives in a box and has to be poked out of it. */
    var BOX_POKES_TO_OPEN = 3
    var BOX_POKE_LINES = [
      '里面好像有东西…',
      '动了！再戳一下！',
    ]

    var NO_ITEM_LINE = {
      food: '没有吃的啦，快去买一点 🍎',
      bath: '没有洗浴用品了，去买点吧 🧼',
      toy: '没有玩具了，去商店看看 🪀',
    }
    var KIND_TITLE = { food: ['🍎', '食物'], bath: ['🧼', '洗浴'], toy: ['🪀', '玩具'], medicine: ['💊', '药品'], revive: ['✨', '复活'], card: ['🪪', '道具'], wear: ['👗', '装扮'] }
    var KIND_ORDER = ['food', 'bath', 'toy', 'medicine', 'revive', 'card', 'wear']
    // [ST0012] wardrobe sections, head to toe.
    var WEAR_SLOT_TITLE = { head: ['🎩', '头上'], eyes: ['👓', '眼睛'], waist: ['🎗️', '腰上'], face: ['🧔', '脸上'], body: ['💪', '身上'], hand: ['✋', '手上'] }
    var WEAR_SLOT_ORDER = ['head', 'eyes', 'waist', 'face', 'hand', 'body']
    // [dsh-piggy-claude-code mod] study and work are sorted by the trait they build or use.
    var TRAIT_TITLE = { intel: ['🧠', '智力'], charm: ['✨', '魅力'], strong: ['💪', '武力'] }
    var TRAIT_KEYS = ['intel', 'charm', 'strong']
    var STAGES = [
      { key: 'primary', label: '小学' },
      { key: 'college', label: '大学' },
      { key: 'graduate', label: '研究生' },
      { key: 'doctor', label: '博士' },
    ]
    // [dsh-piggy-claude-code mod] which travel region is unfolded; '' = none.
    var REGION_KEY = 'dsh-pig:region'
    // [dsh-piggy-claude-code mod] which shelf of the bag was last open.
    var BAG_KEY = 'dsh-pig:bag'
    // A finished trip is announced on the travel tab for this long.
    var LAST_TRIP_MS = 12 * 3600 * 1000
    var NAME_MAX = 16

    // ---------------------------------------------------------------------
    // Defensive readers — the whole point of this file's first hundred lines.
    // ---------------------------------------------------------------------

    var isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v)
    var obj = v => (isObj(v) ? v : {})
    var arr = v => (Array.isArray(v) ? v : [])
    var num = (v, dflt) => (typeof v === 'number' && isFinite(v) ? v : dflt)
    var str = (v, dflt) => (typeof v === 'string' && v !== '' ? v : dflt)

    /** [ST0007] The updater's state, or null for anything that is not one. */
    function normalizeUpdate(raw) {
      if (!isObj(raw) || typeof raw.current !== 'string' || UPDATE_STATUSES.indexOf(raw.status) < 0) return null
      var latest = isObj(raw.latest) && typeof raw.latest.version === 'string'
        ? { version: raw.latest.version, notes: str(raw.latest.notes, '') }
        : null
      return {
        current: raw.current,
        status: raw.status,
        latest: latest,
        progress: Math.max(0, Math.min(100, num(raw.progress, 0))),
        canInstall: raw.canInstall === true,
        error: raw.error === 'check' || raw.error === 'install' ? raw.error : null,
        message: str(raw.message, ''),
      }
    }

    /** [ST0014] The cloud login's state, or null for anything that is not one. */
    function normalizeCloud(raw) {
      if (!isObj(raw) || CLOUD_PHASES.indexOf(raw.phase) < 0) return null
      var side = function (v) {
        return isObj(v) ? { name: str(v.name, '?'), coins: num(v.coins, 0), bornAt: num(v.bornAt, 0) } : null
      }
      var conflict = isObj(raw.conflict) ? { cloud: side(raw.conflict.cloud), local: side(raw.conflict.local) } : null
      return {
        phase: raw.phase,
        server: str(raw.server, ''),
        email: str(raw.email, ''),
        linked: raw.linked === true,
        lastSyncAt: num(raw.lastSyncAt, 0),
        lastError: str(raw.lastError, ''),
        waiting: num(raw.waiting, 0),
        notices: arr(raw.notices).filter(isObj).map(function (n) { return { op: str(n.op, ''), reason: str(n.reason, ''), at: num(n.at, 0) } }),
        conflict: conflict !== null && conflict.cloud !== null && conflict.local !== null ? conflict : null,
        pen: normalizePen(raw.pen),
        // 'all' · 'self' · a list of account ids
        penShow: raw.penShow === 'self' || Array.isArray(raw.penShow) ? (raw.penShow === 'self' ? 'self' : arr(raw.penShow).filter(function (id) { return typeof id === 'string' })) : 'all',
      }
    }

    /** [ST0014 P3] The pig pen, or null when not in one. */
    function normalizePen(raw) {
      if (!isObj(raw) || typeof raw.code !== 'string') return null
      return {
        name: str(raw.name, ''),
        code: raw.code,
        limit: num(raw.limit, 6),
        members: arr(raw.members).filter(isObj).map(function (m) {
          var pig = isObj(m.pig) ? m.pig : null
          var a = pig !== null && isObj(pig.activity) ? pig.activity : null
          var stage = pig !== null && isObj(pig.stage) ? pig.stage : null
          return {
            id: str(m.id, ''),
            you: m.you === true,
            owner: m.owner === true,
            name: pig === null ? '?' : str(pig.name, '?'),
            hatched: pig !== null && pig.hatched !== false,
            dead: pig !== null && pig.dead === true,
            asleep: pig !== null && pig.asleep === true,
            // [ST0014] for drawing it beside ours; an older server sends none.
            stage: stage === null ? null : {
              key: str(stage.key, ''), size: Math.max(24, Math.min(400, num(stage.size, 56))),
              art: str(stage.art, null), emoji: str(stage.emoji, '🐖'), faded: stage.faded === true,
            },
            mood: pig === null ? '' : str(pig.mood, ''),
            moodLevel: pig === null ? 0 : num(pig.moodLevel, 0),
            worn: pig === null ? [] : arr(pig.worn).filter(function (k) { return typeof k === 'string' && /^[a-z0-9-]+$/.test(k) }),
            activity: a === null ? null : {
              kind: str(a.kind, ''), key: str(a.key, ''), label: str(a.label, ''), emoji: str(a.emoji, ''), partner: str(a.partner, ''),
              stage: str(a.stage, ''), region: str(a.region, ''),
            },
          }
        }),
        invites: arr(raw.invites).filter(isObj).map(function (i) {
          return { id: str(i.id, ''), from: str(i.from, '?'), mine: i.mine === true, kind: str(i.kind, ''), args: arr(i.args), label: str(i.label, '') }
        }).filter(function (i) { return i.id !== '' }),
      }
    }

    /**
     * Map any host payload — current, older, or truncated — onto the exact
     * shape the panel draws. Missing fields become defaults, never `undefined`.
     * @returns {object} a fully populated view model.
     */
    function normalize(raw) {
      var d = obj(raw)
      var pig = isObj(d.pig) ? d.pig : null
      var legacy = pig !== null && !('coins' in pig) && !('health' in pig)
      // [dsh-piggy-claude-code mod] the pig's language; the fallbacks below
      // speak it too, since the host never sent them.
      var lang = normalizeLang(d.lang)
      var L = zh => tr(lang, zh)

      return {
        lang: lang,
        langs: normalizeLangs(d.langs),
        legacy: legacy,
        // Trust the flag when the host sends one. Older hosts did not, and for
        // those "a pig exists" is still the right answer.
        hatched: d.hatched === true || (d.hatched === undefined && pig !== null),
        dead: d.dead === true || (pig !== null && num(pig.health, 5) <= 0),
        pig: pig === null ? null : {
          name: str(pig.name, L('猪猪')),
          // The pig is measured in days now; `stage` carries how big it is and
          // what it looks like.
          stage: {
            key: str(obj(pig.stage).key, 'piglet'),
            label: str(obj(pig.stage).label, L('小猪')),
            emoji: str(obj(pig.stage).emoji, '🐖'),
            size: num(obj(pig.stage).size, 56),
            line: str(obj(pig.stage).line, ''),
            art: typeof obj(pig.stage).art === 'string' && obj(pig.stage).art !== '' ? obj(pig.stage).art : null,
            faded: obj(pig.stage).faded === true,
          },
          ageLabel: str(pig.ageLabel, ''),
          daysToNextStage: typeof pig.daysToNextStage === 'number' ? pig.daysToNextStage : null,
          // [dsh-piggy-claude-code mod] growth by weight, switchable elder look.
          kgToNextStage: typeof pig.kgToNextStage === 'number' ? pig.kgToNextStage : null,
          // [ST0004] an older host has no wardrobe: nothing worn, nothing to pick.
          outfit: {
            auto: obj(pig.outfit).auto !== false,
            worn: (Array.isArray(obj(pig.outfit).worn) ? obj(pig.outfit).worn : []).filter(function (key) {
              return typeof key === 'string' && /^[a-z]+$/.test(key)
            }),
          },
          wardrobe: (Array.isArray(pig.wardrobe) ? pig.wardrobe : []).map(obj).filter(function (item) {
            return typeof item.key === 'string' && /^[a-z]+$/.test(item.key)
          }).map(function (item) {
            return {
              key: item.key, slot: str(item.slot, 'head'), label: str(item.label, item.key), emoji: str(item.emoji, '👗'),
              unlocked: item.unlocked === true, worn: item.worn === true, hint: str(item.hint, ''),
            }
          }),
          soul: pig.soul === true,
          mood: str(pig.mood, 'fine'),
          moodLevel: num(pig.moodLevel, 0),
          moodEmoji: str(pig.moodEmoji, '😊'),
          moodLabel: str(pig.moodLabel, L('还不错')),
          // [dsh-piggy-claude-code mod] an older host never sends these: awake.
          asleep: pig.asleep === true,
          sleepAuto: pig.sleepAuto === true,
          satiety: Math.round(num(pig.satiety, 0)),
          happiness: Math.round(num(pig.happiness, 0)),
          cleanliness: Math.round(num(pig.cleanliness, 0)),
          health: num(pig.health, 5),
          healthPercent: num(pig.healthPercent, 100),
          coins: num(pig.coins, 0),
          weight: str(pig.weight, '—'),
          // [dsh-piggy-claude-code mod] null from an older host
          growthPercent: typeof pig.growthPercent === 'number' ? pig.growthPercent : null,
          xp: num(pig.xp, 0),
          stageLine: str(pig.stageLine, ''),
          illness: isObj(pig.illness) ? {
            name: str(pig.illness.name, L('生病')),
            cure: str(pig.illness.cure, L('药')),
            stage: num(pig.illness.stage, 1),
          } : null,
          traits: {
            intel: num(obj(pig.traits).intel, 0),
            charm: num(obj(pig.traits).charm, 0),
            strong: num(obj(pig.traits).strong, 0),
          },
          courses: obj(pig.courses),
          // [dsh-piggy-claude-code mod] naming. An older host sends no
          // `renameFree` at all and cannot rename, so the ✏️ stays away.
          canRename: typeof pig.renameFree === 'boolean',
          renameFree: pig.renameFree === true,
          renameCards: Math.max(0, Math.floor(num(pig.renameCards, 0))),
          renameCardPrice: num(pig.renameCardPrice, 1000),
          perks: arr(pig.perks).filter(k => typeof k === 'string'),
          doctor: pig.doctor === true,
          // [mod] every diploma, held or not; an older host sent none.
          diplomas: arr(pig.diplomas).map(d => ({
            key: str(obj(d).key, ''),
            label: str(obj(d).label, ''),
            emoji: str(obj(d).emoji, '📜'),
            count: Math.max(0, Math.floor(num(obj(d).count, 0))),
            repeat: obj(d).repeat === true,
            next: isObj(obj(d).next) ? { done: num(obj(d).next.done, 0), need: num(obj(d).next.need, 0) } : null,
          })).filter(d => d.key !== ''),
          worldTraveler: pig.worldTraveler === true,
          souvenirs: arr(pig.souvenirs),
          memories: arr(pig.memories).filter(m => typeof m === 'string'),
        },
        actions: normalizeActions(d.actions),
        jobs: arr(d.jobs).map(job => ({
          key: str(obj(job).key, ''),
          label: str(obj(job).label, L('工作')),
          emoji: str(obj(job).emoji, '💼'),
          minutes: num(obj(job).minutes, 0),
          coins: num(obj(job).coins, 0),
          available: obj(job).available === true,
          // What schooling has bought this job.
          traitLabel: str(obj(job).traitLabel, ''),
          traitEmoji: str(obj(job).traitEmoji, ''),
          traitPoints: num(obj(job).traitPoints, 0),
          baseMinutes: num(obj(job).baseMinutes, 0),
          baseCoins: num(obj(job).baseCoins, 0),
          payPercent: num(obj(job).payPercent, 0),
          speedPercent: num(obj(job).speedPercent, 0),
          // [dsh-piggy-claude-code mod] the per-trait ladder: gigs with a pay
          // roll, and careers gated behind trait points.
          trait: str(obj(job).trait, ''),
          tier: obj(job).tier === 'pro' ? 'pro' : 'basic',
          // A career has its own at-work sprite, job-<art>.svg.
          art: typeof obj(job).art === 'string' && obj(job).art !== '' ? obj(job).art : null,
          fixed: obj(job).fixed === true,
          random: Array.isArray(obj(job).random) && obj(job).random.length === 2
            ? [num(obj(job).random[0], 0), num(obj(job).random[1], 0)] : null,
          locked: obj(job).locked === true,
          requires: arr(obj(job).requires).map(need => ({
            trait: str(obj(need).trait, ''),
            label: str(obj(need).label, ''),
            emoji: str(obj(need).emoji, ''),
            need: num(obj(need).need, 0),
            have: num(obj(need).have, 0),
          })).filter(need => need.trait !== ''),
        })).filter(job => job.key !== ''),
        subjects: arr(d.subjects).map(sub => ({
          key: str(obj(sub).key, ''),
          label: str(obj(sub).label, L('课')),
          emoji: str(obj(sub).emoji, '📘'),
          traitLabel: str(obj(sub).traitLabel, ''),
          trait: str(obj(sub).trait, ''),
          level: num(obj(sub).level, 0),
          available: obj(sub).available === true,
        })).filter(sub => sub.key !== ''),
        stages: arr(d.stages).map(stage => ({
          key: str(obj(stage).key, ''),
          label: str(obj(stage).label, L('学段')),
          minutes: num(obj(stage).minutes, 0),
          tuition: num(obj(stage).tuition, 0),
          gain: num(obj(stage).gain, 0),
          // How many subjects one sitting may take; an older host meant one.
          parallel: Math.max(1, Math.floor(num(obj(stage).parallel, 1))),
          // [mod] lessons per subject this stage allows (null = no limit), and
          // how many each subject has used; an older host sent neither.
          cap: typeof obj(stage).cap === 'number' && obj(stage).cap > 0 ? Math.floor(obj(stage).cap) : null,
          taken: isObj(obj(stage).taken) ? obj(stage).taken : {},
          // The school ladder: a stage with `unlocked === false` is gated behind
          // finishing the previous one, and says by how much.
          unlocked: obj(stage).unlocked !== false,
          progress: isObj(obj(stage).progress) ? {
            done: num(obj(stage).progress.done, 0),
            need: num(obj(stage).progress.need, 0),
            label: str(obj(stage).progress.label, ''),
          } : null,
        })).filter(stage => stage.key !== ''),
        trips: arr(d.trips).map(trip => ({
          key: str(obj(trip).key, ''),
          label: str(obj(trip).label, L('目的地')),
          emoji: str(obj(trip).emoji, '🧳'),
          minutes: num(obj(trip).minutes, 0),
          cost: num(obj(trip).cost, 0),
          affordable: obj(trip).affordable === true,
          available: obj(trip).available === true,
        })).filter(trip => trip.key !== ''),
        shop: arr(d.shop).map(item => ({
          key: str(obj(item).key, ''),
          label: str(obj(item).label, L('物品')),
          emoji: str(obj(item).emoji, '📦'),
          price: num(obj(item).price, 0),
          kind: str(obj(item).kind, 'food'),
          tier: typeof obj(item).tier === 'number' ? obj(item).tier : null,
          affordable: obj(item).affordable === true,
          needed: obj(item).needed === true,
          // [ST0012] a decoration already in the wardrobe: not for sale again.
          owned: obj(item).owned === true,
          // [ST0020] a daily-limited item: null when it has no limit.
          dailyLimit: typeof obj(item).dailyLimit === 'number' ? obj(item).dailyLimit : null,
          leftToday: typeof obj(item).leftToday === 'number' ? obj(item).leftToday : null,
          effects: normalizeEffects(item),
        })).filter(item => item.key !== ''),
        inventory: obj(d.inventory),
        // [dsh-piggy-claude-code mod] everything the pig holds, travel-only
        // specialties and rename cards included. `null` = an older host that
        // only sent `inventory`, which the bag tab then reads instead.
        bag: Array.isArray(d.bag) ? d.bag.map(item => ({
          key: str(obj(item).key, ''),
          label: str(obj(item).label, L('物品')),
          emoji: str(obj(item).emoji, '📦'),
          kind: str(obj(item).kind, 'food'),
          count: Math.max(0, Math.floor(num(obj(item).count, 0))),
          exclusive: obj(item).exclusive === true,
          effects: normalizeEffects(item),
        })).filter(item => item.key !== '' && item.count > 0) : null,
        // [dsh-piggy-claude-code mod] the scratch-card counter; null from an older host.
        lottery: isObj(d.lottery) ? {
          price: num(d.lottery.price, 100),
          cooldownMinutes: num(d.lottery.cooldownMinutes, 10),
          waitSeconds: Math.max(0, num(d.lottery.waitSeconds, 0)),
          affordable: d.lottery.affordable === true,
          prizes: arr(d.lottery.prizes).map(prize => ({
            tier: str(obj(prize).tier, ''),
            label: str(obj(prize).label, ''),
            emoji: str(obj(prize).emoji, '🎟️'),
            coins: num(obj(prize).coins, 0),
          })).filter(prize => prize.tier !== ''),
        } : null,
        // [Q0016] the gym; null from an older host.
        gym: isObj(d.gym) ? {
          floorKg: num(d.gym.floorKg, 20),
          muscleKg: num(d.gym.muscleKg, 100),
          lostKg: Math.max(0, num(d.gym.lostKg, 0)),
          muscle: d.gym.muscle === true,
          atFloor: d.gym.atFloor === true,
          classes: arr(d.gym.classes).map(entry => ({
            key: str(obj(entry).key, ''),
            label: str(obj(entry).label, ''),
            emoji: str(obj(entry).emoji, '🏋️'),
            minutes: num(obj(entry).minutes, 0),
            price: num(obj(entry).price, 0),
            lossKg: num(obj(entry).lossKg, 0),
            affordable: obj(entry).affordable === true,
          })).filter(entry => entry.key !== ''),
        } : null,
        // [ST0015] the blackjack table; null from an older host.
        blackjack: isObj(d.blackjack) ? {
          bets: arr(d.blackjack.bets).map(bet => Math.floor(num(bet, 0))).filter(bet => bet > 0),
          standAt: num(d.blackjack.standAt, 18),
          payouts: arr(d.blackjack.payouts).map(row => ({
            total: num(obj(row).total, 0),
            multiplier: num(obj(row).multiplier, 0),
          })).filter(row => row.total > 0),
          hand: normalizeHand(d.blackjack.hand),
        } : null,
        world: normalizeWorld(d.world, L),
        // Which items each care action could spend right now.
        care: (() => {
          const out = {}
          const source = obj(d.care)
          for (const action of ['feed', 'bathe', 'play']) {
            out[action] = arr(source[action]).map(entry => ({
              key: str(obj(entry).key, ''),
              label: str(obj(entry).label, L('物品')),
              emoji: str(obj(entry).emoji, '📦'),
              default: obj(entry).default === true,
              count: typeof obj(entry).count === 'number' ? obj(entry).count : null,
              satiety: num(obj(entry).satiety, 0),
              happiness: num(obj(entry).happiness, 0),
              cleanliness: num(obj(entry).cleanliness, 0),
            })).filter(entry => entry.key !== '')
          }
          return out
        })(),
        activity: isObj(d.activity) ? {
          kind: str(d.activity.kind, 'work'),
          key: str(d.activity.key, ''),
          label: str(d.activity.label, L('外面')),
          emoji: str(d.activity.emoji, '💼'),
          secondsLeft: num(d.activity.secondsLeft, 0),
          progress: num(d.activity.progress, 0),
          stage: str(d.activity.stage, ''),
          region: str(d.activity.region, ''),
        } : null,
        canGoOut: d.canGoOut === true,
        boxStage: isObj(d.boxStage) ? {
          key: str(d.boxStage.key, 'box'),
          label: str(d.boxStage.label, L('纸盒')),
          emoji: str(d.boxStage.emoji, '📦'),
          art: typeof d.boxStage.art === 'string' && d.boxStage.art !== '' ? d.boxStage.art : null,
          size: num(d.boxStage.size, 58),
        } : { key: 'box', label: L('纸盒'), emoji: '📦', size: 58, art: null },
        awayBlocked: typeof d.awayBlocked === 'string' ? d.awayBlocked : null,
        pending: arr(d.pending).filter(e => isObj(e) && typeof e.at === 'number'),
        maxHealth: num(d.maxHealth, 5),
      }
    }

    /**
     * [dsh-piggy-claude-code mod] The travel world, or `null` when the host
     * predates it (the travel tab then falls back to the flat `trips` list).
     */
    function normalizeWorld(raw, L) {
      if (!isObj(raw)) return null
      var regions = arr(raw.regions).map(region => {
        var r = obj(region)
        var perk = isObj(r.perk) ? {
          label: str(r.perk.label, ''),
          emoji: str(r.perk.emoji, '⭐'),
          text: str(r.perk.text, ''),
          active: r.perk.active === true,
        } : null
        return {
          key: str(r.key, ''),
          label: str(r.label, L('地区')),
          emoji: str(r.emoji, '🗺'),
          have: Math.max(0, num(r.have, 0)),
          total: Math.max(0, num(r.total, 0)),
          done: r.done === true,
          reward: arr(r.reward).filter(t => typeof t === 'string' && t !== ''),
          perk: perk !== null && perk.label !== '' ? perk : null,
          places: arr(r.places).map(place => {
            var p = obj(place)
            return {
              key: str(p.key, ''),
              label: str(p.label, L('目的地')),
              emoji: str(p.emoji, '🧳'),
              cost: num(p.cost, 0),
              minutes: num(p.minutes, 0),
              available: p.available === true,
              affordable: p.affordable === true,
              souvenirs: arr(p.souvenirs).map(s => ({
                key: str(obj(s).key, ''),
                label: str(obj(s).label, L('纪念品')),
                emoji: str(obj(s).emoji, '🎁'),
                count: Math.max(0, Math.floor(num(obj(s).count, 0))),
              })).filter(s => s.key !== ''),
            }
          }).filter(p => p.key !== ''),
        }
      }).filter(r => r.key !== '')
      if (regions.length === 0) return null
      var home = obj(raw.home)
      var title = obj(raw.worldTitle)
      var last = isObj(raw.lastTrip) ? raw.lastTrip : null
      return {
        home: {
          utc: typeof home.utc === 'number' && isFinite(home.utc) ? home.utc : null,
          city: str(home.city, str(home.zone, '')),
        },
        regions: regions,
        worldDone: raw.worldDone === true,
        worldTitle: {
          label: str(title.label, L('环球旅行家')),
          emoji: str(title.emoji, '🌍'),
          reward: arr(title.reward).filter(t => typeof t === 'string' && t !== ''),
        },
        lastTrip: last === null ? null : {
          place: str(last.place, L('目的地')),
          emoji: str(last.emoji, '🧳'),
          souvenir: isObj(last.souvenir) ? {
            label: str(last.souvenir.label, L('纪念品')),
            emoji: str(last.souvenir.emoji, '🎁'),
            fresh: last.souvenir.fresh === true,
          } : null,
          loot: arr(last.loot).map(item => ({
            key: str(obj(item).key, ''),
            label: str(obj(item).label, L('物品')),
            emoji: str(obj(item).emoji, '📦'),
            exclusive: obj(item).exclusive === true,
          })).filter(item => item.key !== ''),
          regionDone: str(last.regionDone, null),
          at: num(last.at, 0),
        },
        oldSouvenirs: arr(raw.oldSouvenirs).filter(t => typeof t === 'string' && t !== ''),
        fare: { costPerZone: num(obj(raw.fare).costPerZone, 200), hoursPerZone: num(obj(raw.fare).hoursPerZone, 1) },
      }
    }

    /** [ST0015] A blackjack hand (open, or just settled), or null. */
    function normalizeHand(raw) {
      if (!isObj(raw)) return null
      return {
        bet: Math.max(0, Math.floor(num(raw.bet, 0))),
        cards: arr(raw.cards).map(card => ({ rank: str(obj(card).rank, '?'), suit: str(obj(card).suit, '') })),
        total: num(raw.total, 0),
        soft: raw.soft === true,
        outcome: str(raw.outcome, ''),
        multiplier: num(raw.multiplier, 0),
        coins: Math.max(0, Math.floor(num(raw.coins, 0))),
      }
    }

    /** [dsh-piggy-claude-code mod] What an item does; zeroes from an older host. */
    function normalizeEffects(raw) {
      var item = obj(raw)
      return {
        satiety: num(item.satiety, 0),
        happiness: num(item.happiness, 0),
        cleanliness: num(item.cleanliness, 0),
        cures: arr(item.cures).filter(name => typeof name === 'string' && name !== ''),
      }
    }

    /** The languages the host offers; the full set when it sent none. */
    function normalizeLangs(raw) {
      var out = arr(raw).map(entry => ({
        key: str(obj(entry).key, ''),
        label: str(obj(entry).label, LANG_NAMES[str(obj(entry).key, '')] ?? ''),
      })).filter(entry => LANG_KEYS.indexOf(entry.key) >= 0 && entry.label !== '')
      if (out.length > 0) return out
      return LANG_KEYS.map(key => ({ key: key, label: LANG_NAMES[key] }))
    }

    function normalizeActions(raw) {
      var source = obj(raw)
      var out = {}
      for (var i = 0; i < MODES.length; i += 1) {
        var key = MODES[i]
        var entry = obj(source[key])
        out[key] = {
          ready: entry.ready !== false,
          waitSeconds: num(entry.waitSeconds, 0),
          blocked: typeof entry.blocked === 'string' ? entry.blocked : null,
        }
      }
      return out
    }

    // ---------------------------------------------------------------------
    // Styles — the pig and the cream icon bar mirror the original.
    // ---------------------------------------------------------------------

    var CSS = [
      // ---------------------------------------------------------------------
      // Animal Crossing design language, transcribed from
      // guokaigdg/animal-island-ui docs/design-system (design-tokens.md and the
      // standalone css-variables.md template).
      //
      // The tokens are declared on the widget root rather than :root: the host
      // page must not inherit them, and they must not be clobbered by it.
      //
      // The rules that shape everything below:
      //   · warm earth-brown text on cream parchment, never pure black or grey
      //   · 12px minimum radius; buttons and inputs are 50px pills
      //   · the thick 3D bottom shadow belongs to primary buttons only
      //   · cards carry a border, not an elevation shadow
      //   · motion is 0.15-0.35s on cubic-bezier(.4,0,.2,1)
      //   · focus rings are yellow or teal, never blue
      // ---------------------------------------------------------------------
      '[data-dsh-pig]{',
      '--ac-font:Nunito,"Noto Sans SC",-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;',
      '--ac-primary:#19c8b9;--ac-primary-hover:#3dd4c6;--ac-primary-active:#11a89b;',
      '--ac-primary-bg:#e6f9f6;',
      '--ac-text:#794f27;--ac-text-body:#725d42;--ac-text-2:#9f927d;--ac-text-muted:#8a7b66;',
      '--ac-text-disabled:#c4b89e;',
      '--ac-bg:#f8f8f0;--ac-bg-content:rgb(247,243,223);--ac-bg-input:#fffbe7;',
      '--ac-bg-disabled:#f0ece2;',
      '--ac-border:#c4b89e;--ac-border-light:#e5dcc6;--ac-border-hover:#a89878;',
      '--ac-radius-sm:12px;--ac-radius-card:20px;--ac-pill:50px;',
      '--ac-shadow-sm:0 2px 4px 0 rgba(61,52,40,.06);',
      '--ac-shadow:0 3px 10px 0 rgba(61,52,40,.1);',
      '--ac-shadow-lg:0 8px 24px 0 rgba(61,52,40,.16);',
      '--ac-inset:inset 0 2px 4px rgba(114,93,66,.15);',
      // sidebar tokens: the library uses these for the selected menu row, which
      // is exactly the role the icon bar plays here.
      '--ac-active:#b7c6e5;--ac-hover:#d6dff0;',
      '--ac-success:#6fba2c;--ac-warning:#f5c31c;--ac-error:#e05a5a;',
      '--ac-ease:cubic-bezier(.4,0,.2,1);',
      // One place to size the pig; the scene and the panel cap derive from it.
      '--pig-size:56px;--pig-gap-below:12px;--scene-open:132px;--panel-width:292px;',
      'position:fixed;right:18px;bottom:18px;z-index:2147483000;',
      'font-family:var(--ac-font);font-weight:500;letter-spacing:.01em;',
      '-webkit-user-select:none;user-select:none;touch-action:none;',
      // The wrapper spans a column wider and taller than what it paints (the
      // scene's padding, the gap above the panel). Without this it swallows
      // clicks aimed at the page underneath — which once looked like "sending a
      // message does nothing" while the whole stack was healthy.
      'pointer-events:none;',
      // The pig is the only in-flow child, so the wrapper's box is exactly the
      // pig's box and the panel can be parked anywhere around it without ever
      // nudging the pig. `fitPanel` places the panel.
      'display:block}',
      // Japanese text wants Japanese glyph shapes, not the Simplified Chinese
      // ones Noto Sans SC would draw for the shared kanji.
      '[data-dsh-pig][lang="ja"]{--ac-font:Nunito,"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN",',
      '"Yu Gothic",-apple-system,sans-serif}',
      '[data-dsh-pig] *{box-sizing:border-box}',
      '[data-dsh-pig]>*{pointer-events:auto}',
      // `hidden` MUST win. The UA sheet's `[hidden]{display:none}` ties on
      // specificity with a single class, so any `.dp-x{display:grid|flex}` rule
      // below silently beats it and the element keeps rendering. That is exactly
      // how a collapsed panel ended up showing the icon bar and the hud while
      // every `el.hidden === true` assertion still passed.
      '[data-dsh-pig] .dp-card[hidden],[data-dsh-pig] .dp-bar[hidden],',
      '[data-dsh-pig] .dp-content[hidden],[data-dsh-pig] .dp-hud[hidden],',
      '[data-dsh-pig] .dp-bubble[hidden],[data-dsh-pig] .dp-scene[hidden],',
      '[data-dsh-pig] .dp-work[hidden],[data-dsh-pig] .dp-soul[hidden],',
      '[data-dsh-pig] .dp-poke-hint[hidden],',
      '[data-dsh-pig] .dp-pig-img[hidden],[data-dsh-pig] .dp-pig-emoji[hidden]{display:none}',

      /* ---------- the panel: cream parchment, border not shadow ---------- */
      // Taken out of flow on purpose. In flow it would widen the wrapper, and a
      // wider wrapper moves the pig — the exact thing this layout exists to
      // prevent. Absolutely positioned, the wrapper's box stays the pig's box
      // and `fitPanel` can put the panel on whichever side has room.
      '.dp-card{position:absolute;right:0;bottom:calc(100% + 8px);width:var(--panel-width);',
      'border-radius:var(--ac-radius-card);overflow:hidden;',
      'display:flex;flex-direction:column;',
      'background:var(--ac-bg);border:2px solid var(--ac-border-light);',
      'box-shadow:var(--ac-shadow-lg);color:var(--ac-text-body)}',

      /* ---------- the pig: never moved, never boxed ---------- */
      // [dsh-piggy-claude-code mod] a heavy pig (up to 400 px) needs a taller
      // scene, with room above it for the hud and the speech bubble.
      '.dp-scene{position:relative;height:max(var(--scene-open),calc(var(--pig-size) + var(--pig-gap-below) + 72px));background:none;cursor:grab;',
      'overflow:visible;display:flex;align-items:flex-end;justify-content:flex-end;',
      'padding:0 6px var(--pig-gap-below);width:max-content}',
      '.dp-scene[data-dragging="true"]{cursor:grabbing}',
      // Collapsed the scene is exactly the pig, so the wrapper paints nothing
      // extra to click through. Open it widens to the panel so the hud and the
      // speech bubble have somewhere to sit — the pig is right-aligned either
      // way, so widening costs it no movement.
      '[data-dsh-pig][data-open="true"] .dp-scene{width:var(--panel-width)}',
      // Collapsed the scene shrinks to just the pig. An explicit height rather
      // than `auto` keeps the pig's line box identical in both states, so
      // opening moves it by exactly zero pixels.
      '[data-dsh-pig][data-open="false"] .dp-scene{height:calc(var(--pig-size) + var(--pig-gap-below));',
      'cursor:pointer}',
      '.dp-pig{line-height:1;transform-origin:50% 85%;cursor:pointer;',
      'filter:drop-shadow(0 4px 6px rgba(61,52,40,.28));animation:dp-bob 1.8s ease-in-out infinite}',
      '[data-dsh-pig][data-open="false"] .dp-pig{filter:drop-shadow(0 5px 9px rgba(61,52,40,.26))}',
      // A petting hand rather than an arrow. Drawn inline as an SVG data URI so
      // it needs no asset and can carry the palette's warm outline; the hotspot
      // sits in the palm, which is where a pat actually lands. The `pointer`
      // after it is the fallback for browsers that refuse a custom cursor.
      '.dp-pig{cursor:url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" '
        + 'width="30" height="30" viewBox="0 0 30 30"><g fill="%23F7C9B6" stroke="%23794F27" '
        + 'stroke-width="1.7" stroke-linejoin="round"><rect x="10" y="13.5" width="14" height="12" '
        + 'rx="4.8"/><rect x="10.6" y="6.6" width="3.6" height="10" rx="1.8"/><rect x="14.9" '
        + 'y="5.1" width="3.6" height="11.5" rx="1.8"/><rect x="19.2" y="6.6" width="3.6" '
        + 'height="10" rx="1.8"/><rect x="5.7" y="12.4" width="3.4" height="7.8" rx="1.7" '
        + 'transform="rotate(-27 7.4 16.3)"/></g></svg>\') 16 24, pointer}',
      // Transform-only keyframes: the pig is an ordinary flex item, so there is
      // no translateX(-50%) centring to preserve.
      '@keyframes dp-bob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-7px) rotate(-2.5deg)}}',
      '@keyframes dp-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(1px) scale(1.09)}}',
      '@keyframes dp-shake{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-4px) rotate(-5deg)}60%{transform:translateX(4px) rotate(5deg)}}',
      '@keyframes dp-squash{0%{transform:scale(1,1)}25%{transform:scale(1.28,.74)}55%{transform:scale(.92,1.14)}100%{transform:scale(1,1)}}',
      '@keyframes dp-spin{0%{transform:rotate(0)}50%{transform:rotate(180deg) scale(1.2)}100%{transform:rotate(360deg)}}',
      '@keyframes dp-jump{0%{transform:translateY(0)}30%{transform:translateY(-26px) scale(1.12)}60%{transform:translateY(0) scale(.92)}100%{transform:translateY(0)}}',
      '@keyframes dp-wobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-14deg)}55%{transform:rotate(14deg)}}',
      '@keyframes dp-cough{0%,100%{transform:translateX(0)}30%{transform:translateX(-4px) rotate(-7deg)}70%{transform:translateX(4px) rotate(6deg)}}',
      '.dp-pig[data-mood="happy"]{animation-duration:1.15s}',
      '.dp-pig[data-mood="sleepy"]{animation-name:dp-breathe;animation-duration:3.6s}',
      '.dp-pig[data-mood="asleep"]{animation-name:dp-breathe;animation-duration:4.4s}',
      '.dp-pig[data-mood="hungry"]{animation-name:dp-shake;animation-duration:2.4s}',
      '.dp-pig[data-mood="dirty"]{animation-name:dp-breathe;animation-duration:2.6s;filter:sepia(.4) drop-shadow(0 4px 6px rgba(61,52,40,.28))}',
      '.dp-pig[data-mood="sick"]{animation-name:dp-cough;animation-duration:2.2s;filter:hue-rotate(-28deg) saturate(.75) drop-shadow(0 4px 6px rgba(61,52,40,.28))}',
      // One pose per activity, so being away reads as a thing the pig is doing.
      '@keyframes dp-typing{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-2px) rotate(-1.5deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-2px) rotate(1.5deg)}}',
      '@keyframes dp-reading{0%,100%{transform:translateY(0) rotate(0)}35%{transform:translateY(1px) rotate(-5deg)}70%{transform:translateY(1px) rotate(-2deg)}}',
      '@keyframes dp-walking{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-6px) rotate(-4deg)}50%{transform:translateY(0) rotate(0)}75%{transform:translateY(-6px) rotate(4deg)}}',
      '.dp-pig[data-mood="working"]{animation-name:dp-typing;animation-duration:.7s}',
      '.dp-pig[data-mood="studying"]{animation-name:dp-reading;animation-duration:2.4s}',
      '.dp-pig[data-mood="traveling"]{animation-name:dp-walking;animation-duration:1s}',
      '.dp-pig[data-mood="dead"]{animation:none;filter:grayscale(1)}',
      '.dp-pig[data-react]{animation-duration:.85s;animation-iteration-count:1}',
      '.dp-pig[data-react="feed"]{animation-name:dp-jump}',
      '.dp-pig[data-react="bathe"]{animation-name:dp-wobble;animation-duration:1.05s}',
      '.dp-pig[data-react="play"]{animation-name:dp-spin;animation-duration:.9s}',
      '.dp-pig[data-react="pet"]{animation-name:dp-squash;animation-duration:.6s}',
      '.dp-pig[data-react="away"]{animation-name:dp-jump;animation-duration:.9s}',
      '.dp-pig[data-react="cure"]{animation-name:dp-spin;animation-duration:.9s}',
      '.dp-pig[data-react="levelup"]{animation-name:dp-jump;animation-duration:.95s}',
      '.dp-pig[data-react="refuse"]{animation-name:dp-shake;animation-duration:.5s}',
      '.dp-pig[data-react="scratch"]{animation-name:dp-wobble;animation-duration:.5s;animation-iteration-count:3}',
      '.dp-pig[data-react="jackpot"]{animation-name:dp-spin;animation-iteration-count:2}',
      '.dp-pig[data-react="win"]{animation-name:dp-jump;animation-iteration-count:2}',
      '.dp-pig[data-react="lose"]{animation-name:dp-shake;animation-duration:1.2s}',

      /* ---------- what the pig is off doing ---------- */
      '[data-dsh-pig] .dp-work{display:flex;flex-direction:column;align-items:center;gap:4px;',
      'margin:0 2px 6px 0}',
      '.dp-prop{font-size:26px;line-height:1;filter:drop-shadow(0 3px 5px rgba(61,52,40,.22));',
      'animation:dp-prop-bob 2.4s ease-in-out infinite}',
      '[data-dsh-pig][data-away="study"] .dp-prop{animation-duration:3.4s}',
      '[data-dsh-pig][data-away="trip"] .dp-prop{animation-name:dp-prop-swing;animation-duration:1.6s}',
      '@keyframes dp-prop-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-3px) rotate(3deg)}}',
      '@keyframes dp-prop-swing{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-4px) rotate(8deg)}}',
      '.dp-progress{width:42px;height:7px;border-radius:var(--ac-pill);background:var(--ac-bg-disabled);',
      'box-shadow:var(--ac-inset);overflow:hidden}',
      '.dp-progress i{display:block;height:100%;border-radius:var(--ac-pill);',
      'background:var(--ac-primary);transition:width .5s var(--ac-ease)}',
      // The scene needs room for the prop; it grows leftward, so the pig stays put.
      '[data-dsh-pig][data-away="work"] .dp-scene,[data-dsh-pig][data-away="study"] .dp-scene,',
      '[data-dsh-pig][data-away="trip"] .dp-scene{width:max-content;min-width:132px}',

      /* ---------- hud: a cream tag beside the pig ---------- */
      '.dp-hud{position:absolute;left:9px;top:7px;display:flex;flex-direction:column;gap:1px;',
      'font-size:10.5px;font-weight:600;line-height:1.45;color:var(--ac-text);',
      'background:var(--ac-bg);border:2px solid var(--ac-border-light);padding:5px 10px;',
      'border-radius:var(--ac-radius-sm);box-shadow:var(--ac-shadow-sm)}',
      '.dp-hud b{font-weight:700}',

      // A drawn sprite is sized by the same variable as the emoji, so growing up
      // works identically either way.
      '.dp-pig-img{width:var(--pig-size);height:var(--pig-size);display:block;',
      '-webkit-user-drag:none;user-select:none;',
      // Putting on weight is gradual, so is the sprite: --pig-size steps, the
      // pig eases into it.
      'transition:width .8s var(--ac-ease),height .8s var(--ac-ease)}',
      '@media (prefers-reduced-motion:reduce){.dp-pig-img,.dp-pig-emoji{transition:none}}',
      '.dp-pig-emoji{font-size:var(--pig-size);line-height:1;transition:font-size .8s var(--ac-ease)}',
      // [ST0014] pen mates beside our pig: smaller, bobbing out of step, named.
      '.dp-friends{display:flex;align-items:flex-end;gap:8px;margin:0 8px 0 0}',
      '[data-dsh-pig] .dp-friends[hidden]{display:none}',
      '.dp-friend{display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default;',
      'filter:drop-shadow(0 3px 5px rgba(61,52,40,.22));animation:dp-bob 2.3s ease-in-out infinite}',
      '.dp-friend:nth-child(2n){animation-delay:-.9s}',
      '.dp-friend[data-faded="true"]{opacity:.78}',
      '.dp-friend-img{width:var(--friend-size);height:var(--friend-size);display:block}',
      '.dp-friend-emoji{font-size:var(--friend-size);line-height:1}',
      '.dp-friend-name{font-size:9.5px;font-weight:700;color:var(--ac-text-2);background:rgba(255,250,235,.88);',
      'border-radius:999px;padding:0 6px;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dp-pen-eye[aria-pressed="false"]{opacity:.62}',
      '.dp-pen-show{margin-top:6px}',
      '.dp-pen-area{margin-top:6px}',
      // [ST0026] the desk's pen: a click-through yard in a window of its own,
      // pen mates roaming in it. Each one is a box placed by script, a face
      // that mirrors it when heading right, and a body that does the move.
      '.dp-yard{position:fixed;inset:0;pointer-events:none;overflow:hidden;--ac-text-2:#9f927d;',
      'font-family:Nunito,"Noto Sans SC",-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;font-weight:500}',
      '.dp-yard-fence{position:absolute;inset:3px;border:2px dashed rgba(150,110,70,.3);border-radius:18px}',
      '.dp-yard-fence[hidden]{display:none}',
      '.dp-roamer{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;',
      'filter:drop-shadow(0 3px 5px rgba(61,52,40,.22));will-change:transform}',
      '.dp-roamer[hidden]{display:none}',
      '.dp-roamer[data-faded="true"]{opacity:.78}',
      '.dp-roamer-face{transition:transform .18s}',
      '.dp-roamer-body{transform-origin:50% 60%}',
      '.dp-roamer[data-move="walk"] .dp-roamer-body{animation:dp-yard-trot .5s ease-in-out infinite}',
      '.dp-roamer[data-move="dash"] .dp-roamer-body{animation:dp-yard-trot .26s ease-in-out infinite}',
      // 横向: head over heels across the pen. 纵向: over onto its back and up again, up or down the pen.
      '.dp-roamer[data-move="roll-x"] .dp-roamer-body{animation:dp-yard-roll .7s linear infinite}',
      '.dp-roamer[data-move="roll-y"] .dp-roamer-body{animation:dp-yard-tumble .8s linear infinite}',
      // Sitting rocks back onto its haunches (the pig faces left, so the right edge is its rump).
      '.dp-roamer[data-move="sit"] .dp-roamer-body{transform-origin:85% 100%;animation:dp-yard-sit 2.6s ease-in-out infinite}',
      '.dp-roamer[data-move="lie"] .dp-roamer-body{transform-origin:50% 100%;animation:dp-yard-lie 3.6s ease-in-out infinite}',
      '.dp-roamer[data-move="belly"] .dp-roamer-body{transform-origin:50% 50%;animation:dp-yard-belly 1.1s ease-in-out infinite}',
      '@keyframes dp-yard-trot{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '@keyframes dp-yard-roll{0%{transform:rotate(0deg)}100%{transform:rotate(-360deg)}}',
      '@keyframes dp-yard-tumble{0%{transform:scaleY(1)}25%{transform:scaleY(0)}50%{transform:scaleY(-1)}75%{transform:scaleY(0)}100%{transform:scaleY(1)}}',
      '@keyframes dp-yard-sit{0%,100%{transform:rotate(14deg)}50%{transform:rotate(17deg)}}',
      '@keyframes dp-yard-lie{0%,100%{transform:scale(1.06,.74)}50%{transform:scale(1.08,.71)}}',
      '@keyframes dp-yard-belly{0%,100%{transform:rotate(180deg)}50%{transform:rotate(172deg)}}',
      // A drawn sprite animates itself (CSS inside the SVG), so the mood bob,
      // the sepia/hue filters and the reaction spin would only fight it.
      '[data-dsh-pig]:not([data-poke]) .dp-pig[data-art]:not([data-react]),',
      '.dp-pig[data-art][data-react-art]{animation:none}',
      '.dp-pig[data-art][data-mood]{filter:drop-shadow(0 4px 6px rgba(61,52,40,.28))}',

      // No drawings yet — every stage is the same 🐖, so age reads as size plus
      // a faded coat on the last one.
      '[data-dsh-pig][data-faded="true"] .dp-pig-emoji{filter:grayscale(.5) opacity(.72)}',

      // The box advertises itself: a slow breathing glow plus a label, so it
      // does not read as scenery.
      '[data-dsh-pig][data-unhatched="true"] .dp-pig{cursor:pointer;',
      'animation:dp-box-breathe 2.4s ease-in-out infinite}',
      '[data-dsh-pig][data-unhatched="true"] .dp-pig-emoji{',
      'filter:drop-shadow(0 0 0 rgba(255,214,102,0)) drop-shadow(0 4px 6px rgba(61,52,40,.28))}',
      '@keyframes dp-box-breathe{0%,100%{transform:translateY(0) scale(1)}',
      '50%{transform:translateY(-3px) scale(1.06)}}',
      '.dp-poke-hint{position:absolute;right:2px;bottom:-2px;display:flex;align-items:center;gap:3px;',
      'font-size:9.5px;font-weight:700;color:var(--ac-text);background:var(--ac-bg);',
      'border:1.5px solid var(--ac-border-light);border-radius:var(--ac-pill);padding:1px 7px;',
      'box-shadow:0 2px 0 rgba(61,52,40,.12);pointer-events:none;white-space:nowrap;z-index:3;',
      'animation:dp-hint-bob 1.6s ease-in-out infinite}',
      '@keyframes dp-hint-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
      // Each poke shakes it harder; the third one opens it instead.
      '[data-dsh-pig] .dp-pig[data-mood="poke"],',
      '[data-dsh-pig][data-poke] .dp-pig{animation-name:dp-poke-shake}',
      '[data-dsh-pig][data-poke="2"] .dp-pig{animation-duration:.28s}',
      '@keyframes dp-poke-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}',
      '50%{transform:rotate(6deg)}75%{transform:rotate(-4deg)}}',

      /* ---------- developer tab ---------- */
      '.dp-dev-note{font-size:10px;color:var(--ac-text-2);margin:4px 0 2px;line-height:1.5}',
      '.dp-dev-row{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 2px}',
      '.dp-dev-btn{flex:0 0 auto;font-size:10px;padding:3px 8px}',
      '[data-dsh-pig][data-dev="true"] .dp-ico[data-tab="dev"]{color:var(--ac-primary)}',

      /* ---------- the soul that settles on an unclaimed grave ---------- */
      '.dp-soul{position:absolute;left:50%;transform:translateX(-50%);top:-14px;width:34px;height:34px;',
      'line-height:1;opacity:.9;pointer-events:none;z-index:1;',
      'animation:dp-haunt 3.4s ease-in-out infinite}',
      '@keyframes dp-haunt{0%,100%{transform:translate(-50%,0) scale(1);opacity:.75}',
      '50%{transform:translate(-50%,-9px) scale(1.08);opacity:1}}',
      // A grave does not bob about like a living pig.
      '.dp-pig[data-stage="grave"]{animation:none;filter:grayscale(.35) drop-shadow(0 4px 6px rgba(61,52,40,.3))}',
      '.dp-pig[data-stage="box"]{animation:dp-box-wobble 3.2s ease-in-out infinite}',
      '@keyframes dp-box-wobble{0%,100%{transform:rotate(0)}30%{transform:rotate(-4deg)}',
      '45%{transform:rotate(3deg)}60%{transform:rotate(-2deg)}}',

      /* ---------- speech bubble ---------- */
      // `z-index` matters: the pig comes later in the DOM, so without it the pig
      // paints over the bubble whenever the two boxes overlap — which is exactly
      // what happened when collapsed and the scene was only as wide as the pig.
      '.dp-bubble{position:absolute;right:8px;top:7px;z-index:2;max-width:162px;padding:6px 10px;',
      'border-radius:var(--ac-radius-sm);font-size:10.5px;font-weight:600;line-height:1.45;',
      'color:var(--ac-text-body);background:var(--ac-bg-input);',
      'border:2px solid var(--ac-border-light);box-shadow:var(--ac-shadow-sm)}',
      // Tail drawn as a small rotated square so the 2px border stays continuous.
      '.dp-bubble::after{content:"";position:absolute;left:14px;bottom:-6px;width:8px;height:8px;',
      'background:var(--ac-bg-input);border-right:2px solid var(--ac-border-light);',
      'border-bottom:2px solid var(--ac-border-light);transform:rotate(45deg)}',
      // Collapsed, the scene is exactly the pig, so a bubble drawn inside it
      // would sit on the pig's face. Float it above the head with the tail
      // pointing down, anchored to the right edge so it can never run off the
      // window. The hearts rise from behind it.
      '[data-dsh-pig][data-open="false"] .dp-bubble{top:auto;bottom:calc(100% + 8px);',
      'left:auto;right:0;max-width:230px}',
      '[data-dsh-pig][data-open="false"] .dp-bubble::after{left:auto;right:26px;',
      'top:100%;bottom:auto;margin:0;transform:rotate(45deg);',
      'border:0;border-right:2px solid var(--ac-border-light);',
      'border-bottom:2px solid var(--ac-border-light)}',

      /* ---------- icon bar: the library sidebar, laid on its side ---------- */
      // [ST0014] one row however many tabs there are (six, 在线, 调试).
      '.dp-bar{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;padding:8px;',
      'background:var(--ac-bg-content);border-top:2px solid var(--ac-border-light);',
      'border-bottom:2px solid var(--ac-border-light)}',
      '.dp-ico{display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;',
      'font:inherit;font-size:9.5px;font-weight:600;color:var(--ac-text-muted);background:none;',
      'border:2px solid transparent;border-radius:var(--ac-radius-sm);padding:5px 1px;',
      'transition:all .2s var(--ac-ease)}',
      '.dp-ico span.dp-ico-e{font-size:18px;line-height:1}',
      '.dp-ico:hover{background:var(--ac-hover)}',
      '.dp-ico[data-active="true"]{background:var(--ac-active);border-color:#9db0d6;',
      'color:var(--ac-text);font-weight:700}',
      '.dp-ico:focus-visible{outline:2px solid var(--ac-primary);outline-offset:1px}',
      '@keyframes dp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
      '.dp-ico[data-alert="true"] span.dp-ico-e{animation:dp-pulse 1.4s ease-in-out infinite}',

      /* ---------- content ---------- */
      '.dp-content{padding:12px 13px 13px;overflow-y:auto;flex:1 1 auto;min-height:0}',
      '.dp-content::-webkit-scrollbar{width:8px}',
      '.dp-content::-webkit-scrollbar-thumb{background:var(--ac-border-light);border-radius:4px}',
      '.dp-content::-webkit-scrollbar-track{background:transparent}',
      '.dp-title{display:flex;justify-content:space-between;align-items:baseline;font-size:11px;',
      'margin-bottom:8px}',
      '.dp-title b{font-weight:700;color:var(--ac-text)}',
      '.dp-title span{color:var(--ac-text-2);font-size:10.5px;font-weight:600}',
      '.dp-row{display:flex;justify-content:space-between;font-size:11px;font-weight:600;',
      'color:var(--ac-text-body);margin:2px 0}',
      '.dp-row b{font-weight:700;color:var(--ac-text)}',

      /* ---------- attribute bars: pill track with an inset well ---------- */
      '.dp-meter{height:9px;border-radius:var(--ac-pill);background:var(--ac-bg-disabled);',
      'box-shadow:var(--ac-inset);overflow:hidden;margin:3px 0 8px}',
      '.dp-meter i{display:block;height:100%;border-radius:var(--ac-pill);',
      'background:var(--ac-warning);transition:width .35s var(--ac-ease)}',
      '.dp-meter.dp-mood i{background:#f8a6b2}',
      '.dp-meter.dp-clean i{background:#82d5bb}',
      '.dp-meter.dp-health i{background:#8ac68a}',
      '.dp-traits{display:flex;gap:10px;font-size:10.5px;font-weight:600;color:var(--ac-text-2);',
      'margin:8px 0 3px}',

      /* ---------- banners ---------- */
      '.dp-alert{margin:0 0 9px;padding:8px 10px;border-radius:var(--ac-radius-sm);',
      'font-size:10.5px;font-weight:600;line-height:1.55;border:2px solid}',
      '.dp-alert b{font-weight:700;color:var(--ac-text)}',
      '.dp-alert.dp-sick{background:#fdeeee;border-color:#f2c2c2}',
      '.dp-alert.dp-work{background:#eef1fb;border-color:#c3cdf0}',
      '.dp-alert.dp-sleep{background:#f1effb;border-color:#d3cdef}',
      '.dp-alert.dp-dead{background:var(--ac-bg-disabled);border-color:var(--ac-border-light)}',
      '.dp-alert.dp-legacy{background:#fdf7e2;border-color:#f0dfa8}',
      // [ST0007] a new version, and the version row under the languages.
      '.dp-alert.dp-update{background:#e9f6ef;border-color:#b9e0c8}',
      '.dp-alert.dp-update .dp-actions{margin-top:6px}',
      '.dp-alert.dp-update .dp-progress{width:100%;height:9px;margin-top:5px}',
      '.dp-update-notes{white-space:pre-line;max-height:5.6em;overflow:hidden}',
      // The button never breaks; in a narrow column it moves under the text.
      '.dp-version{align-items:center;flex-wrap:wrap;margin-top:8px;gap:4px 6px}',
      '.dp-version span{flex:1 1 9em;min-width:0}',
      '.dp-version .dp-mini{flex:none;white-space:nowrap}',

      /* ---------- buttons: secondary is a cream pill with soft elevation ---- */
      '.dp-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}',
      '.dp-btn{display:flex;align-items:center;justify-content:center;gap:5px;font:inherit;',
      'font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--ac-text-body);',
      'cursor:pointer;padding:8px 6px;border-radius:var(--ac-pill);',
      'border:2px solid var(--ac-border);background:var(--ac-bg-input);',
      'box-shadow:var(--ac-shadow-sm);transition:all .2s var(--ac-ease)}',
      '.dp-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:var(--ac-shadow);',
      'border-color:var(--ac-border-hover)}',
      '.dp-btn:active:not(:disabled){transform:translateY(2px);box-shadow:var(--ac-shadow-sm)}',
      '.dp-btn:focus-visible{outline:2px solid var(--ac-primary);outline-offset:1px}',
      '.dp-btn:disabled{background:var(--ac-bg-disabled);color:var(--ac-text-disabled);',
      'border-color:var(--ac-border-light);box-shadow:none;cursor:not-allowed}',
      '.dp-btn-wide{grid-column:1/-1}',
      '.dp-btn .dp-wait{color:var(--ac-text-2);font-size:10px;font-weight:600}',

      /* ---------- segmented control ---------- */
      '.dp-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}',
      '.dp-seg button{font:inherit;font-size:10.5px;font-weight:600;color:var(--ac-text-muted);',
      'cursor:pointer;padding:6px 2px;border-radius:var(--ac-pill);',
      'border:2px solid var(--ac-border-light);background:var(--ac-bg-input);',
      'transition:all .2s var(--ac-ease)}',
      '.dp-seg button:hover{background:var(--ac-hover)}',
      '.dp-seg button[data-active="true"]{background:var(--ac-active);border-color:#9db0d6;',
      'color:var(--ac-text);font-weight:700}',

      /* ---------- list rows ---------- */
      // minmax(0,…): a long caption must shrink (ellipsis), not push the grid past the panel.
      '.dp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}',
      '.dp-grid>.dp-item{min-width:0}',
      '.dp-list{display:flex;flex-direction:column;gap:7px}',
      '.dp-shelf{margin:9px 0 1px;font-size:10px;font-weight:700;color:var(--ac-text-2);',
      'letter-spacing:.04em}',
      '.dp-shelf:first-child{margin-top:0}',
      '.dp-item{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;',
      'color:var(--ac-text-body);padding:7px 9px;border-radius:var(--ac-radius-sm);',
      'background:var(--ac-bg-content);border:2px solid var(--ac-border-light)}',
      '.dp-item .dp-grow{flex:1;min-width:0}',
      '.dp-item .dp-dim{color:var(--ac-text-2);font-size:10px;font-weight:500;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.dp-item.dp-wanted{background:#fdf7e2;border-color:var(--ac-warning)}',

      /* ---------- primary buttons: teal pill with the game 3D bottom edge --- */
      '.dp-mini{font:inherit;font-size:10.5px;font-weight:700;letter-spacing:.02em;color:#fff;',
      'cursor:pointer;padding:6px 13px;border-radius:var(--ac-pill);',
      'border:2px solid var(--ac-primary-active);background:var(--ac-primary);',
      'box-shadow:0 3px 0 0 var(--ac-primary-active);transition:all .15s var(--ac-ease)}',
      '.dp-mini:hover:not(:disabled){background:var(--ac-primary-hover);transform:translateY(-1px);',
      'box-shadow:0 4px 0 0 var(--ac-primary-active)}',
      '.dp-mini:active:not(:disabled){transform:translateY(2px);',
      'box-shadow:0 1px 0 0 var(--ac-primary-active)}',
      '.dp-mini:focus-visible{outline:2px solid var(--ac-primary);outline-offset:2px}',
      '.dp-mini:disabled{background:var(--ac-bg-disabled);color:var(--ac-text-disabled);',
      'border-color:var(--ac-border-light);box-shadow:none;cursor:not-allowed}',

      /* ---------- the care item picker ---------- */
      '.dp-pick{margin-top:9px;padding:9px 10px;border-radius:var(--ac-radius-sm);',
      'background:var(--ac-bg-content);border:2px solid var(--ac-border-light)}',
      '.dp-pick-head{font-size:10.5px;font-weight:700;color:var(--ac-text);margin-bottom:7px}',
      '.dp-cancel{display:block;width:100%;margin-top:8px;font:inherit;font-size:10.5px;',
      'font-weight:600;color:var(--ac-text-2);cursor:pointer;padding:5px;',
      'border-radius:var(--ac-pill);border:2px solid var(--ac-border-light);',
      'background:var(--ac-bg-input);transition:all .2s var(--ac-ease)}',
      '.dp-cancel:hover{background:var(--ac-hover);color:var(--ac-text)}',
      '.dp-count{margin-left:2px;font-size:9px;font-weight:700;color:var(--ac-text-2);',
      'background:var(--ac-bg-content);border-radius:var(--ac-pill);padding:0 5px}',
      '.dp-btn[data-open-picker="true"]{background:var(--ac-active);border-color:#9db0d6}',
      '.dp-wear .dp-btn[aria-pressed="true"],',
      '.dp-wear-head .dp-mini[aria-pressed="true"],',
      '.dp-langs .dp-btn[aria-pressed="true"]{background:var(--ac-active);border-color:#9db0d6}',
      // [dsh-piggy-claude-code mod] the language switcher: one pill per language.
      '.dp-langs{grid-template-columns:repeat(3,1fr);margin-top:4px}',
      // [ST0004] the wardrobe: four pills a row, locked ones dashed and greyed.
      '.dp-wear-head{align-items:center}',
      '.dp-wear{grid-template-columns:repeat(4,1fr);margin-top:6px}',
      '.dp-wear .dp-btn{padding:6px 2px;font-size:10px;flex-direction:column;gap:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dp-wear .dp-btn[data-locked="true"]{border-style:dashed;color:var(--ac-text-disabled);background:var(--ac-bg-disabled);cursor:not-allowed}',
      '.dp-langs .dp-btn{padding:6px 4px}',
      '.dp-seg button[data-locked="true"]{color:var(--ac-text-disabled);',
      'border-style:dashed;background:var(--ac-bg-disabled)}',
      '.dp-seg button[data-locked="true"]:hover{background:var(--ac-bg-disabled)}',
      '.dp-locked{margin:0 0 8px;font-size:10.5px;font-weight:600;line-height:1.5;',
      'color:var(--ac-text-body);background:#fdf7e2;border:2px solid #f0dfa8;',
      'border-radius:var(--ac-radius-sm);padding:6px 9px}',

      /* ---------- [dsh-piggy-claude-code mod] naming ---------- */
      '.dp-name{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:12px;font-weight:700;',
      'color:var(--ac-text)}',
      '.dp-name .dp-grow{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.dp-icon-btn{flex:0 0 auto;font:inherit;font-size:12px;line-height:1;cursor:pointer;padding:4px 7px;',
      'border-radius:var(--ac-pill);border:2px solid var(--ac-border-light);background:var(--ac-bg-input);',
      'transition:all .2s var(--ac-ease)}',
      '.dp-icon-btn:hover{background:var(--ac-hover)}',
      '.dp-icon-btn[aria-expanded="true"]{background:var(--ac-active);border-color:#9db0d6}',
      '.dp-icon-btn:focus-visible{outline:2px solid var(--ac-primary);outline-offset:1px}',
      '.dp-rename{margin:0 0 9px;padding:8px 9px;border-radius:var(--ac-radius-sm);',
      'background:var(--ac-bg-content);border:2px solid var(--ac-border-light)}',
      '.dp-rename-row{display:flex;align-items:center;gap:6px;margin-top:6px}',
      '.dp-rename-row .dp-btn{padding:5px 9px;white-space:nowrap}',
      '.dp-rename-row .dp-mini{white-space:nowrap}',
      // The widget is user-select:none; a text field must still be editable.
      '.dp-input{flex:1 1 auto;min-width:0;font:inherit;font-size:11px;font-weight:600;color:var(--ac-text);',
      'padding:6px 10px;border-radius:var(--ac-pill);border:2px solid var(--ac-border);',
      'background:var(--ac-bg-input);box-shadow:var(--ac-inset);-webkit-user-select:text;user-select:text}',
      '.dp-input::placeholder{color:var(--ac-text-disabled)}',
      '.dp-input:focus{outline:none;border-color:var(--ac-warning)}',
      '.dp-note{font-size:10px;font-weight:600;color:var(--ac-text-2);line-height:1.5;overflow-wrap:anywhere}',
      '.dp-tag{display:inline-block;margin-left:4px;font-size:9px;font-weight:700;line-height:1.5;',
      'color:#8a5a00;background:#fdf0c2;border-radius:var(--ac-pill);padding:0 6px;white-space:nowrap}',
      '.dp-badge{display:inline-block;margin:0 0 7px;font-size:10.5px;font-weight:700;color:var(--ac-text);',
      'background:#fdf0c2;border:2px solid #f0dfa8;border-radius:var(--ac-pill);padding:2px 9px}',
      '.dp-link{display:block;width:100%;margin-top:10px;font:inherit;font-size:10.5px;font-weight:600;',
      'text-align:left;color:var(--ac-text-muted);cursor:pointer;padding:6px 9px;',
      'border-radius:var(--ac-radius-sm);border:2px dashed var(--ac-border-light);background:none}',
      '.dp-link:hover{background:var(--ac-hover);color:var(--ac-text)}',

      /* ---------- study: several subjects in one sitting ---------- */
      '.dp-seg.dp-seg-2{grid-template-columns:repeat(2,1fr)}',
      '.dp-item[aria-pressed="true"]{background:var(--ac-active);border-color:#9db0d6}',
      '.dp-item[aria-pressed="true"] .dp-check{color:var(--ac-text)}',
      '.dp-check{flex:0 0 auto;font-size:10px;line-height:1;color:var(--ac-text-disabled)}',
      '.dp-study-go{margin-top:9px}',

      /* ---------- travel: home, last trip, regions as an accordion ---------- */
      '.dp-alert.dp-trip{background:#eef8ec;border-color:#c5e4bc}',
      '.dp-alert .dp-line{margin-top:2px;overflow-wrap:anywhere}',
      '.dp-region{margin-top:6px;border-radius:var(--ac-radius-sm);border:2px solid var(--ac-border-light);',
      'background:var(--ac-bg-content);overflow:hidden}',
      '.dp-region[data-done="true"]{border-color:#c5e4bc}',
      '.dp-region-head{display:flex;align-items:center;gap:6px;width:100%;font:inherit;font-size:11px;',
      'font-weight:700;color:var(--ac-text);text-align:left;cursor:pointer;padding:7px 9px;',
      'background:none;border:0;transition:background .2s var(--ac-ease)}',
      '.dp-region-head:hover{background:var(--ac-hover)}',
      '.dp-region-head:focus-visible{outline:2px solid var(--ac-primary);outline-offset:-2px}',
      '.dp-region-head .dp-grow{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.dp-region-head .dp-caret{flex:0 0 auto;width:10px;color:var(--ac-text-2);font-size:9px}',
      '.dp-region-head .dp-have{flex:0 0 auto;font-size:10px;font-weight:600;color:var(--ac-text-2)}',
      '.dp-region-body{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px}',
      '.dp-perk{font-size:10px;font-weight:600;line-height:1.5;color:var(--ac-text-muted);overflow-wrap:anywhere}',
      '.dp-perk[data-active="true"]{color:#3f7d1a}',
      '.dp-region-body .dp-item{padding:5px 7px;gap:6px;background:var(--ac-bg)}',
      '.dp-region-body .dp-item .dp-grow div:first-child{overflow-wrap:anywhere}',
      '.dp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}',
      '.dp-chip{font-size:10px;font-weight:600;line-height:1.5;padding:1px 7px;border-radius:var(--ac-pill);',
      'color:var(--ac-text-body);background:var(--ac-bg-input);border:1.5px solid var(--ac-border-light);',
      'overflow-wrap:anywhere;max-width:100%}',
      '.dp-chip[data-have="false"]{color:var(--ac-text-disabled);background:var(--ac-bg-disabled);border-style:dashed}',
      '.dp-world{display:flex;align-items:center;gap:6px;margin-top:10px;padding:7px 9px;',
      'font-size:11px;font-weight:700;color:var(--ac-text);border-radius:var(--ac-radius-sm);',
      'border:2px solid var(--ac-border-light);background:var(--ac-bg-input)}',
      '.dp-world[data-done="true"]{background:#fdf7e2;border-color:var(--ac-warning)}',
      '.dp-world .dp-grow{flex:1;min-width:0}',

      /* ---------- [dsh-piggy-claude-code mod] scratch cards, locked careers ---------- */
      '.dp-lottery{margin:0 0 10px;padding:8px 10px;border-radius:var(--ac-radius-sm);',
      'background:#fdf7e2;border:2px solid #f0dfa8}',
      '.dp-lottery .dp-row{align-items:baseline;gap:6px;margin:0 0 5px}',
      /* [ST0015] the casino: its door at the top of the shop, and its page */
      '.dp-casino-door{display:flex;align-items:center;gap:9px;width:100%;margin:0 0 10px;padding:9px 11px;',
      'font:inherit;text-align:left;color:var(--ac-text);cursor:pointer;border-radius:var(--ac-radius-sm);',
      'background:linear-gradient(135deg,#fdf0d5,#f6dcc8);border:2px solid #e8c48f;box-shadow:var(--ac-shadow-sm);',
      'transition:all .2s var(--ac-ease)}',
      '.dp-casino-door:hover{transform:translateY(-1px);box-shadow:var(--ac-shadow)}',
      '.dp-casino-door:focus-visible{outline:2px solid var(--ac-primary);outline-offset:1px}',
      '.dp-casino-door b{font-size:12px}',
      '.dp-casino-door .dp-grow{flex:1;min-width:0}',
      '.dp-casino-icon{font-size:22px;line-height:1}',
      '.dp-casino-go{font-size:18px;font-weight:700;color:var(--ac-text-2)}',
      '.dp-casino-back{font:inherit;font-size:11px;font-weight:700;color:var(--ac-text);cursor:pointer;',
      'padding:2px 8px;border-radius:var(--ac-pill);background:var(--ac-bg-input);border:1.5px solid var(--ac-border-light)}',
      '.dp-casino-back:focus-visible{outline:2px solid var(--ac-primary);outline-offset:1px}',
      '.dp-casino-title{margin:0 0 8px;font-size:13px;font-weight:700;color:var(--ac-text)}',
      /* [ST0015] the blackjack table */
      '.dp-bj{margin:0 0 10px;padding:8px 10px;border-radius:var(--ac-radius-sm);',
      'background:#e9f5e4;border:2px solid #bcdcae}',
      '.dp-bj .dp-row{align-items:baseline;gap:6px;margin:0 0 5px}',
      '.dp-bj .dp-actions{grid-template-columns:repeat(3,1fr);margin-top:7px}',
      '.dp-bj .dp-actions[data-bj="hand"]{grid-template-columns:1fr 1fr}',
      '.dp-cards{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px}',
      '.dp-card{min-width:22px;padding:3px 4px;text-align:center;font-size:12px;font-weight:700;line-height:1.2;',
      'color:#2b2b2b;background:#fff;border:1.5px solid var(--ac-border-light);border-radius:5px;',
      'box-shadow:var(--ac-shadow-sm)}',
      '.dp-card[data-red="true"]{color:#c8372d}',
      '.dp-bj-total{margin-left:4px;font-size:10.5px;font-weight:700;color:var(--ac-text)}',
      '.dp-bj-total[data-outcome="bust"]{color:var(--ac-text-2)}',
      '.dp-bj-total[data-outcome="jackpot"]{color:#b8860b}',
      '.dp-item[data-locked="true"]{background:var(--ac-bg-disabled)}',
      '.dp-item[data-tier="pro"]{border-color:#f0dfa8}',
      '.dp-empty{color:var(--ac-text-2);font-size:10.5px;font-weight:500;line-height:1.65;',
      'margin-top:4px}',
      '.dp-memo{margin-top:9px;padding-top:8px;border-top:2px solid var(--ac-border-light);',
      'color:var(--ac-text-muted);font-size:10px;font-weight:500;line-height:1.55;',
      'white-space:pre-wrap;word-break:break-word}',

      /* ---------- particles and toast ---------- */
      '.dp-fx{position:absolute;z-index:1;pointer-events:none;font-size:17px;',
      'animation:dp-rise 1.1s ease-out forwards}',
      '@keyframes dp-rise{0%{opacity:0;transform:translate(var(--dx0,0),4px) scale(.5)}18%{opacity:1}',
      '100%{opacity:0;transform:translate(var(--dx,0),-56px) scale(1.15)}}',
      '.dp-toast{position:absolute;left:9px;right:9px;top:8px;padding:8px 11px;',
      'border-radius:var(--ac-radius-sm);font-size:10.5px;font-weight:600;line-height:1.5;',
      'color:var(--ac-text);background:var(--ac-bg-input);border:2px solid var(--ac-border);',
      'box-shadow:var(--ac-shadow);pointer-events:none;white-space:normal;',
      'animation:dp-toast 4.6s var(--ac-ease) forwards}',
      '@keyframes dp-toast{0%{opacity:0;transform:translateY(-8px)}8%{opacity:1;transform:translateY(0)}',
      '82%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}',

      /* ---------- [dsh-piggy-claude-code mod] a resizable panel ---------- */
      // The panel hangs off the pig by its bottom-right corner, so it grows up
      // and to the left: the grips sit on the top-left corner and the top and
      // left edges. They are absolutely positioned, so the flex column (content,
      // icon bar) never notices them. The card is a size container, so a wider
      // panel gives its lists more columns instead of longer rows.
      '.dp-card{container-type:inline-size;container-name:dp-card}',
      '.dp-grip{position:absolute;z-index:4;touch-action:none;background-color:transparent;',
      'transition:background-color .2s var(--ac-ease)}',
      '.dp-grip:hover,[data-dsh-pig][data-resizing] .dp-grip{background-color:rgba(25,200,185,.16)}',
      // Stripes start 10px in: the 20px corner radius clips anything closer.
      '.dp-grip[data-resize="corner"]{left:0;top:0;width:24px;height:24px;cursor:nwse-resize;z-index:5;',
      'background-image:linear-gradient(135deg,transparent 10px,var(--ac-border-hover) 10px 11.5px,',
      'transparent 11.5px 14px,var(--ac-border-hover) 14px 15.5px,transparent 15.5px)}',
      '.dp-grip[data-resize="top"]{left:24px;right:0;top:0;height:6px;cursor:ns-resize}',
      '.dp-grip[data-resize="left"]{left:0;top:24px;bottom:0;width:6px;cursor:ew-resize}',
      '[data-dsh-pig][data-resizing] .dp-card{box-shadow:var(--ac-shadow-lg),0 0 0 2px var(--ac-primary-hover)}',
      // A slim header, only when the host can open the big panel (the ⤢).
      '.dp-card-head{order:-1;flex:0 0 auto;display:flex;justify-content:flex-end;align-items:center;',
      'padding:6px 10px 0 26px}',
      '.dp-card-head .dp-icon-btn{font-size:11px;padding:2px 8px;color:var(--ac-text)}',
      '@container dp-card (min-width:460px){',
      '.dp-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.dp-list>.dp-shelf{grid-column:1/-1}',
      '.dp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '.dp-region-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.dp-region-body>:not(.dp-item){grid-column:1/-1}',
      '}',
      '@container dp-card (min-width:720px){',
      '.dp-list{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '.dp-grid{grid-template-columns:repeat(4,minmax(0,1fr))}',
      '.dp-region-body{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '}',

      /* ---------- [dsh-piggy-claude-code mod] the big panel: game skin ---------- */
      // Two cream cards on a soft dotted meadow: the pig and its numbers on the
      // left, the six tabs on the right. Same elements as the floating widget;
      // only the frame around them changes.
      '[data-dsh-pig][data-layout="split"]{position:fixed;inset:0;right:0;bottom:0;pointer-events:auto;',
      'display:flex;flex-direction:column;overflow:hidden;color:var(--ac-text-body);',
      '--pig-big:min(calc(var(--pig-size) * 2),240px);',
      'background-color:#e9f4e0;background-image:radial-gradient(#d4e9c4 1.6px,transparent 1.8px);',
      'background-size:22px 22px}',
      '[data-dsh-pig][data-layout="split"] .dp-xl-top,[data-dsh-pig][data-layout="split"] .dp-xl-bottom,',
      '[data-dsh-pig][data-layout="split"] .dp-xl-rows{display:none}',
      '[data-dsh-pig][data-layout="split"] .dp-split{flex:1 1 auto;min-height:0;display:grid;',
      'grid-template-columns:340px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:18px;padding:18px;',
      'width:100%;max-width:1280px;margin:0 auto}',
      '[data-dsh-pig][data-layout="split"] .dp-left{min-height:0;overflow-y:auto;display:flex;flex-direction:column;',
      'background:var(--ac-bg);border:2px solid var(--ac-border-light);border-radius:24px;box-shadow:var(--ac-shadow)}',
      '[data-dsh-pig][data-layout="split"] .dp-card{position:relative;right:auto;bottom:auto;top:auto;width:auto;',
      'max-width:none;max-height:none;min-height:0;border-radius:24px;box-shadow:var(--ac-shadow)}',
      '[data-dsh-pig][data-layout="split"] .dp-bar{order:-1;border-top:0}',
      '[data-dsh-pig][data-layout="split"] .dp-grip,[data-dsh-pig][data-layout="split"] .dp-card-head{display:none}',
      '[data-dsh-pig][data-layout="split"][data-skin="game"] .dp-side,',
      '[data-dsh-pig][data-layout="split"][data-skin="game"] .dp-card{zoom:1.1}',
      // The pig, twice its floating size (capped), standing on a little lawn.
      '[data-dsh-pig][data-layout="split"] .dp-scene{width:auto;min-width:0;flex:0 0 auto;cursor:default;',
      'height:calc(var(--pig-big) + 104px);justify-content:center;padding:0 12px 16px;margin:12px 12px 0;',
      'border-radius:18px;background:radial-gradient(120% 55% at 50% 100%,#cbe6ae 0,#dff0cc 55%,#f4f9ec 100%)}',
      '[data-dsh-pig][data-layout="split"] .dp-pig-img{width:var(--pig-big);height:var(--pig-big)}',
      '[data-dsh-pig][data-layout="split"] .dp-pig-emoji{font-size:var(--pig-big)}',
      // Centred with margins, not transforms: the hint's bob animation owns transform.
      '[data-dsh-pig][data-layout="split"] .dp-bubble{left:0;right:0;top:12px;margin:0 auto;',
      'width:max-content;max-width:260px}',
      '[data-dsh-pig][data-layout="split"] .dp-bubble::after{left:calc(50% - 5px)}',
      '[data-dsh-pig][data-layout="split"] .dp-poke-hint{left:0;right:0;bottom:4px;margin:0 auto;width:max-content}',
      '.dp-side{padding:12px 16px 16px;display:flex;flex-direction:column}',
      '.dp-side-head{display:flex;flex-direction:column;align-items:center;gap:1px;margin:2px 0 10px;text-align:center}',
      '.dp-side-name{font-size:17px;font-weight:800;color:var(--ac-text);overflow-wrap:anywhere}',
      '.dp-side-sub{font-size:11px;font-weight:600;color:var(--ac-text-2)}',
      '.dp-stat{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"k v" "m m";',
      'align-items:center;font-size:11.5px;font-weight:600;color:var(--ac-text-body)}',
      '.dp-stat-k{grid-area:k}',
      '.dp-stat-v{grid-area:v;font-weight:700;color:var(--ac-text)}',
      '.dp-stat .dp-meter{grid-area:m;margin:3px 0 8px}',
      '.dp-kvs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:2px 0 4px}',
      '.dp-kv{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;padding:6px 4px;',
      'border-radius:var(--ac-radius-sm);background:var(--ac-bg-content);border:2px solid var(--ac-border-light);',
      'font-size:10px;font-weight:600;color:var(--ac-text-2);text-align:center}',
      '.dp-kv b{font-size:12.5px;font-weight:800;color:var(--ac-text);overflow-wrap:anywhere}',
      '.dp-side-away{margin:8px 0 0}',
      '.dp-side-away .dp-progress{width:100%;height:9px;margin-top:5px}',
      '.dp-side .dp-pick{margin-top:9px}',
      '.dp-skin-btn{margin-top:14px;text-align:center}',
      '@media (max-width:759px){',
      // Stacked: each column takes its full content height and the page scrolls.
      // (In a grid the left column could shrink below its content and slide
      // under the right one.)
      '[data-dsh-pig][data-layout="split"] .dp-split{display:flex;flex-direction:column;',
      'overflow-y:auto;padding:12px;gap:12px}',
      '[data-dsh-pig][data-layout="split"] .dp-left,[data-dsh-pig][data-layout="split"] .dp-card{',
      'flex:0 0 auto;min-height:auto;overflow:visible}',
      '[data-dsh-pig][data-layout="split"] .dp-content{overflow:visible}',
      '}',

      /* ---------- [dsh-piggy-claude-code mod] the big panel: spreadsheet skin ---------- */
      // For slacking off. Redefining the design tokens does most of the work —
      // white cells, grey hairlines, square corners, no shadows — and the rules
      // below add the Excel chrome around the same content.
      '[data-dsh-pig][data-skin="excel"]{',
      '--ac-font:Calibri,"Segoe UI","Microsoft YaHei","Hiragino Sans","PingFang SC",sans-serif;',
      '--ac-primary:#217346;--ac-primary-hover:#217346;--ac-primary-active:#185c37;--ac-primary-bg:#e2efda;',
      '--ac-text:#1f1f1f;--ac-text-body:#262626;--ac-text-2:#6b6b6b;--ac-text-muted:#444;--ac-text-disabled:#a6a6a6;',
      '--ac-bg:#fff;--ac-bg-content:#fff;--ac-bg-input:#fff;--ac-bg-disabled:#f2f2f2;',
      '--ac-border:#d4d4d4;--ac-border-light:#d4d4d4;--ac-border-hover:#b7b7b7;',
      '--ac-radius-sm:0;--ac-radius-card:0;--ac-pill:0;',
      '--ac-shadow-sm:none;--ac-shadow:none;--ac-shadow-lg:none;--ac-inset:none;',
      '--ac-active:#e2efda;--ac-hover:#f3f9f1;--ac-warning:#ffeb9c;',
      '--xl-green:#217346;--xl-grid:#d4d4d4;--xl-head:#f3f3f3;--xl-link:#0563c1;',
      '--xl-gut:36px;--xl-a:120px;--xl-b:200px;--xl-col:80px;--xl-row:20px;--pig-big:48px;',
      'background:#fff;color:#262626;font-family:var(--ac-font)}',
      '[data-dsh-pig][data-skin="excel"] *{font-size:12px;font-weight:400;letter-spacing:0;line-height:var(--xl-row)}',
      '[data-dsh-pig][data-skin="excel"] b{font-weight:700}',
      '[data-dsh-pig][data-skin="excel"] .dp-xl-top,[data-dsh-pig][data-skin="excel"] .dp-xl-bottom{display:block;flex:0 0 auto}',
      '[data-dsh-pig][data-skin="excel"] .dp-skin-btn,[data-dsh-pig][data-skin="excel"] .dp-e,',
      '[data-dsh-pig][data-skin="excel"] .dp-item>span:first-child,[data-dsh-pig][data-skin="excel"] .dp-ico span.dp-ico-e{display:none}',
      // title bar · ribbon · formula bar · column headers
      '.dp-xl-title{display:flex;align-items:center;height:32px;padding-left:10px;background:var(--xl-green);color:#fff}',
      '.dp-xl-logo{flex:0 0 auto;width:18px;height:18px;margin-right:10px;display:flex;align-items:center;',
      'justify-content:center;background:#fff;color:var(--xl-green);border-radius:2px}',
      '[data-dsh-pig][data-skin="excel"] .dp-xl-logo{font-weight:700;line-height:18px}',
      '.dp-xl-name{flex:1 1 auto;min-width:0;text-align:center;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dp-xl-win{flex:0 0 auto;display:flex;align-self:stretch}',
      '.dp-xl-win span{width:46px;display:flex;align-items:center;justify-content:center;color:#fff}',
      '.dp-xl-win span:hover{background:rgba(255,255,255,.15)}',
      '.dp-xl-win span:last-child:hover{background:#e81123}',
      '.dp-xl-ribbon{display:flex;align-items:flex-end;gap:2px;height:28px;padding:0 6px;background:var(--xl-green);overflow:hidden}',
      '.dp-xl-ribbon span{height:24px;padding:0 12px;display:flex;align-items:center;color:#fff;white-space:nowrap}',
      '.dp-xl-ribbon span[data-active="true"]{background:var(--xl-head);color:var(--xl-green)}',
      '.dp-xl-tools{display:flex;align-items:center;gap:4px;height:38px;padding:0 10px;background:var(--xl-head);',
      'border-bottom:1px solid var(--xl-grid);overflow:hidden;white-space:nowrap;color:#444}',
      '.dp-xl-sep{flex:0 0 1px;align-self:stretch;margin:6px 6px;background:var(--xl-grid)}',
      '.dp-xl-box{display:inline-flex;align-items:center;height:22px;padding:0 6px;background:#fff;border:1px solid #c6c6c6}',
      '.dp-xl-tool{padding:0 5px}',
      '.dp-xl-tools button{font:inherit;height:26px;padding:0 8px;cursor:pointer;color:#444;background:none;border:1px solid transparent}',
      '.dp-xl-tools button:hover{background:#e1e1e1;border-color:#c6c6c6}',
      '.dp-xl-tools button[aria-pressed="true"]{background:#d2d2d2;border-color:#a6a6a6}',
      '.dp-xl-fx{display:flex;align-items:center;height:26px;background:#fff;border-bottom:1px solid var(--xl-grid)}',
      '.dp-xl-namebox{flex:0 0 96px;align-self:stretch;display:flex;align-items:center;padding:0 6px;',
      'border-right:1px solid var(--xl-grid)}',
      '.dp-xl-fxicons{flex:0 0 auto;display:flex;gap:12px;padding:0 12px;color:#8a8a8a;border-right:1px solid var(--xl-grid)}',
      '[data-dsh-pig][data-skin="excel"] .dp-xl-fxicons i{font-style:italic;font-family:Cambria,Georgia,serif;color:#444}',
      '.dp-xl-formula{flex:1 1 auto;min-width:0;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dp-xl-cols{display:flex;height:20px;background:var(--xl-head);border-bottom:1px solid #bfbfbf;overflow:hidden}',
      '.dp-xl-cols span{flex:0 0 var(--xl-col);text-align:center;color:#444;border-right:1px solid var(--xl-grid)}',
      '.dp-xl-cols span:first-child{flex-basis:var(--xl-gut);border-right-color:#bfbfbf}',
      '.dp-xl-cols span:nth-child(2){flex-basis:var(--xl-a)}',
      '.dp-xl-cols span:nth-child(3){flex-basis:var(--xl-b)}',
      '.dp-xl-cols span[data-active="true"]{background:#d2d2d2;color:var(--xl-green);box-shadow:inset 0 -2px 0 var(--xl-green)}',
      // the sheet: one scroll area — row numbers, the pig's columns A:B, the tab in C:
      '[data-dsh-pig][data-skin="excel"] .dp-split{display:grid;gap:0;padding:0;max-width:none;margin:0;overflow:auto;',
      'grid-template-columns:var(--xl-gut) calc(var(--xl-a) + var(--xl-b)) minmax(0,1fr);',
      'grid-template-rows:minmax(100%,max-content);align-content:start;background-color:#fff;',
      'background-image:linear-gradient(to bottom,transparent calc(var(--xl-row) - 1px),var(--xl-grid) 0);',
      'background-size:100% var(--xl-row);background-attachment:local}',
      '[data-dsh-pig][data-skin="excel"] .dp-xl-rows{display:block;grid-column:1;grid-row:1/-1;position:relative;',
      'overflow:hidden;background:var(--xl-head);border-right:1px solid #bfbfbf}',
      '.dp-xl-rows ol{position:absolute;left:0;right:0;top:0;margin:0;padding:0;list-style:none}',
      '.dp-xl-rows li{height:var(--xl-row);text-align:center;color:#444;border-bottom:1px solid var(--xl-grid)}',
      '[data-dsh-pig][data-skin="excel"] .dp-left{grid-column:2;grid-row:1;position:relative;overflow:visible;',
      'background:linear-gradient(to right,transparent calc(var(--xl-a) - 1px),var(--xl-grid) 0,',
      'var(--xl-grid) var(--xl-a),transparent 0);border:0;border-right:1px solid #bfbfbf;border-radius:0;box-shadow:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-card{grid-column:3;grid-row:1;overflow:visible;border:0;border-radius:0;',
      'box-shadow:none;background:linear-gradient(to right,transparent calc(var(--xl-col) - 1px),var(--xl-grid) 0);',
      'background-size:var(--xl-col) 100%}',
      '[data-dsh-pig][data-skin="excel"] .dp-content{padding:0;overflow:visible}',
      // the pig as an inserted picture, with selection handles; off by default
      '[data-dsh-pig][data-skin="excel"] .dp-scene{position:absolute;z-index:6;top:var(--xl-row);right:8px;',
      'width:auto;height:auto;margin:0;padding:6px 10px;background:#fff;border:1px solid #8a8a8a;border-radius:0;',
      'cursor:default}',
      '[data-dsh-pig][data-skin="excel"] .dp-scene::before,[data-dsh-pig][data-skin="excel"] .dp-scene::after{content:"";',
      'position:absolute;width:6px;height:6px;background:#fff;border:1px solid #8a8a8a}',
      '[data-dsh-pig][data-skin="excel"] .dp-scene::before{left:-4px;top:-4px}',
      '[data-dsh-pig][data-skin="excel"] .dp-scene::after{right:-4px;bottom:-4px}',
      '[data-dsh-pig][data-skin="excel"][data-pic="false"] .dp-scene{display:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-work{margin:0 4px 0 0}',
      '[data-dsh-pig][data-skin="excel"] .dp-bubble{left:auto;right:calc(100% + 10px);top:0;margin:0;width:max-content;',
      'max-width:220px;padding:0 6px;background:#ffffe1;border:1px solid #767676}',
      '[data-dsh-pig][data-skin="excel"] .dp-bubble::after{display:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-toast{left:auto;right:12px;width:300px;padding:4px 8px;background:#fff;',
      'border:1px solid #a6a6a6;box-shadow:0 2px 8px rgba(0,0,0,.18)}',
      // the pig's columns: label in A, value in B
      '[data-dsh-pig][data-skin="excel"] .dp-side{display:block;padding:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-side-head,[data-dsh-pig][data-skin="excel"] .dp-stat,',
      '[data-dsh-pig][data-skin="excel"] .dp-kv,[data-dsh-pig][data-skin="excel"] .dp-side .dp-actions{display:grid;',
      'grid-template-columns:var(--xl-a) var(--xl-b);gap:0;margin:0;padding:0;align-items:center;text-align:left}',
      '[data-dsh-pig][data-skin="excel"] .dp-side-head>*,[data-dsh-pig][data-skin="excel"] .dp-stat-k,',
      '[data-dsh-pig][data-skin="excel"] .dp-kv>*{padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '[data-dsh-pig][data-skin="excel"] .dp-side-name{outline:2px solid var(--xl-green);outline-offset:-2px;font-weight:700;color:#000}',
      '[data-dsh-pig][data-skin="excel"] .dp-stat{grid-template-areas:"k m"}',
      '[data-dsh-pig][data-skin="excel"] .dp-stat-v{grid-area:m;z-index:1;padding:0 6px;font-weight:400;color:#000}',
      '[data-dsh-pig][data-skin="excel"] .dp-stat .dp-meter{height:16px;margin:2px 3px 2px 2px;background:none;overflow:visible}',
      '[data-dsh-pig][data-skin="excel"] .dp-meter i{transition:none;border:1px solid #638ec6;',
      'background:linear-gradient(90deg,#638ec6,#b4c9e7 70%,#eef3fa)}',
      '[data-dsh-pig][data-skin="excel"] .dp-meter.dp-mood i{border-color:#ff555a;background:linear-gradient(90deg,#ff555a,#ffb1b3 70%,#fff1f1)}',
      '[data-dsh-pig][data-skin="excel"] .dp-meter.dp-clean i{border-color:#63be7b;background:linear-gradient(90deg,#63be7b,#b6dfc1 70%,#f0f8f2)}',
      '[data-dsh-pig][data-skin="excel"] .dp-meter.dp-health i{border-color:#ffb628;background:linear-gradient(90deg,#ffb628,#ffdc95 70%,#fff7e6)}',
      '[data-dsh-pig][data-skin="excel"] .dp-kvs{display:block;margin:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-kv{border:0;background:none;color:inherit}',
      '[data-dsh-pig][data-skin="excel"] .dp-kv b{font-weight:400;text-align:right;color:#000}',
      '[data-dsh-pig][data-skin="excel"] .dp-side-away .dp-progress{height:4px;margin:0 4px 0 0;width:auto}',
      // cells, not cards: everything sits on the 20px row grid
      '[data-dsh-pig][data-skin="excel"] .dp-item{min-height:calc(var(--xl-row) * 2);padding:0 6px;gap:6px;border:0;background:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-item.dp-wanted{background:#ffeb9c}',
      '[data-dsh-pig][data-skin="excel"] .dp-item[aria-pressed="true"]{background:#e2efda}',
      '[data-dsh-pig][data-skin="excel"] .dp-item:hover,[data-dsh-pig][data-skin="excel"] .dp-kv:hover,',
      '[data-dsh-pig][data-skin="excel"] .dp-stat:hover{outline:2px solid var(--xl-green);outline-offset:-2px}',
      '[data-dsh-pig][data-skin="excel"] .dp-list,[data-dsh-pig][data-skin="excel"] .dp-grid,',
      '[data-dsh-pig][data-skin="excel"] .dp-seg,[data-dsh-pig][data-skin="excel"] .dp-actions,',
      '[data-dsh-pig][data-skin="excel"] .dp-chips,[data-dsh-pig][data-skin="excel"] .dp-region-body{gap:0;margin:0;padding:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-title,[data-dsh-pig][data-skin="excel"] .dp-row,',
      '[data-dsh-pig][data-skin="excel"] .dp-shelf,[data-dsh-pig][data-skin="excel"] .dp-note,',
      '[data-dsh-pig][data-skin="excel"] .dp-empty,[data-dsh-pig][data-skin="excel"] .dp-memo,',
      '[data-dsh-pig][data-skin="excel"] .dp-name,[data-dsh-pig][data-skin="excel"] .dp-badge,',
      '[data-dsh-pig][data-skin="excel"] .dp-locked,[data-dsh-pig][data-skin="excel"] .dp-perk,',
      '[data-dsh-pig][data-skin="excel"] .dp-world,[data-dsh-pig][data-skin="excel"] .dp-rename,',
      '[data-dsh-pig][data-skin="excel"] .dp-pick,[data-dsh-pig][data-skin="excel"] .dp-region,',
      '[data-dsh-pig][data-skin="excel"] .dp-dev-note{margin:0;padding:0 6px;border:0;border-radius:0;background:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-title b,[data-dsh-pig][data-skin="excel"] .dp-shelf{font-weight:700}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert{margin:0;padding:0 6px;border:0;border-radius:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert.dp-sick{background:#ffc7ce;color:#9c0006}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert.dp-work{background:#ddebf7}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert.dp-dead{background:#ededed}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert.dp-legacy{background:#ffeb9c;color:#9c5700}',
      '[data-dsh-pig][data-skin="excel"] .dp-alert.dp-trip{background:#c6efce;color:#006100}',
      '[data-dsh-pig][data-skin="excel"] .dp-region-head{padding:0 6px;font-weight:700}',
      '[data-dsh-pig][data-skin="excel"] .dp-chip{padding:0 8px 0 0;border:0;background:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-chip[data-have="false"]{color:#a6a6a6}',
      '[data-dsh-pig][data-skin="excel"] .dp-tag{padding:0 4px;background:none;color:#9c5700;border:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-input{height:var(--xl-row);padding:0 4px;border:1px solid var(--xl-green)}',
      '[data-dsh-pig][data-skin="excel"] .dp-progress{height:4px;width:60px}',
      // buttons are hyperlinks: blue, underlined, no pill, no 3D edge
      '[data-dsh-pig][data-skin="excel"] .dp-btn,[data-dsh-pig][data-skin="excel"] .dp-mini,',
      '[data-dsh-pig][data-skin="excel"] .dp-link,[data-dsh-pig][data-skin="excel"] .dp-cancel,',
      '[data-dsh-pig][data-skin="excel"] .dp-icon-btn{height:var(--xl-row);padding:0 6px;margin:0;border:0;',
      'border-radius:0;background:none;box-shadow:none;color:var(--xl-link);text-decoration:underline;',
      'justify-content:flex-start;text-align:left;width:auto;transform:none;transition:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-btn:hover:not(:disabled),[data-dsh-pig][data-skin="excel"] .dp-mini:hover:not(:disabled),',
      '[data-dsh-pig][data-skin="excel"] .dp-link:hover,[data-dsh-pig][data-skin="excel"] .dp-cancel:hover{',
      'background:none;color:#03449e;transform:none;box-shadow:none;outline:2px solid var(--xl-green);outline-offset:-2px}',
      '[data-dsh-pig][data-skin="excel"] .dp-btn:disabled,[data-dsh-pig][data-skin="excel"] .dp-mini:disabled{',
      'color:#a6a6a6;text-decoration:none;background:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-btn[aria-pressed="true"],[data-dsh-pig][data-skin="excel"] .dp-btn[data-open-picker="true"]{',
      'background:#e2efda;color:#000;text-decoration:none;font-weight:700}',
      '[data-dsh-pig][data-skin="excel"] .dp-seg button{border:0;border-radius:0;background:none;padding:0 6px;text-align:left;color:#262626}',
      '[data-dsh-pig][data-skin="excel"] .dp-seg button[data-active="true"]{background:#e2efda;font-weight:700;',
      'outline:2px solid var(--xl-green);outline-offset:-2px}',
      '[data-dsh-pig][data-skin="excel"] .dp-seg button[data-locked="true"]{color:#a6a6a6;border:0}',
      // sheet tabs at the bottom, then the status bar
      '.dp-xl-sheets{display:flex;align-items:stretch;height:26px;background:var(--xl-head);border-top:1px solid var(--xl-grid)}',
      '.dp-xl-nav{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:0 12px;color:#a6a6a6}',
      '[data-dsh-pig][data-skin="excel"] .dp-bar{display:flex;gap:0;padding:0;background:none;border:0;overflow-x:auto;',
      'scrollbar-width:none}',
      '[data-dsh-pig][data-skin="excel"] .dp-ico{flex:0 0 auto;flex-direction:row;padding:0 16px;color:#444;',
      'border:0;border-right:1px solid var(--xl-grid);border-radius:0;white-space:nowrap}',
      '[data-dsh-pig][data-skin="excel"] .dp-ico:hover{background:#e1e1e1}',
      '[data-dsh-pig][data-skin="excel"] .dp-ico[data-active="true"]{background:#fff;color:var(--xl-green);',
      'font-weight:700;box-shadow:inset 0 -3px 0 var(--xl-green)}',
      '[data-dsh-pig][data-skin="excel"] .dp-ico[data-active="true"] span{font-weight:700}',
      '.dp-xl-plus{flex:0 0 auto;width:30px;padding:0;font:inherit;cursor:pointer;color:#6b6b6b;background:none;border:0}',
      '[data-dsh-pig][data-skin="excel"] .dp-xl-plus{font-size:17px}',
      '.dp-xl-status{display:flex;align-items:center;gap:14px;height:24px;padding:0 10px;background:var(--xl-head);',
      'border-top:1px solid var(--xl-grid);color:#444;white-space:nowrap;overflow:hidden}',
      '.dp-xl-msg{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.dp-xl-views{display:flex;gap:2px}',
      '.dp-xl-views button{width:24px;height:20px;padding:0;font:inherit;cursor:pointer;color:#444;',
      'background:none;border:1px solid transparent}',
      '.dp-xl-views button:hover{background:#e1e1e1}',
      '.dp-xl-views button[aria-pressed="true"]{background:#d2d2d2;border-color:#a6a6a6}',
      '.dp-xl-zoom{display:flex;align-items:center;gap:6px}',
      '.dp-xl-track{position:relative;width:96px;height:1px;background:#8a8a8a}',
      '.dp-xl-track i{position:absolute;left:50%;top:-5px;width:4px;height:11px;margin-left:-2px;background:#444}',
      '@media (max-width:759px){',
      '[data-dsh-pig][data-skin="excel"] .dp-split{grid-template-columns:var(--xl-gut) minmax(0,1fr);',
      'grid-template-rows:auto minmax(100%,max-content)}',
      '[data-dsh-pig][data-skin="excel"] .dp-card{grid-column:2;grid-row:2}',
      '[data-dsh-pig][data-skin="excel"] .dp-left{border-right:0;border-bottom:1px solid #bfbfbf}',
      '.dp-xl-nav,.dp-xl-zoom{display:none}',
      '}',
    ].join('')

    // ---------------------------------------------------------------------
    // Tiny DOM helpers
    // ---------------------------------------------------------------------

    function readStore(key) {
      try { return window.localStorage.getItem(key) } catch (error) { return null }
    }

    function readStore(key) {
      try { return window.localStorage.getItem(key) } catch (error) { return null }
    }

    function writeStore(key, value) {
      try { window.localStorage.setItem(key, value) } catch (error) { /* private mode */ }
    }

    function el(tag, className, text) {
      var node = document.createElement(tag)
      if (className) node.className = className
      if (text !== undefined) node.textContent = text
      return node
    }

    function button(className, attrs, onClick) {
      var node = el('button', className)
      node.type = 'button'
      for (var key in attrs) node.setAttribute(key, attrs[key])
      node.addEventListener('click', function (event) {
        event.stopPropagation()
        onClick()
      })
      return node
    }

    function meter(value, variant) {
      var wrap = el('div', 'dp-meter' + (variant ? ' ' + variant : ''))
      var fill = document.createElement('i')
      fill.style.width = Math.max(0, Math.min(100, num(value, 0))) + '%'
      wrap.appendChild(fill)
      return wrap
    }

    /**
     * The pose a drawn pig shows: its mood's, in three strengths for the
     * leveled moods, and while it is out the pose of that very job, school,
     * place or machine. Undefined for an undrawn stage or a grave. `jobs` is
     * a snapshot's job table, for a career's own pose. Shared by our pig, the
     * pen mates drawn beside it (ST0014) and those in the desk's pen (ST0026).
     */
    function poseOf(stage, moodKey, moodLevel, activity, jobs) {
      var pose = stage.art !== null && stage.key !== 'grave' ? MOOD_ART[moodKey] : undefined
      // Sick, hungry, dirty and lonely come in three strengths.
      if (pose !== undefined && LEVELED_MOODS[moodKey] === true) {
        pose += '-' + Math.min(3, Math.max(1, moodLevel || 2))
      }
      if (pose === undefined || activity === null || activity === undefined) return pose
      // A career shows the pig at that job rather than at a generic desk.
      if (moodKey === 'working' && activity.kind === 'work') {
        var job = arr(jobs).filter(j => j.key === activity.key)[0]
        if (job !== undefined && job.art !== null) pose = 'job-' + job.art
      }
      if (moodKey === 'studying' && activity.kind === 'study') {
        if (STUDY_ART[activity.stage] !== undefined) pose = STUDY_ART[activity.stage]
      }
      if (moodKey === 'traveling' && activity.kind === 'trip') {
        // Own keys only: a key like `constructor` must not pick up a prototype member.
        if (Object.prototype.hasOwnProperty.call(PLACE_ART, activity.key)) pose = PLACE_ART[activity.key]
        else if (Object.prototype.hasOwnProperty.call(TRIP_ART, activity.region)) pose = TRIP_ART[activity.region]
      }
      if (moodKey === 'exercising' && activity.kind === 'gym') {
        if (Object.prototype.hasOwnProperty.call(GYM_ART, activity.key)) pose = GYM_ART[activity.key]
      }
      return pose
    }

    /** [ST0014] Is this pen mate drawn on our desk? */
    function penShownIn(cloud, id) {
      if (cloud === null) return false
      if (cloud.penShow === 'all') return true
      if (cloud.penShow === 'self') return false
      return cloud.penShow.indexOf(id) >= 0
    }

    /** [ST0014] The pen mates to draw: shown, hatched, and drawable by an up-to-date server. */
    function friendsIn(cloud) {
      if (cloud === null || !cloud.linked || cloud.pen === null) return []
      return cloud.pen.members.filter(function (m) { return !m.you && m.hatched && m.stage !== null && penShownIn(cloud, m.id) })
    }

    /**
     * [ST0014] How a pen mate is drawn: its own pose and outfit, at most two
     * thirds of its size (and never bigger than a plump pig), and its name.
     */
    function friendLook(m, jobs) {
      var pose = poseOf(m.stage, m.mood, m.moodLevel, m.activity, jobs)
      var art = pose !== undefined ? pose : m.stage.art
      var wear = m.stage.key !== 'grave' && m.worn.length > 0 ? '?wear=' + m.worn.join(',') : ''
      return { id: m.id, name: m.name, art: art, src: art === null ? null : ART_URL + art + '.svg' + wear, emoji: m.stage.emoji, size: Math.round(Math.min(96, m.stage.size * 0.66)), faded: m.stage.faded, away: m.activity !== null }
    }

    // [ST0026] What a pen mate with nothing to do gets up to in the desk's pen,
    // and how often: amble somewhere, dash back and forth, roll across the pen
    // (横向) or tumble up and down it (纵向), sit, lie down, lie belly-up, or
    // just stand there a moment.
    var ROAM_MOVES = [
      { key: 'walk', weight: 30 }, { key: 'dash', weight: 12 }, { key: 'roll-x', weight: 9 }, { key: 'roll-y', weight: 8 },
      { key: 'sit', weight: 14 }, { key: 'lie', weight: 10 }, { key: 'belly', weight: 7 }, { key: 'rest', weight: 10 },
    ]
    // A poorly, sleepy or hungry pig (or a player who asked for less motion) only potters.
    var CALM_MOVES = { walk: true, sit: true, lie: true, rest: true }
    var CALM_MOODS = { sick: true, sleepy: true, hungry: true }
    var PEN_MOUNTED = 'data-dsh-pen'

    /** [ST0026] A pen mate's next move; `rand` is Math.random, or a test's stand-in. */
    function pickRoamMove(rand, calm) {
      var moves = ROAM_MOVES.filter(function (m) { return !calm || CALM_MOVES[m.key] === true })
      var total = moves.reduce(function (sum, m) { return sum + m.weight }, 0)
      var left = rand() * total
      for (var i = 0; i < moves.length; i += 1) {
        left -= moves[i].weight
        if (left < 0) return moves[i].key
      }
      return moves[moves.length - 1].key
    }

    /** [ST0026] Has this pen mate nothing on: not out, not asleep, not gone? Then it roams. */
    function roamsFree(m) {
      return m.activity === null && !m.asleep && !m.dead && m.mood !== 'asleep' && m.stage.key !== 'grave'
    }

    /**
     * [ST0026] The desk's pig pen (`ctx.layout === 'pen'`): a click-through
     * window of its own, which the desktop host lays over the area the player
     * fenced in on the desk. The pen mates chosen in 在线 live here instead of
     * beside our pig. One with nothing to do roams about it; one that is out,
     * asleep or gone stays where it is, in its own pose. Reads /pig/cloud, and
     * now and then the job table from a /dsh-pig/state that drains nothing.
     */
    function mountPen() {
      if (document.querySelector('[' + PEN_MOUNTED + ']') !== null) return () => {}
      var style = document.createElement('style')
      style.textContent = CSS
      document.head.appendChild(style)
      var yard = el('div', 'dp-yard')
      yard.setAttribute(PEN_MOUNTED, '')
      // A faint fence, only while someone lives here.
      var fence = el('div', 'dp-yard-fence')
      fence.hidden = true
      yard.appendChild(fence)
      document.body.appendChild(yard)

      var calmAll = false
      try { calmAll = window.matchMedia('(prefers-reduced-motion: reduce)').matches === true } catch (error) { /* no matchMedia */ }
      var raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : null
      var roamers = {}
      var jobs = []
      var polls = 0
      var frame = null
      var last = 0
      var stopped = false

      var between = function (low, high) { return low + Math.random() * (high - low) }

      /** Where a pig's feet may go: its sprite and name stay inside the pen. */
      function bounds(r) {
        var w = num(yard.clientWidth, 0) || num(window.innerWidth, 0)
        var h = num(yard.clientHeight, 0) || num(window.innerHeight, 0)
        var half = r.size / 2 + 6
        var x0 = Math.min(half, w / 2)
        var y0 = Math.min(r.size + 6, h / 2)
        return { x0: x0, x1: Math.max(x0, w - half), y0: y0, y1: Math.max(y0, h - 20), empty: w <= 0 || h <= 0 }
      }

      /**
       * Somewhere in the pen to start from — once the pen has a size: a
       * window still being laid out would put every pig in the same corner.
       */
      function settleIn(r) {
        var b = bounds(r)
        if (b.empty) return false
        r.x = between(b.x0, b.x1)
        r.y = between(b.y0, b.y1)
        r.placed = true
        r.roamerBox.hidden = false
        return true
      }

      var clamp = function (v, low, high) { return Math.max(low, Math.min(high, v)) }

      function setMove(r, move) {
        r.move = move
        r.roamerBox.setAttribute('data-move', move)
      }

      function place(r) {
        r.roamerBox.style.transform = 'translate(' + Math.round(r.x - r.size / 2) + 'px,' + Math.round(r.y - r.size) + 'px)'
        r.roamerBox.style.zIndex = String(Math.round(r.y))
        // The pig is drawn facing left; heading right, it is mirrored.
        r.face.style.transform = r.facing > 0 ? 'scaleX(-1)' : 'none'
      }

      /** Start the next thing a free pig does. */
      function begin(r, now) {
        var b = bounds(r)
        var s = Math.max(24, r.size)
        var move = pickRoamMove(Math.random, calmAll || r.calm)
        r.goal = null
        r.legs = []
        if (move === 'walk') {
          var angle = Math.random() * Math.PI * 2
          var reach = s * between(1.5, 4)
          r.goal = { x: clamp(r.x + Math.cos(angle) * reach, b.x0, b.x1), y: clamp(r.y + Math.sin(angle) * reach * 0.6, b.y0, b.y1) }
          r.speed = s * 0.9
        } else if (move === 'dash') {
          // Back and forth along one line, three to six times, at a gallop.
          var a = clamp(r.x - s * between(1.2, 3), b.x0, b.x1)
          var z = clamp(r.x + s * between(1.2, 3), b.x0, b.x1)
          var y = clamp(r.y + between(-6, 6), b.y0, b.y1)
          var legs = 3 + Math.floor(Math.random() * 4)
          var first = Math.random() < 0.5
          for (var i = 0; i < legs; i += 1) r.legs.push({ x: (i % 2 === 0) === first ? a : z, y: y })
          r.goal = r.legs.shift()
          r.speed = s * 3.4
        } else if (move === 'roll-x') {
          // Head first across the pen, turning wheels; back the other way at a wall.
          var dir = r.facing
          var gx = clamp(r.x + dir * s * between(1.5, 3), b.x0, b.x1)
          if (Math.abs(gx - r.x) < s * 0.5) gx = clamp(r.x - dir * s * between(1.5, 3), b.x0, b.x1)
          r.goal = { x: gx, y: r.y }
          r.speed = s * 1.8
        } else if (move === 'roll-y') {
          // Over and over onto its back, up or down the pen.
          var up = r.y - b.y0 > b.y1 - r.y
          r.goal = { x: r.x, y: clamp(r.y + (up ? -1 : 1) * s * between(0.8, 1.8), b.y0, b.y1) }
          r.speed = s * 1.2
        } else {
          r.until = now + (move === 'sit' ? between(3000, 7000)
            : move === 'lie' ? between(5000, 10000)
            : move === 'belly' ? between(2200, 4000)
            : between(900, 2600))
        }
        // A pen too small to go anywhere: stand a while instead.
        if (r.goal !== null && Math.hypot(r.goal.x - r.x, r.goal.y - r.y) < 2 && r.legs.length === 0) {
          r.goal = null
          move = 'rest'
          r.until = now + between(900, 2600)
        }
        setMove(r, move)
      }

      function step(r, dt, now) {
        if (!r.placed && !settleIn(r)) return
        var b = bounds(r)
        // The pen may have been redrawn smaller.
        r.x = clamp(r.x, b.x0, b.x1)
        r.y = clamp(r.y, b.y0, b.y1)
        if (!r.free) return
        if (r.goal === null) {
          if (now >= r.until) begin(r, now)
          if (r.goal === null) return
        }
        var dx = r.goal.x - r.x
        var dy = r.goal.y - r.y
        var dist = Math.hypot(dx, dy)
        // Facing where it goes, except tumbling up or down, which keeps its heading.
        if (Math.abs(dx) > 0.5 && r.move !== 'roll-y') r.facing = dx > 0 ? 1 : -1
        var reach = r.speed * dt
        if (dist > reach) {
          r.x += dx / dist * reach
          r.y += dy / dist * reach
          return
        }
        r.x = r.goal.x
        r.y = r.goal.y
        r.goal = r.legs.length > 0 ? r.legs.shift() : null
        if (r.goal === null) {
          // Catch its breath before the next thing.
          setMove(r, 'rest')
          r.until = now + between(300, 1200)
        }
      }

      function tick(now) {
        frame = null
        if (stopped) return
        var dt = last === 0 ? 0 : Math.min(0.1, (now - last) / 1000)
        last = now
        for (var id in roamers) {
          step(roamers[id], dt, now)
          place(roamers[id])
        }
        schedule()
      }

      function schedule() {
        if (raf === null || stopped || frame !== null || Object.keys(roamers).length === 0) return
        frame = raf(tick)
      }

      function draw(r, look) {
        r.roamerBox.style.setProperty('--friend-size', look.size + 'px')
        r.roamerBox.style.width = look.size + 'px'
        r.roamerBox.setAttribute('data-faded', look.faded ? 'true' : 'false')
        r.roamerBox.title = look.name
        Array.prototype.slice.call(r.body.children).forEach(function (child) { child.remove() })
        if (look.src !== null) {
          var img = document.createElement('img')
          img.className = 'dp-friend-img'
          img.alt = ''
          img.src = look.src
          r.body.appendChild(img)
        } else {
          r.body.appendChild(el('span', 'dp-friend-emoji', look.emoji))
        }
        r.label.textContent = look.name
        r.size = look.size
      }

      function newRoamer(id) {
        var roamerBox = el('div', 'dp-roamer')
        roamerBox.setAttribute('data-roamer', id)
        var face = el('div', 'dp-roamer-face')
        var body = el('div', 'dp-roamer-body')
        face.appendChild(body)
        roamerBox.appendChild(face)
        var label = el('span', 'dp-friend-name')
        roamerBox.appendChild(label)
        yard.appendChild(roamerBox)
        // Out of sight until it has somewhere to stand (settleIn).
        roamerBox.hidden = true
        return { id: id, roamerBox: roamerBox, face: face, body: body, label: label, size: 48, look: '', x: 0, y: 0, placed: false, facing: Math.random() < 0.5 ? -1 : 1, goal: null, legs: [], speed: 0, until: 0, move: '', free: false, calm: false }
      }

      /** Bring the yard in line with the pen mates on show. */
      function sync(list) {
        var seen = {}
        for (var i = 0; i < list.length; i += 1) {
          var m = list[i]
          if (m.id === '') continue
          seen[m.id] = true
          var r = roamers[m.id]
          var fresh = r === undefined
          if (fresh) r = roamers[m.id] = newRoamer(m.id)
          var look = friendLook(m, jobs)
          var key = JSON.stringify(look)
          if (key !== r.look) {
            r.look = key
            draw(r, look)
          }
          if (fresh) settleIn(r)
          var free = roamsFree(m)
          r.calm = CALM_MOODS[m.mood] === true
          if (free !== r.free || fresh) {
            r.free = free
            r.goal = null
            r.legs = []
            r.until = 0
            // Out, asleep or gone: it stays put in its own pose.
            setMove(r, free ? 'rest' : 'still')
          }
          r.roamerBox.setAttribute('data-roam', free ? 'free' : 'busy')
          place(r)
        }
        for (var id in roamers) {
          if (seen[id]) continue
          roamers[id].roamerBox.remove()
          delete roamers[id]
        }
        fence.hidden = Object.keys(roamers).length === 0
        schedule()
      }

      async function loadJobs() {
        try {
          var res = await fetch(STATE_URL + '?peek=1', { cache: 'no-store' })
          if (!res.ok) return
          jobs = arr(obj(await res.json()).jobs).map(function (job) { return { key: str(obj(job).key, ''), art: str(obj(job).art, null) } })
        } catch (error) { /* careers show the generic desk until the next try */ }
      }

      async function poll() {
        if (stopped) return
        // The job table hardly changes: once a minute is plenty.
        if (polls % 15 === 0) await loadJobs()
        polls += 1
        try {
          var res = await fetch(CLOUD_URL, { cache: 'no-store' })
          if (stopped) return
          if (res.status === 404) return sync([])
          if (res.ok) sync(friendsIn(normalizeCloud(await res.json())))
        } catch (error) { /* the next poll asks again */ }
      }

      poll()
      var pollTimer = window.setInterval(poll, POLL_MS)

      return function dispose() {
        stopped = true
        window.clearInterval(pollTimer)
        if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
        yard.remove()
        style.remove()
      }
    }

    function apply(ctx) {
      // A client plugin that throws while activating can take the whole web boot
      // down with it, so the pig never lets an exception escape.
      try {
        return mount(ctx)
      } catch (error) {
        console.warn('[dsh-pig] 挂载失败，猪先退到一边', error)
        return () => {}
      }
    }

    function mount(ctx) {
      // [dsh-piggy-claude-code mod] what the host asked for: the floating
      // widget (default) or the big two-column panel, and whether it can open
      // that big panel from the floating one (the ⤢ button).
      var options = isObj(ctx) ? ctx : {}
      // [ST0026] the desk's pig pen window: pen mates only, no pig of ours.
      if (options.layout === 'pen') return mountPen()
      var split = options.layout === 'split'
      var openBigPanel = typeof options.openPanel === 'function' ? options.openPanel : null
      // [ST0026] a desktop host can fence in a pen on the desk for pen mates to roam.
      var drawPen = typeof options.penDraw === 'function' ? options.penDraw : null
      var clearPen = typeof options.penClear === 'function' ? options.penClear : null
      if (document.querySelector('[' + MOUNTED + ']') !== null) {
        console.warn('[dsh-pig] 已存在实例，跳过重复挂载')
        return () => {}
      }

      // Nunito + Noto Sans SC, per the design system's standalone recipe. The
      // request is non-blocking (`display=swap`) and the token font stack falls
      // back to system faces, so an offline or blocked load degrades quietly
      // instead of breaking the panel.
      var font = document.createElement('link')
      font.rel = 'stylesheet'
      font.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900'
        + '&family=Noto+Sans+SC:wght@400;500;700&display=swap'
      document.head.appendChild(font)

      var style = document.createElement('style')
      style.textContent = CSS
      document.head.appendChild(style)

      var host = document.createElement('div')
      host.setAttribute(MOUNTED, '')
      var savedPos = readStore(POSITION_KEY)
      // The pig's position as the user set it, before any on-screen clamp.
      var userRight = 18
      var userBottom = 18
      if (savedPos !== null) {
        try {
          var parsed = JSON.parse(savedPos)
          if (parsed && typeof parsed.right === 'number') userRight = parsed.right
          if (parsed && typeof parsed.bottom === 'number') userBottom = parsed.bottom
        } catch (error) { /* ignore */ }
      }
      if (split) {
        // The big panel fills its window; the pig stands in the left column.
        host.setAttribute('data-layout', 'split')
      } else {
        host.style.right = userRight + 'px'
        host.style.bottom = userBottom + 'px'
      }

      // Keep the pig itself on screen — and nothing more. There used to be a
      // composer-avoidance floor here that forced the widget above the input box:
      // it existed because the wrapper swallowed clicks aimed at the send button.
      // `pointer-events:none` solves that properly now, so the clamp only ever
      // stopped the user from parking their pet where they wanted it.
      function clampPig() {
        if (split) return
        var vw = window.innerWidth || 0
        var vh = window.innerHeight || 0
        if (vw <= 0 || vh <= 0) return
        // Bound by the pig, not by the scene. The scene widens to the panel when
        // open, and clamping against that would shove the pig sideways on any
        // window resize; the panel's own overflow is `fitPanel`'s problem.
        var pigRect = pig.getBoundingClientRect ? pig.getBoundingClientRect() : null
        var w = (pigRect ? pigRect.width || 0 : 0) + 2 * PIG_PADDING_X
        // Vertically reserve the OPEN scene, or a pig parked high up pushes its
        // own hud off the top of the window the moment the panel opens.
        var sceneRect = scene.getBoundingClientRect ? scene.getBoundingClientRect() : null
        var h = Math.max(sceneRect ? sceneRect.height || 0 : 0, SCENE_RESERVE)
        var right = Math.min(Math.max(4, userRight), Math.max(4, vw - w - 4))
        // Only the pig anchors vertically. Clamping by the open panel would move
        // the pig when the panel appears, which is the one thing the layout
        // exists to prevent — `fitPanel` shrinks the panel instead.
        var bottom = Math.min(Math.max(4, userBottom), Math.max(4, vh - h - 4))
        host.style.right = Math.round(right) + 'px'
        host.style.bottom = Math.round(bottom) + 'px'
      }

      /**
       * [dsh-piggy-claude-code mod] The panel size the user dragged out, or
       * null for the default (292 px wide, as tall as its content).
       */
      function readCardSize() {
        try {
          var parsed = JSON.parse(readStore(CARD_SIZE_KEY) || 'null')
          if (isObj(parsed) && typeof parsed.w === 'number' && typeof parsed.h === 'number'
            && isFinite(parsed.w) && isFinite(parsed.h)) return { w: parsed.w, h: parsed.h }
        } catch (error) { /* ignore */ }
        return null
      }
      var cardSize = split ? null : readCardSize()

      /**
       * How much room the panel has: whichever side of the pig is roomier, and
       * the widest it can be while staying inside the window.
       */
      function panelRoom() {
        var vw = window.innerWidth || 0
        var vh = window.innerHeight || 0
        var rect = scene.getBoundingClientRect()
        var roomAbove = rect.top - PANEL_GAP - PANEL_MARGIN
        var roomBelow = vh - rect.bottom - PANEL_GAP - PANEL_MARGIN
        // Ties go above, which is where a bottom-docked pig expects its menu —
        // but a pig parked near the top must flip, otherwise its own menu opens
        // off the screen.
        var above = roomAbove >= roomBelow
        return {
          rect: rect,
          above: above,
          height: Math.max(PANEL_MIN_HEIGHT, Math.round(above ? roomAbove : roomBelow)),
          width: Math.max(0, vw - 2 * PANEL_MARGIN),
        }
      }

      /** A requested size, held between the minimum and what fits right now. */
      function clampCardSize(w, h, room) {
        var maxW = Math.max(PANEL_WIDTH, room.width)
        var maxH = Math.max(PANEL_MIN_HEIGHT, room.height)
        return {
          w: Math.round(Math.min(Math.max(w, PANEL_WIDTH), maxW)),
          h: Math.round(Math.min(Math.max(h, Math.min(CARD_MIN_HEIGHT, maxH)), maxH)),
        }
      }

      /**
       * Place the panel so it is fully on screen, wherever the pig has been
       * parked. The pig itself is never moved by this: the panel is absolutely
       * positioned, so it takes no space in the wrapper's box. A size the user
       * chose is honoured as far as the window allows, and re-clamped here on
       * every resize — the stored size itself is kept, so a window that grows
       * back gets the full panel back.
       */
      function fitPanel() {
        if (!isOpen || split) return
        var vw = window.innerWidth || 0
        var vh = window.innerHeight || 0
        if (vw <= 0 || vh <= 0) return

        var room = panelRoom()
        var rect = room.rect

        // Exactly one of top/bottom may apply. Clearing with '' would fall back
        // to the stylesheet's `bottom`, leaving both set — and an absolutely
        // positioned box with both edges pinned collapses to zero height.
        if (room.above) {
          card.style.top = 'auto'
          card.style.bottom = 'calc(100% + ' + PANEL_GAP + 'px)'
        } else {
          card.style.bottom = 'auto'
          card.style.top = 'calc(100% + ' + PANEL_GAP + 'px)'
        }
        card.style.maxHeight = room.height + 'px'

        // Horizontal: the panel is wider than the pig, so anchoring its right
        // edge to the pig can push it off the left of the window. A negative
        // `right` moves the panel without touching the wrapper's width, so the
        // pig stays exactly where it was put.
        var width = Math.min(PANEL_WIDTH, vw - 2 * PANEL_MARGIN)
        if (cardSize !== null) {
          var fitted = clampCardSize(cardSize.w, cardSize.h, room)
          width = Math.min(fitted.w, Math.max(0, vw - 2 * PANEL_MARGIN))
          card.style.width = Math.round(width) + 'px'
          card.style.height = fitted.h + 'px'
        } else {
          card.style.width = ''
          card.style.height = ''
        }
        card.style.maxWidth = Math.round(width) + 'px'
        var shift = PANEL_MARGIN - (rect.right - width)
        card.style.right = shift > 0 ? -Math.round(shift) + 'px' : '0px'

        // The hud lives inside the scene, which runs past the left edge whenever
        // the panel above had to be shifted back into view. Line it up with the
        // panel's left edge so it stays visible too.
        var cardLeft = Math.max(rect.right - width, PANEL_MARGIN)
        hud.style.left = Math.max(9, Math.round(cardLeft - rect.left)) + 'px'
      }

      var card = el('div', 'dp-card')
      // The pig lives beside the panel, not inside it, so it stays transparent
      // and unmoved when the panel opens.
      var scene = el('div', 'dp-scene')

      var hud = el('div', 'dp-hud')
      var hudName = el('div', null, T('猪猪'))
      var hudCoins = el('div', null, '🪙 0')
      var hudHealth = el('div', null, '💚 5/5')
      hud.appendChild(hudName)
      hud.appendChild(hudCoins)
      hud.appendChild(hudHealth)
      scene.appendChild(hud)

      var bubble = el('div', 'dp-bubble', '')
      bubble.hidden = true
      scene.appendChild(bubble)

      // [ST0014] Pen mates chosen in 在线, drawn smaller to our pig's left.
      var friends = el('div', 'dp-friends')
      friends.hidden = true
      scene.appendChild(friends)
      var friendsKey = ''
      // [ST0026] The desk's pen as the desktop host last told us: null on a
      // host without one, else { set, width, height }. While one is fenced
      // in, the pen mates roam in it (a window of its own) instead.
      var deskPen = null

      // What the pig is doing while it is out: a prop to work/read/travel with,
      // and a line showing how far through it is. Sits to the pig's left, so the
      // pig itself never shifts when it appears.
      var work = el('div', 'dp-work')
      var prop = el('span', 'dp-prop', '💼')
      var progressWrap = el('div', 'dp-progress')
      var progressFill = document.createElement('i')
      progressWrap.appendChild(progressFill)
      work.appendChild(prop)
      work.appendChild(progressWrap)
      work.hidden = true
      scene.appendChild(work)

      // Shown while the box is still shut, so it reads as something to poke
      // rather than a decorative cardboard box sitting in the corner.
      var pokeHint = el('div', 'dp-poke-hint')
      pokeHint.appendChild(el('span', null, '👆'))
      var pokeHintText = el('span', null, T('戳三下'))
      pokeHint.appendChild(pokeHintText)
      pokeHint.hidden = true
      scene.appendChild(pokeHint)

      var soul = document.createElement('img')
      soul.className = 'dp-soul'
      soul.alt = ''
      soul.src = ART_URL + 'soul.svg'
      soul.hidden = true
      scene.appendChild(soul)

      // Drawn stages (the piglet, the elder pig) use an <img>; the rest fall
      // back to the emoji. Both live in the pig box so the layout never cares.
      var pigArt = document.createElement('img')
      pigArt.className = 'dp-pig-img'
      pigArt.alt = ''
      pigArt.hidden = true
      var pigEmoji = el('span', 'dp-pig-emoji', '🐖')
      var pig = el('div', 'dp-pig')
      pig.appendChild(pigArt)
      pig.appendChild(pigEmoji)
      scene.appendChild(pig)
      // Right-click is not discoverable on its own, so the native tooltip says so.
      scene.title = T('左键摸摸 · 右键打开面板 · 拖动可移动')

      var bar = el('div', 'dp-bar')
      var icons = {}
      // Each icon's caption and its Chinese key, so a language switch can
      // relabel the bar in place without rebuilding it.
      var iconLabels = {}

      /** The tabs on show right now: the normal six, plus 调试 when dev mode is on. */
      function visibleTabs() {
        // [ST0014] 在线 only once the host has said it runs the cloud sync.
        // (`cloud` is still undefined while the bar is first built.)
        var list = !cloud ? TABS.filter(function (entry) { return entry.key !== 'online' }) : TABS
        return devMode ? list.concat([DEV_TAB]) : list
      }

      /** Rebuild the icon bar. Called whenever dev mode flips. */
      function paintBar() {
        while (bar.firstChild) bar.removeChild(bar.firstChild)
        var list = visibleTabs()
        for (var t = 0; t < list.length; t += 1) buildIcon(list[t])
        if (icons[tab] === undefined) tab = 'status'
        for (var k in icons) icons[k].setAttribute('data-active', k === tab ? 'true' : 'false')
      }

      function buildIcon(tab) {
        (function (tab) {
          var btn = button('dp-ico', { 'data-tab': tab.key }, function () {
            if (host.getAttribute('data-open') !== 'true') setOpen(true)
            select(tab.key)
          })
          btn.appendChild(el('span', 'dp-ico-e', tab.emoji))
          var caption = el('span', null, T(tab.label))
          btn.appendChild(caption)
          btn.setAttribute('aria-label', T(tab.label))
          icons[tab.key] = btn
          iconLabels[tab.key] = { node: caption, zh: tab.label }
          bar.appendChild(btn)
        })(tab)
      }

      for (var t = 0, initial = visibleTabs(); t < initial.length; t += 1) buildIcon(initial[t])

      /** Re-caption the icon bar in the current language. */
      function relabelBar() {
        for (var k in iconLabels) {
          iconLabels[k].node.textContent = T(iconLabels[k].zh)
          if (icons[k] !== undefined) icons[k].setAttribute('aria-label', T(iconLabels[k].zh))
        }
      }

      /**
       * [dsh-piggy-claude-code mod] The spreadsheet disguise: title bar, ribbon,
       * formula bar and column letters on top; row numbers down the left; sheet
       * tabs and the status bar at the bottom. Built once; `updateExcel` keeps
       * the words, the selected cell and the numbers current.
       */
      function buildExcelChrome() {
        var texts = []
        /** Remember a node's Chinese key so a language switch can relabel it. */
        function label(node, zh, attr) {
          texts.push({ node: node, zh: zh, attr: attr || null })
          return node
        }
        var top = el('div', 'dp-xl-top')
        var title = el('div', 'dp-xl-title')
        title.appendChild(el('span', 'dp-xl-logo', 'X'))
        var name = label(el('span', 'dp-xl-name'), XL_TITLE)
        title.appendChild(name)
        var win = el('span', 'dp-xl-win')
        win.setAttribute('aria-hidden', 'true')
        win.appendChild(el('span', null, '—'))
        win.appendChild(el('span', null, '☐'))
        win.appendChild(el('span', null, '✕'))
        title.appendChild(win)
        top.appendChild(title)

        var ribbon = el('div', 'dp-xl-ribbon')
        for (var r = 0; r < XL_RIBBON.length; r += 1) {
          var tabName = label(el('span'), XL_RIBBON[r])
          tabName.setAttribute('data-ribbon', XL_RIBBON[r])
          tabName.setAttribute('data-active', XL_RIBBON[r] === '开始' ? 'true' : 'false')
          ribbon.appendChild(tabName)
        }
        top.appendChild(ribbon)

        var tools = el('div', 'dp-xl-tools')
        tools.appendChild(label(el('span', 'dp-xl-tool'), '粘贴'))
        tools.appendChild(el('span', 'dp-xl-sep'))
        tools.appendChild(el('span', 'dp-xl-box', 'Calibri'))
        tools.appendChild(el('span', 'dp-xl-box', '11'))
        var looks = [['B', 'fontWeight', '700'], ['I', 'fontStyle', 'italic'], ['U', 'textDecoration', 'underline']]
        for (var k = 0; k < looks.length; k += 1) {
          var glyph = el('span', 'dp-xl-tool', looks[k][0])
          glyph.style[looks[k][1]] = looks[k][2]
          tools.appendChild(glyph)
        }
        tools.appendChild(el('span', 'dp-xl-sep'))
        tools.appendChild(el('span', 'dp-xl-tool', '%'))
        tools.appendChild(el('span', 'dp-xl-tool', '.00'))
        tools.appendChild(el('span', 'dp-xl-sep'))
        tools.appendChild(label(el('span', 'dp-xl-tool'), '条件格式'))
        tools.appendChild(el('span', 'dp-xl-sep'))
        // The one tool that does something: show the pig as an inserted picture.
        var pic = button(null, { 'data-xl-pic': 'toggle', 'aria-pressed': 'false' }, function () { setPic(!picOn) })
        label(pic, '图片')
        label(pic, '显示/隐藏小猪', 'title')
        tools.appendChild(pic)
        // A visible way back to the game skin, next to the picture tool.
        var exit = button(null, { 'data-skin-toggle': 'game' }, function () { setSkin('game') })
        label(exit, '返回')
        tools.appendChild(exit)
        top.appendChild(tools)

        var fx = el('div', 'dp-xl-fx')
        var nameBox = label(el('span', 'dp-xl-namebox', 'B2'), '名称框', 'aria-label')
        fx.appendChild(nameBox)
        var fxIcons = el('span', 'dp-xl-fxicons')
        fxIcons.setAttribute('aria-hidden', 'true')
        fxIcons.appendChild(el('span', null, '✕'))
        fxIcons.appendChild(el('span', null, '✓'))
        fxIcons.appendChild(el('i', null, 'fx'))
        fx.appendChild(fxIcons)
        var formula = el('span', 'dp-xl-formula', '')
        fx.appendChild(formula)
        top.appendChild(fx)

        var cols = el('div', 'dp-xl-cols')
        cols.setAttribute('aria-hidden', 'true')
        cols.appendChild(el('span', null, ''))
        var colCells = {}
        for (var c = 0; c < XL_COLUMNS.length; c += 1) {
          colCells[XL_COLUMNS[c]] = el('span', null, XL_COLUMNS[c])
          cols.appendChild(colCells[XL_COLUMNS[c]])
        }
        top.appendChild(cols)

        var rows = el('div', 'dp-xl-rows')
        rows.setAttribute('aria-hidden', 'true')
        var list = el('ol')
        for (var n = 1; n <= XL_ROWS; n += 1) list.appendChild(el('li', null, String(n)))
        rows.appendChild(list)

        var bottom = el('div', 'dp-xl-bottom')
        var sheets = el('div', 'dp-xl-sheets')
        var nav = el('span', 'dp-xl-nav')
        nav.setAttribute('aria-hidden', 'true')
        nav.appendChild(el('span', null, '◀'))
        nav.appendChild(el('span', null, '▶'))
        sheets.appendChild(nav)
        // The six tabs are moved in here, before the "+" (which does nothing,
        // like a real one would — it just looks the part).
        var plus = button('dp-xl-plus', { 'data-xl-plus': 'true' }, function () {})
        plus.textContent = '+'
        label(plus, '新工作表', 'aria-label')
        label(plus, '新工作表', 'title')
        sheets.appendChild(plus)
        bottom.appendChild(sheets)

        var status = el('div', 'dp-xl-status')
        var msg = el('span', 'dp-xl-msg', '')
        status.appendChild(msg)
        var stats = el('span', 'dp-xl-stats', '')
        status.appendChild(stats)
        var views = el('span', 'dp-xl-views')
        var normal = button(null, { 'data-xl-view': 'normal', 'aria-pressed': 'true' }, function () {})
        normal.textContent = '▦'
        label(normal, '普通', 'title')
        label(normal, '普通', 'aria-label')
        views.appendChild(normal)
        var page = button(null, { 'data-xl-view': 'layout', 'aria-pressed': 'false' }, function () {})
        page.textContent = '▤'
        label(page, '页面布局', 'title')
        label(page, '页面布局', 'aria-label')
        views.appendChild(page)
        // The way back, dressed as Excel's third view button.
        var back = button(null, { 'data-skin-toggle': 'game' }, function () { setSkin('game') })
        back.textContent = '◫'
        label(back, '返回游戏', 'title')
        label(back, '返回游戏', 'aria-label')
        views.appendChild(back)
        status.appendChild(views)
        var zoom = el('span', 'dp-xl-zoom')
        zoom.setAttribute('aria-hidden', 'true')
        zoom.appendChild(el('span', null, '－'))
        var track = el('span', 'dp-xl-track')
        track.appendChild(el('i'))
        zoom.appendChild(track)
        zoom.appendChild(el('span', null, '＋'))
        zoom.appendChild(el('span', null, '100%'))
        status.appendChild(zoom)
        bottom.appendChild(status)

        return {
          top: top, rows: rows, bottom: bottom, texts: texts, nameBox: nameBox, formula: formula,
          colCells: colCells, sheets: sheets, plus: plus, msg: msg, stats: stats, pic: pic,
        }
      }

      var content = el('div', 'dp-content')

      // Panel first, pig second: as flex siblings in a bottom-anchored column,
      // the pig ends up at a fixed screen position whether the panel is open or
      // not, and the panel can only ever grow upwards from it.
      card.appendChild(content)
      card.appendChild(bar)

      // [dsh-piggy-claude-code mod] Floating only: a ⤢ that asks the host for
      // the big panel (when it can open one), and grips to resize the panel.
      // Both are appended after the content and the icon bar — the header is
      // pulled to the top with `order`, the grips are absolutely positioned —
      // so the panel's flow is unchanged.
      var expand = null
      var grips = []
      if (!split) {
        if (openBigPanel !== null) {
          var cardHead = el('div', 'dp-card-head')
          expand = button('dp-icon-btn', { 'data-open-panel': 'true' }, function () {
            try { openBigPanel() } catch (error) { console.warn('[dsh-pig] 打不开大面板', error) }
          })
          expand.textContent = '⤢'
          cardHead.appendChild(expand)
          card.appendChild(cardHead)
        }
        for (var g = 0; g < 3; g += 1) {
          var grip = el('div', 'dp-grip')
          grip.setAttribute('data-resize', ['corner', 'top', 'left'][g])
          grips.push(grip)
          card.appendChild(grip)
        }
      }

      // [dsh-piggy-claude-code mod] The big panel: the very same scene, card,
      // content and icon bar, framed as two columns — and, in the spreadsheet
      // skin, wrapped in fake Excel chrome.
      var side = null
      var xl = null
      if (split) {
        var left = el('div', 'dp-left')
        left.appendChild(scene)
        side = el('div', 'dp-side')
        left.appendChild(side)
        xl = buildExcelChrome()
        var sheet = el('div', 'dp-split')
        sheet.appendChild(xl.rows)
        sheet.appendChild(left)
        sheet.appendChild(card)
        host.appendChild(xl.top)
        host.appendChild(sheet)
        host.appendChild(xl.bottom)
      } else {
        host.appendChild(card)
        host.appendChild(scene)
      }
      if (document.body !== null && document.body !== undefined) {
        document.body.appendChild(host)
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          try { document.body.appendChild(host) } catch (error) { /* shell not ready */ }
        }, { once: true })
      }

      // ---- state ----
      var view = normalize(null)
      var tab = 'status'
      var stage = 'primary'
      // Which care action's item picker is open, if any.
      var picker = null
      // [dsh-piggy-claude-code mod] the rename field: whether it is open, what
      // has been typed so far, and the live <input> (rebuilt on every render).
      var renaming = false
      var renameDraft = ''
      var renameInput = null
      // Subjects ticked for one multi-subject sitting, and the stage they are for.
      var studyPicks = { stage: null, keys: [] }
      // The unfolded travel region: null until the player picks one.
      var openRegion = readStore(REGION_KEY)
      // The bag's shelf: consumables, travel souvenirs or school diplomas.
      var bagView = readStore(BAG_KEY)
      // The big panel is always open: there is no floating card to toggle.
      var isOpen = split || readStore(OPEN_KEY) === 'true'
      // [dsh-piggy-claude-code mod] the big panel's skin, the spreadsheet's
      // optional pig picture, the page title to give back, the last Escape.
      var skin = split && readStore(SKIN_KEY) === 'excel' ? 'excel' : 'game'
      var picOn = readStore(PIC_KEY) === '1'
      var originalTitle = typeof document.title === 'string' ? document.title : null
      var lastEscape = 0
      var xlMessage = null
      var lastStage = null
      var lastPendingAt = 0
      var pollTimer = null
      var reactTimer = null
      var stopped = false
      var busy = false
      // [ST0015] the blackjack hand that just ended, shown until the next deal.
      var blackjackLast = null
      // [ST0015] which page of the shop tab is open: the shelves, or the casino.
      var shopPage = 'shop'
      // [Q0016] which page of the work tab is open: the jobs, or the gym.
      var workPage = 'work'
      // [ST0018] the page the content was last drawn for: a rebuild of the same
      // page keeps its scroll, a different tab or sub-page starts at the top.
      var scrollPage = null
      // [ST0007] the updater's last state (null: none, or not known yet), whether
      // the host has one at all, and the versions the pig already announced.
      var update = null
      var updateRoute = true
      var updateTold = {}
      // [ST0014] the cloud login (null: no such host route, or not known yet),
      // whether the login form is open, what is typed in it (the panel is
      // rebuilt on every poll, so drafts live here), and notices already said.
      var cloud = null
      var cloudRoute = true
      var cloudOpen = false
      var cloudBusy = false
      var cloudDraft = { server: '', email: '', code: '', pen: '' }
      var cloudFocus = null
      var cloudSaid = {}
      // [ST0014 P3] the pen's join form and invite picker.
      var penJoining = false
      var penKind = 'work'
      var penPick = ''

      // ---- animation ----
      /** The sprite the pig settles back to after a reaction; null = emoji. */
      var baseArt = null
      /** '--piglet' / '--middle' / '--elder' while the stage dresses every pose, else ''. */
      var wearQuery = ''

      /** Our pig's pose (see poseOf), careers looked up in our snapshot's job table. */
      function poseFor(stage, moodKey, moodLevel, activity) {
        return poseOf(stage, moodKey, moodLevel, activity, view.jobs)
      }

      /** Show a drawn sprite by name, or fall back to the emoji. */
      function showArt(art, emoji) {
        baseArt = art === null || art === undefined ? null : art
        if (baseArt !== null) {
          // Mid-reaction the reaction pose stays up; the timer restores baseArt.
          if (pig.getAttribute('data-react-art') === null) {
            var src = ART_URL + baseArt + '.svg' + wearQuery
            if (pigArt.getAttribute('src') !== src) pigArt.src = src
          }
          pigArt.hidden = false
          pigEmoji.hidden = true
          pig.setAttribute('data-art', baseArt)
        } else {
          pigArt.hidden = true
          pigArt.removeAttribute('src')
          pigEmoji.hidden = false
          pigEmoji.textContent = emoji
          pig.removeAttribute('data-art')
        }
      }

      function react(kind, ms) {
        if (reactTimer !== null) window.clearTimeout(reactTimer)
        pig.setAttribute('data-react', kind)
        // A drawn pig swaps to its reaction pose, which animates itself, and
        // holds it long enough for one loop to read.
        var pose = pigArt.hidden ? undefined : REACT_ART[kind]
        if (pose !== undefined) {
          pigArt.src = ART_URL + pose + '.svg' + wearQuery
          pig.setAttribute('data-react-art', pose)
          ms = Math.max(ms || 900, 1600)
        } else {
          pig.removeAttribute('data-react-art')
        }
        // The flat (collapsed) form needs the non-translating keyframes.
        reactTimer = window.setTimeout(function () {
          pig.removeAttribute('data-react')
          if (pig.getAttribute('data-react-art') !== null) {
            pig.removeAttribute('data-react-art')
            if (baseArt !== null) pigArt.src = ART_URL + baseArt + '.svg' + wearQuery
          }
          reactTimer = null
        }, ms || 900)
      }

      function burst(emojis, count) {
        for (var i = 0; i < (count || 1); i += 1) {
          (function (index) {
            window.setTimeout(function () {
              if (stopped) return
              var node = el('span', 'dp-fx', emojis[index % emojis.length])
              node.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 46) + 'px')
              // Anchor to the pig, not the scene. The scene is panel-wide when
              // open, so fixed coordinates put every particle off to one side.
              var spot = headSpot()
              node.style.left = (spot.x + Math.round((Math.random() - 0.5) * 22)) + 'px'
              node.style.top = spot.y + 'px'
              scene.appendChild(node)
              window.setTimeout(function () { node.remove() }, 1200)
            }, index * 110)
          })(i)
        }
      }

      /** Just above the pig's head, in scene coordinates. */
      function headSpot() {
        var fallback = { x: 24, y: 8 }
        if (typeof pig.getBoundingClientRect !== 'function' || typeof scene.getBoundingClientRect !== 'function') return fallback
        var p = pig.getBoundingClientRect()
        var s = scene.getBoundingClientRect()
        if (p.width === 0 && p.height === 0) return fallback
        return { x: p.left - s.left + p.width / 2, y: p.top - s.top - 20 }
      }

      var REACTIONS = {
        hatch: { kind: 'levelup', ms: 980, fx: ['🥚', '✨', '🐖', '🎉'], count: 4, say: '孵出来啦！' },
        feed: { kind: 'feed', ms: 900, fx: ['🍎', '😋', '✨'], count: 3, say: '吃掉了！' },
        bathe: { kind: 'bathe', ms: 1050, fx: ['🫧', '🫧', '💧', '✨'], count: 4, say: '洗干净啦～' },
        play: { kind: 'play', ms: 900, fx: ['🎾', '⭐', '💨'], count: 3, say: '好开心！' },
        pet: { kind: 'pet', ms: 620, fx: ['❤️', '❤️'], count: 2, say: '好舒服…' },
        work: { kind: 'away', ms: 900, fx: ['💼', '🧱', '🪙'], count: 3, say: '出门打工！' },
        study: { kind: 'away', ms: 900, fx: ['📚', '✏️', '🧠'], count: 3, say: '上学去！' },
        trip: { kind: 'away', ms: 900, fx: ['🧳', '🗺', '✨'], count: 3, say: '出发旅行！' },
        calloff: { kind: 'refuse', ms: 520, fx: ['💨'], count: 1, say: '提前回来了…' },
        buy: { kind: 'pet', ms: 620, fx: ['🪙', '🛒'], count: 2, say: '买到了！' },
        use: { kind: 'pet', ms: 620, fx: ['✨'], count: 2, say: '用掉了。' },
        rename: { kind: 'levelup', ms: 900, fx: ['✏️', '✨'], count: 2, say: '好名字！' },
        // [dsh-piggy-claude-code mod] bed and back.
        sleep: { kind: 'sleep', ms: 900, fx: ['💤', '🌙'], count: 2, say: '晚安…' },
        wake: { kind: 'pet', ms: 620, fx: ['☀️'], count: 1, say: '早上好！' },
      }

      function flash(action) {
        var spec = REACTIONS[action]
        if (spec === undefined) return
        react(spec.kind, spec.ms)
        burst(spec.fx, spec.count)
        showBubble(T(spec.say), 2200)
      }

      var bubbleTimer = null
      function showBubble(text, ms) {
        if (bubbleTimer !== null) window.clearTimeout(bubbleTimer)
        bubble.textContent = text
        bubble.hidden = false
        // The spreadsheet hides the pig, so what it says goes to the status bar.
        xlMessage = text
        updateExcelMessage()
        bubbleTimer = window.setTimeout(function () {
          bubble.hidden = true
          bubbleTimer = null
          xlMessage = null
          updateExcelMessage()
        }, ms || 2600)
      }

      function toast(text) {
        var node = el('div', 'dp-toast', text)
        card.insertBefore(node, card.firstChild)
        window.setTimeout(function () { node.remove() }, 4800)
      }

      // ---- open / close ----
      function setOpen(next) {
        if (split) next = true
        isOpen = next
        host.setAttribute('data-open', next ? 'true' : 'false')
        // Collapsed must be the pig and *nothing else*. One switch hides the
        // whole panel now that the pig is not inside it — and driving visibility
        // from the DOM rather than only from CSS makes it something a test can
        // actually assert.
        card.hidden = !next
        // The hud rides with the panel: a bare pig in the corner should not have
        // a name and a coin count floating beside it. The big panel's left
        // column says all of that already.
        hud.hidden = split || !next
        if (!next) bubble.hidden = true
        if (!split) writeStore(OPEN_KEY, next ? 'true' : 'false')
        if (next) {
          renderContent()
          fitPanel()
        } else {
          // Back to the default anchor so the next open starts from a clean
          // slate. `auto` (not '') keeps the stylesheet's bottom from re-applying
          // alongside a stale top.
          card.style.right = ''
          card.style.top = 'auto'
          card.style.bottom = ''
          card.style.maxHeight = ''
          card.style.maxWidth = ''
          card.style.width = ''
          card.style.height = ''
        }
      }

      function select(next) {
        tab = next
        picker = null
        shopPage = 'shop'
        workPage = 'work'
        renderContent()
        for (var k in icons) icons[k].setAttribute('data-active', k === tab ? 'true' : 'false')
        if (split) {
          renderSide()
          updateExcel()
        }
      }

      /**
       * Developer tab. Drives the pig into any state so a change can be looked at
       * immediately instead of waiting days for it — and so the states that are
       * hard to reach by playing (dying, the last illness stage, an elder pig)
       * can be checked at all.
       */
      function devTab() {
        content.appendChild(el('div', 'dp-dev-note', '🔧 ' + T('开发者模式 · Ctrl+Shift+D 关闭')))

        var p = view.pig
        if (p === null) {
          content.appendChild(el('div', 'dp-empty', T('还没有猪。先「拆开纸盒」再调。')))
          return
        }

        /** A row of small buttons under a caption. */
        function group(title, entries) {
          var head = el('div', 'dp-title')
          head.appendChild(el('b', null, T(title)))
          content.appendChild(head)
          var wrap = el('div', 'dp-dev-row')
          for (var i = 0; i < entries.length; i += 1) {
            (function (entry) {
              var btn = button('dp-mini dp-dev-btn', { 'data-dev': entry.key }, function () { entry.run() })
              btn.textContent = devLabel(entry.label)
              wrap.appendChild(btn)
            })(entries[i])
          }
          content.appendChild(wrap)
        }

        var patch = function (body) { send('dev', { patch: body }) }

        /** '🍎 饿' → emoji kept, the words translated. */
        function devLabel(label) {
          var space = label.indexOf(' ')
          if (space < 0) return T(label)
          return label.slice(0, space) + ' ' + T(label.slice(space + 1))
        }

        group('状态', [
          { key: 'full', label: '😊 满状态', run: function () { patch({ satiety: 100, happiness: 100, cleanliness: 100, health: 5 }) } },
          { key: 'hungry', label: '🍎 饿', run: function () { patch({ satiety: 10 }) } },
          { key: 'dirty', label: '🫧 脏', run: function () { patch({ cleanliness: 10 }) } },
          { key: 'lonely', label: '🥺 孤单', run: function () { patch({ happiness: 10 }) } },
          { key: 'sleepy', label: '💤 困', run: function () { patch({ satiety: 90, happiness: 90, cleanliness: 90 }) } },
        ])

        group('生病', [
          { key: 'cold1', label: '🤒 感冒一期', run: function () { patch({ illness: { chain: 0, stage: 1 }, health: 4 }) } },
          { key: 'cold4', label: '☠️ 肺炎', run: function () { patch({ illness: { chain: 0, stage: 4 }, health: 1 }) } },
          { key: 'cough', label: '🫁 肺结核', run: function () { patch({ illness: { chain: 1, stage: 4 }, health: 1 }) } },
          { key: 'belly', label: '🤢 胃癌', run: function () { patch({ illness: { chain: 2, stage: 4 }, health: 1 }) } },
          { key: 'cure', label: '💚 治好', run: function () { patch({ illness: null, health: 5 }) } },
        ])

        // [dsh-piggy-claude-code mod] the pig grows by weight, so these set
        // weight; the sprite follows it (40 px at hatching → 200 px at 120 kg →
        // 400 px at 500 kg).
        group('体重', [
          { key: 'box', label: '📦 纸盒', run: function () { patch({ hatched: false }) } },
          { key: 'piglet', label: '小猪', run: function () { patch({ hatched: true, weightG: 2000 }) } },
          { key: 'young', label: '青年', run: function () { patch({ weightG: 20000 }) } },
          { key: 'middle', label: '中年', run: function () { patch({ weightG: 50000 }) } },
          { key: 'elder', label: '老年', run: function () { patch({ weightG: 80000 }) } },
          { key: 'big', label: '⚖️ 120 kg', run: function () { patch({ weightG: 120000 }) } },
          { key: 'full', label: '⚖️ 500 kg', run: function () { patch({ weightG: 500000 }) } },
          { key: 'heavier', label: '⚖️ +5 kg', run: function () { patch({ weightG: Math.round(parseFloat(p.weight) * 1000) + 5000 }) } },
        ])

        group('资源', [
          { key: 'coin100', label: '🪙 +100', run: function () { patch({ coins: p.coins + 100 }) } },
          { key: 'coin999', label: '🪙 9999', run: function () { patch({ coins: 9999 }) } },
          { key: 'traits', label: '🧠+5 ✨+5 💪+5', run: function () { patch({ traits: { intel: 5, charm: 5, strong: 5 } }) } },
          { key: 'bag', label: '🎒 全套药', run: function () { patch({ inventory: { med1: 3, med2: 3, med3: 3, med4: 3, soul: 2, apple: 5, soap: 5, yoyo: 3 } }) } },
        ])

        group('生死', [
          { key: 'kill', label: '💀 弄死', run: function () { patch({ dead: true }) } },
          { key: 'revive', label: '✨ 复活', run: function () { patch({ dead: false, health: 5 }) } },
          { key: 'adopt', label: '📦 领养', run: function () { send('adopt') } },
          { key: 'reset', label: '🔄 重置', run: function () { send('reset') } },
        ])

        group('面板', [
          { key: 'open', label: '展开/收起', run: function () { setOpen(host.getAttribute('data-open') !== 'true') } },
          { key: 'away1', label: '⏩ +1 小时', run: function () { patch({ __advanceMs: 3600000 }) } },
          { key: 'away24', label: '⏩ +1 天', run: function () { patch({ __advanceMs: 86400000 }) } },
        ])

        content.appendChild(el('div', 'dp-dev-note',
          T('当前：{stage} · 健康 {health} · 🪙 {coins}', { stage: p.stage.label, health: p.health, coins: p.coins })
          + (p.illness === null ? '' : ' · ' + p.illness.name)))
      }

      // ---- panel rendering ----
      function labelledBar(label, value, valueText, variant) {
        var row = el('div', 'dp-row')
        row.appendChild(el('span', null, label))
        row.appendChild(el('b', null, valueText))
        content.appendChild(row)
        content.appendChild(meter(value, variant))
      }

      function statusTab() {
        var p = view.pig
        if (p === null) return
        // The big panel shows the numbers and the care buttons in its left
        // column, so its status tab keeps only what lives nowhere else.
        if (split) {
          splitStatusTab()
          return
        }
        nameRow()
        labelledBar('🍚 ' + T('饱食'), p.satiety, p.satiety + '%')
        labelledBar('❤️ ' + T('心情'), p.happiness, p.happiness + '%', 'dp-mood')
        labelledBar('🫧 ' + T('清洁'), p.cleanliness, p.cleanliness + '%', 'dp-clean')
        labelledBar('💚 ' + T('健康'), p.healthPercent, p.health + '/' + view.maxHealth, 'dp-health')

        var traits = el('div', 'dp-traits')
        traits.appendChild(el('span', null, '🧠 ' + T('智力') + ' ' + p.traits.intel))
        traits.appendChild(el('span', null, '✨ ' + T('魅力') + ' ' + p.traits.charm))
        traits.appendChild(el('span', null, '💪 ' + T('武力') + ' ' + p.traits.strong))
        content.appendChild(traits)

        var info = el('div', 'dp-row')
        info.appendChild(el('span', null, '⚖️ ' + T('体重') + ' ' + p.weight
          + (p.growthPercent === null ? '' : ' · ' + T('成长 {pct}%', { pct: p.growthPercent }))))
        info.appendChild(el('b', null, '🪙 ' + p.coins))
        content.appendChild(info)

        var age = el('div', 'dp-row')
        age.appendChild(el('span', null, '🎂 ' + T('年龄')))
        age.appendChild(el('b', null, p.ageLabel + ' · ' + p.stage.label))
        content.appendChild(age)
        growthNote()

        content.appendChild(careGrid())
        if (picker !== null && (view.care[picker] ?? []).length > 0) content.appendChild(pickerPanel(picker))

        if (p.memories.length > 0) {
          content.appendChild(el('div', 'dp-memo', p.memories.slice(-3).join('\n')))
        }

        content.appendChild(langSwitcher())
      }

      /** [dsh-piggy-claude-code mod] The big panel's status tab: name, looks, growth, memories. */
      function splitStatusTab() {
        var p = view.pig
        nameRow()
        if (p.stage.line !== '') content.appendChild(el('div', 'dp-note', p.stage.line))
        growthNote()
        if (p.memories.length > 0) {
          content.appendChild(el('div', 'dp-memo', p.memories.slice(-12).join('\n')))
        }
      }

      /** [dsh-piggy-claude-code mod] the pig grows by weight, not by age. */
      function growthNote() {
        var p = view.pig
        if (p.kgToNextStage !== null) {
          content.appendChild(el('div', 'dp-empty',
            T('再长 {kg} kg 就长成下一阶段了', { kg: p.kgToNextStage.toFixed(1) })))
        }
      }

      /**
       * [ST0004] The bag's wardrobe shelf: every decoration as a pill, worn ones
       * pressed, locked ones dashed with how to earn them. One per slot —
       * putting on a hat takes the other hat off. The pig itself is the preview.
       * [ST0012] One section per slot, head to toe, so the one-per-slot rule
       * shows; a slot an older panel does not know goes last, under its key.
       */
      function wardrobeShelf() {
        var p = view.pig
        var worn = p.wardrobe.filter(item => item.worn)
        var head = el('div', 'dp-row dp-wear-head')
        head.appendChild(el('span', null, worn.length === 0 ? T('什么也没穿') : worn.map(item => item.emoji + item.label).join(' · ')))
        var auto = button('dp-mini', { 'data-wear-auto': 'true', 'aria-pressed': String(p.outfit.auto) }, function () {
          if (!p.outfit.auto) send('wear', { auto: true })
        })
        auto.textContent = T('跟着阶段')
        head.appendChild(auto)
        content.appendChild(head)
        var slots = WEAR_SLOT_ORDER.filter(slot => p.wardrobe.some(item => item.slot === slot))
        p.wardrobe.forEach(item => { if (slots.indexOf(item.slot) === -1) slots.push(item.slot) })
        slots.forEach(slot => wardrobeSection(slot, p.wardrobe.filter(item => item.slot === slot)))
      }

      /** [ST0012] One slot's decorations, under the slot's name. */
      function wardrobeSection(slot, items) {
        var title = WEAR_SLOT_TITLE[slot]
        var name = el('div', 'dp-shelf', title === undefined ? slot : title[0] + ' ' + T(title[1]))
        name.setAttribute('data-wear-slot', slot)
        content.appendChild(name)
        var grid = el('div', 'dp-actions dp-wear')
        grid.setAttribute('data-wear-slot', slot)
        for (var wi = 0; wi < items.length; wi += 1) {
          (function (item) {
            var pick = button('dp-btn', {
              'data-wear': item.key, 'data-slot': item.slot, 'aria-pressed': String(item.worn),
              title: item.unlocked ? item.label : T('还没解锁：{hint}', { hint: item.hint }),
            }, function () {
              if (item.unlocked) send('wear', { item: item.key, on: !item.worn })
            })
            if (!item.unlocked) {
              pick.disabled = true
              pick.setAttribute('data-locked', 'true')
            }
            pick.appendChild(el('span', null, item.unlocked ? item.emoji : '🔒'))
            pick.appendChild(el('span', null, item.label))
            grid.appendChild(pick)
          })(items[wi])
        }
        content.appendChild(grid)
      }

      /** Wherever the care buttons live: the status tab, or the big panel's left column. */
      function repaintCare() {
        if (split) renderSide()
        else renderContent()
      }

      /** Feed · bathe · play · pat. */
      function careGrid() {
        var grid = el('div', 'dp-actions dp-care')
        for (var i = 0; i < MODES.length; i += 1) {
          (function (key) {
            var info = view.actions[key]
            var shelf = view.care[key] ?? []
            var needsItem = shelf.length > 0
            var btn = button('dp-btn', { 'data-action': key }, function () {
              // Feeding, washing and playing all spend something, so the button
              // opens the pig's bag instead of guessing what to use.
              if (needsItem) {
                picker = picker === key ? null : key
                repaintCare()
              } else {
                send(key)
              }
            })
            btn.setAttribute('data-open-picker', picker === key ? 'true' : 'false')
            btn.appendChild(el('span', 'dp-e', CARE_LABEL[key][1]))
            btn.appendChild(el('span', null, T(CARE_LABEL[key][0])))
            if (needsItem) btn.appendChild(el('span', 'dp-count', String(shelf.length)))
            // Trust but verify: a dead pig cannot be cared for even if the host
            // forgot to clear its readiness flags.
            if (!info.ready || view.dead) {
              btn.disabled = true
              if (view.dead) btn.appendChild(el('span', 'dp-wait', '—'))
              else if (info.waitSeconds > 0) btn.appendChild(el('span', 'dp-wait', T('{n}s', { n: info.waitSeconds })))
              else if (info.blocked === 'away') btn.appendChild(el('span', 'dp-wait', T('不在家')))
            }
            grid.appendChild(btn)
          })(MODES[i])
        }
        // [dsh-piggy-claude-code mod] bed and back, under the four care buttons.
        var asleep = view.pig !== null && view.pig.asleep
        var bed = button('dp-btn dp-btn-wide', { 'data-action': asleep ? 'wake' : 'sleep' }, function () {
          send(asleep ? 'wake' : 'sleep')
        })
        bed.appendChild(el('span', 'dp-e', asleep ? '☀️' : '😴'))
        bed.appendChild(el('span', null, T(asleep ? '叫醒' : '睡觉')))
        if (view.dead || view.activity !== null) {
          bed.disabled = true
          if (view.activity !== null) bed.appendChild(el('span', 'dp-wait', T('不在家')))
        }
        grid.appendChild(bed)
        return grid
      }

      /**
       * [dsh-piggy-claude-code mod] The big panel's left column: who the pig
       * is, its four bars, traits, weight and coins, what it is off doing, the
       * care buttons and the language. Rebuilt on every render, like the tabs.
       * The spreadsheet skin lays the same rows out as label/value cells in
       * columns A and B, with the bars as data bars and no emoji.
       */
      function renderSide() {
        if (!split || side === null) return
        keepScroll([left, sheet], renderSideNow)
      }

      function renderSideNow() {
        side.textContent = ''
        var game = skin === 'game'
        var e = function (emoji) { return game ? emoji + ' ' : '' }
        var p = view.pig
        var head = el('div', 'dp-side-head')
        if (view.hatched !== true || p === null) {
          head.appendChild(el('b', 'dp-side-name', T('一个{box}', { box: view.boxStage.label })))
          head.appendChild(el('span', 'dp-side-sub', T('点开拆开它')))
          side.appendChild(head)
          side.appendChild(langSwitcher())
          side.appendChild(skinButton())
          return
        }
        head.appendChild(el('b', 'dp-side-name', p.name))
        head.appendChild(el('span', 'dp-side-sub', [p.stage.label, p.ageLabel].filter(Boolean).join(' · ')))
        side.appendChild(head)

        var stats = el('div', 'dp-stats')
        stats.appendChild(statRow(e('🍚') + T('饱食'), p.satiety, p.satiety + '%', ''))
        stats.appendChild(statRow(e('❤️') + T('心情'), p.happiness, p.happiness + '%', 'dp-mood'))
        stats.appendChild(statRow(e('🫧') + T('清洁'), p.cleanliness, p.cleanliness + '%', 'dp-clean'))
        stats.appendChild(statRow(e('💚') + T('健康'), p.healthPercent, p.health + '/' + view.maxHealth, 'dp-health'))
        side.appendChild(stats)

        var kvs = el('div', 'dp-kvs')
        kvs.appendChild(kv(e('🧠') + T('智力'), p.traits.intel))
        kvs.appendChild(kv(e('✨') + T('魅力'), p.traits.charm))
        kvs.appendChild(kv(e('💪') + T('武力'), p.traits.strong))
        kvs.appendChild(kv(e('⚖️') + T('体重'), p.weight))
        kvs.appendChild(kv(e('🪙') + T('猪币'), p.coins))
        side.appendChild(kvs)

        var a = view.activity
        if (a !== null) {
          var away = el('div', 'dp-alert dp-work dp-side-away')
          away.appendChild(el('b', null, e(a.emoji) + T('在外面：{label}', { label: a.label })))
          away.appendChild(el('div', null, T('还有 {n} 秒', { n: a.secondsLeft })))
          var track = el('div', 'dp-progress')
          var fill = document.createElement('i')
          fill.style.width = Math.max(0, Math.min(100, a.progress)) + '%'
          track.appendChild(fill)
          away.appendChild(track)
          side.appendChild(away)
        }

        side.appendChild(careGrid())
        if (picker !== null && (view.care[picker] ?? []).length > 0) side.appendChild(pickerPanel(picker))
        side.appendChild(langSwitcher())
        side.appendChild(skinButton())
      }

      /** One bar: label, value, and the meter (a data bar in the spreadsheet). */
      function statRow(label, value, valueText, variant) {
        var row = el('div', 'dp-stat')
        row.appendChild(el('span', 'dp-stat-k', label))
        row.appendChild(el('b', 'dp-stat-v', valueText))
        row.appendChild(meter(value, variant))
        return row
      }

      function kv(label, value) {
        var row = el('div', 'dp-kv')
        row.appendChild(el('span', null, label))
        row.appendChild(el('b', null, String(value)))
        return row
      }

      /** The game skin's way into the spreadsheet (the boss key is the quick one). */
      function skinButton() {
        var go = button('dp-link dp-skin-btn', { 'data-skin-toggle': 'excel' }, function () { setSkin('excel') })
        go.textContent = '📊 ' + T('伪装成表格')
        go.title = T('老板键：连按两次 Esc 或 Ctrl+Shift+E')
        return go
      }

      /** Skin, picture and bar placement, from the current state. */
      function applySkin() {
        if (!split) return
        host.setAttribute('data-skin', skin)
        host.setAttribute('data-pic', picOn ? 'true' : 'false')
        // Excel keeps its sheet tabs at the bottom of the window; the game skin
        // keeps them on top of the right-hand card (CSS `order`).
        bar.remove()
        if (skin === 'excel') xl.sheets.insertBefore(bar, xl.plus)
        else card.appendChild(bar)
        updateExcel()
      }

      function setSkin(next) {
        if (!split) return
        next = next === 'excel' ? 'excel' : 'game'
        if (next === skin) return
        skin = next
        writeStore(SKIN_KEY, skin)
        picker = null
        applySkin()
        renderSide()
        renderContent()
      }

      function setPic(on) {
        picOn = on === true
        writeStore(PIC_KEY, picOn ? '1' : '0')
        host.setAttribute('data-pic', picOn ? 'true' : 'false')
        if (xl !== null) xl.pic.setAttribute('aria-pressed', picOn ? 'true' : 'false')
      }

      /** "就绪", or whatever the (hidden) pig just said. */
      function updateExcelMessage() {
        if (xl === null) return
        xl.msg.textContent = xlMessage !== null ? xlMessage : T('就绪')
      }

      /**
       * The spreadsheet's moving parts: its words in the pig's language, the
       * selected cell (one column per tab), a formula naming the pig, and the
       * status bar's sums over the four bars. Also owns `document.title`.
       */
      function updateExcel() {
        if (xl === null) return
        try {
          if (skin === 'excel') document.title = T(XL_TITLE)
          else if (originalTitle !== null) document.title = originalTitle
        } catch (error) { /* a read-only title */ }
        for (var i = 0; i < xl.texts.length; i += 1) {
          var entry = xl.texts[i]
          if (entry.attr !== null) entry.node.setAttribute(entry.attr, T(entry.zh))
          else entry.node.textContent = T(entry.zh)
        }
        var keys = visibleTabs().map(t => t.key)
        var index = Math.max(0, keys.indexOf(tab))
        var column = XL_COLUMNS.charAt(Math.min(XL_COLUMNS.length - 1, index + 1))
        xl.nameBox.textContent = column + '2'
        for (var letter in xl.colCells) xl.colCells[letter].setAttribute('data-active', letter === column ? 'true' : 'false')
        var p = view.pig
        if (view.hatched === true && p !== null) {
          var call = tab === 'status' ? 'PIG' : 'PIG.' + tab.toUpperCase()
          xl.formula.textContent = '=' + call + '("' + p.name.replace(/"/g, '""') + '")'
          var values = [p.satiety, p.happiness, p.cleanliness, p.healthPercent]
          var sum = values.reduce((total, v) => total + v, 0)
          xl.stats.textContent = [
            T('平均值：{n}', { n: Math.round(sum / values.length * 100) / 100 }),
            T('计数：{n}', { n: values.length }),
            T('求和：{n}', { n: sum }),
          ].join('    ')
        } else {
          xl.formula.textContent = '=BOX()'
          xl.stats.textContent = ''
        }
        xl.pic.setAttribute('aria-pressed', picOn ? 'true' : 'false')
        updateExcelMessage()
      }

      /**
       * [dsh-piggy-claude-code mod] The pig's name with a ✏️. The field it opens
       * lives in `renameDraft`, not in the DOM: the panel is rebuilt on every
       * poll, so the <input> itself is disposable.
       */
      function nameRow() {
        var p = view.pig
        var row = el('div', 'dp-name')
        row.appendChild(el('span', null, '🏷️'))
        row.appendChild(el('span', 'dp-grow', p.name))
        var editable = p.canRename && !view.dead
        if (editable) {
          var edit = button('dp-icon-btn', {
            'data-rename': 'open', 'aria-label': T('改名'), 'aria-expanded': String(renaming),
          }, function () {
            if (renaming) { cancelRename(); return }
            renaming = true
            renameDraft = p.renameFree ? '' : p.name
            renderContent()
            focusRename(null)
          })
          edit.title = T('改名')
          edit.textContent = '✏️'
          row.appendChild(edit)
        }
        content.appendChild(row)
        if (renaming && editable) content.appendChild(renamePanel())
        else renameInput = null
      }

      function renamePanel() {
        var p = view.pig
        var wrap = el('div', 'dp-rename')
        var line = el('div', 'dp-rename-row')
        renameInput = null
        // No free rename and no card: say where one comes from instead of
        // offering a field that can only be refused.
        if (!p.renameFree && p.renameCards <= 0) {
          wrap.appendChild(el('div', 'dp-note',
            T('改名要用一张 🪪 更名卡 —— 商店里有卖，{price} 🪙', { price: p.renameCardPrice })))
          var shop = button('dp-mini', { 'data-rename': 'shop' }, function () {
            renaming = false
            select('shop')
          })
          shop.textContent = T('去商店')
          line.appendChild(shop)
          var back = button('dp-btn', { 'data-rename': 'cancel' }, cancelRename)
          back.textContent = T('算了')
          line.appendChild(back)
          wrap.appendChild(line)
          return wrap
        }
        wrap.appendChild(el('div', 'dp-note', p.renameFree
          ? T('起个名字 · 免费')
          : T('改名会用掉 1 张 🪪（还有 {n} 张）', { n: p.renameCards })))
        var input = document.createElement('input')
        input.className = 'dp-input'
        input.type = 'text'
        input.maxLength = NAME_MAX
        input.value = renameDraft
        input.placeholder = p.renameFree ? T('最多 16 个字') : p.name
        input.setAttribute('data-rename', 'input')
        input.setAttribute('aria-label', T('改名'))
        input.setAttribute('autocomplete', 'off')
        input.addEventListener('input', function () { renameDraft = String(input.value ?? '') })
        input.addEventListener('keydown', function (event) {
          // Keys typed into the field are the field's, not the host page's.
          event.stopPropagation?.()
          // Enter that confirms an IME candidate must not submit the name.
          if (event.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') { event.preventDefault?.(); submitRename() }
          else if (event.key === 'Escape') { event.preventDefault?.(); cancelRename() }
        })
        line.appendChild(input)
        var ok = button('dp-mini', { 'data-rename': 'ok' }, submitRename)
        ok.textContent = T('确定')
        line.appendChild(ok)
        var cancel = button('dp-btn', { 'data-rename': 'cancel' }, cancelRename)
        cancel.textContent = T('算了')
        line.appendChild(cancel)
        wrap.appendChild(line)
        renameInput = input
        return wrap
      }

      function submitRename() {
        if (busy) return
        var name = renameDraft.trim()
        if (name === '' || Array.from(name).length > NAME_MAX) {
          showBubble(T('名字要 1–16 个字'), 2400)
          return
        }
        renaming = false
        renameInput = null
        renderContent()
        send('rename', { name: name })
      }

      function cancelRename() {
        renaming = false
        renameDraft = ''
        renameInput = null
        renderContent()
      }

      /** Is the player typing a name right now? Then the poll must not rebuild under them. */
      function renameHasFocus() {
        return renaming && renameInput !== null && document.activeElement === renameInput
      }

      /** Put the caret back in the (rebuilt) field; `range` is the old selection. */
      function focusRename(range) {
        if (renameInput === null || typeof renameInput.focus !== 'function') return
        try {
          renameInput.focus()
          var end = String(renameInput.value ?? '').length
          if (typeof renameInput.setSelectionRange === 'function') {
            renameInput.setSelectionRange(range ? range[0] : end, range ? range[1] : end)
          }
        } catch (error) { /* not focusable yet */ }
      }

      /**
       * [dsh-piggy-claude-code mod] 🌐 语言: one button per language the host
       * offers, each named in its own language so it can be found from any of
       * them. The current one is pressed; the others post `lang`.
       */
      function langSwitcher() {
        var wrap = el('div', 'dp-lang')
        var head = el('div', 'dp-row')
        head.style.marginTop = '10px'
        head.appendChild(el('span', null, '🌐 ' + T('语言')))
        wrap.appendChild(head)
        var row = el('div', 'dp-actions dp-langs')
        row.style.marginTop = '4px'
        for (var i = 0; i < view.langs.length; i += 1) {
          (function (entry) {
            var pick = button('dp-btn', { 'data-lang': entry.key, 'aria-pressed': String(view.lang === entry.key) }, function () {
              if (view.lang !== entry.key) send('lang', { lang: entry.key })
            })
            pick.setAttribute('lang', entry.key)
            pick.appendChild(el('span', null, entry.label))
            row.appendChild(pick)
          })(view.langs[i])
        }
        wrap.appendChild(row)
        if (update !== null) wrap.appendChild(versionRow())
        return wrap
      }

      /**
       * [ST0007] A newer version, above every tab: what is new and the update
       * button, then the download and install progress. Null when there is
       * nothing to say.
       */
      function updateAlert() {
        if (update === null || update.latest === null) return null
        var u = update
        var box = el('div', 'dp-alert dp-update')
        box.setAttribute('data-update-status', u.status)
        if (u.status === 'downloading') {
          box.appendChild(el('b', null, '⬇️ ' + T('正在下载 v{version}… {percent}%', { version: u.latest.version, percent: u.progress })))
          var track = el('div', 'dp-progress')
          var fill = document.createElement('i')
          fill.style.width = u.progress + '%'
          track.appendChild(fill)
          box.appendChild(track)
          return box
        }
        if (u.status === 'installing') {
          box.appendChild(el('b', null, '🔧 ' + T('正在安装 v{version}，猪猪马上回来…', { version: u.latest.version })))
          return box
        }
        if (u.status !== 'available') return null
        box.appendChild(el('b', null, '⬆️ ' + T('有新版本 v{version}', { version: u.latest.version })))
        box.appendChild(el('div', 'dp-dim', T('当前版本 v{current}', { current: u.current })))
        if (u.latest.notes !== '') box.appendChild(el('div', 'dp-line dp-dim dp-update-notes', u.latest.notes))
        if (u.error === 'install') box.appendChild(el('div', 'dp-line', T('更新失败：{message}', { message: u.message })))
        if (!u.canInstall) box.appendChild(el('div', 'dp-line dp-dim', T('这份猪猪不能自己更新，请从下载页面下载新版本安装。')))
        var actions = el('div', 'dp-actions')
        var go = u.canInstall
          ? button('dp-btn dp-btn-wide', { 'data-update': 'install' }, function () { updateAct('install') })
          : button('dp-btn dp-btn-wide', { 'data-update': 'page' }, function () { updateAct('page') })
        go.appendChild(el('span', null, u.canInstall ? '⬆️' : '🌐'))
        go.appendChild(el('span', null, u.canInstall
          ? T(u.error === 'install' ? '再试一次' : '立即更新')
          : T('打开下载页面')))
        actions.appendChild(go)
        box.appendChild(actions)
        return box
      }

      /** [ST0007] The running version and a way to look for a newer one. */
      function versionRow() {
        var u = update
        var row = el('div', 'dp-row dp-version')
        var said = u.status === 'checking' ? T('正在检查更新…')
          : u.error === 'check' ? T('检查更新失败')
          : u.latest !== null ? T('有新版本 v{version}', { version: u.latest.version })
          : u.status === 'latest' ? T('已经是最新版本')
          : ''
        row.appendChild(el('span', null, '🔖 v' + u.current + (said === '' ? '' : ' · ' + said)))
        var busyNow = u.status === 'checking' || u.status === 'downloading' || u.status === 'installing'
        var again = button('dp-mini', { 'data-update': 'check' }, function () { updateAct('check') })
        again.textContent = T('检查更新')
        again.disabled = busyNow
        row.appendChild(again)
        return row
      }

      /** [ST0014] Why a cloud step failed, in words. */
      function cloudReason(reply) {
        var r = isObj(reply) ? str(reply.reason, '') : ''
        var wait = isObj(reply) ? num(reply.retryAfter, 0) : 0
        if (r === 'bad-email') return T('邮箱格式不对')
        if (r === 'bad-server') return T('服务器地址要以 https:// 开头')
        if (r === 'too-soon') return T('刚发过验证码，{n} 秒后再试', { n: wait })
        if (r === 'too-many') return T('验证码发得太多了，过一会儿再试')
        if (r === 'frozen') return T('输错太多次，这个网络被冻结 {n} 分钟', { n: Math.max(1, Math.ceil(wait / 60)) })
        if (r === 'wrong-code' || r === 'bad-request') return T('验证码不对，或者已经过期')
        if (r === 'not-invited') return T('这个邮箱不在邀请名单里')
        if (r === 'mail-failed' || r === 'mail-quota') return T('验证码邮件没发出去，稍后再试')
        if (r === 'offline') return T('连不上云端')
        if (r === 'revoked') return T('这台设备已经在别处退出登录')
        if (r === 'no-code') return T('先发送验证码')
        if (r === 'no-such-pen') return T('没有这个邀请码的猪圈')
        if (r === 'pen-full') return T('这个猪圈满了')
        if (r === 'in-a-pen') return T('已经在一个猪圈里了')
        if (r === 'no-such-invite') return T('这个邀请已经失效了')
        if (r === 'cannot-go') {
          var why = isObj(reply) ? str(reply.why, '') : ''
          var whyText = why === 'away' ? T('在外面') : why === 'job-locked' || why === 'locked' ? T('条件还不够') : why === 'poor' ? T('钱不够') : why === 'hungry' ? T('太饿了') : why === 'weak' ? T('身体太虚') : why === 'capped' ? T('这门课在这个学段上满了') : why
          return isObj(reply) && reply.who === 'partner'
            ? T('朋友的猪去不了：{why}', { why: whyText })
            : T('你的猪去不了：{why}', { why: whyText })
        }
        return T('出错了（{reason}）', { reason: r || '?' })
      }

      /** [ST0014] "刚刚" / "5 分钟前" for the last sync. */
      function cloudAgo(at) {
        if (!(at > 0)) return T('还没同步过')
        var minutes = Math.floor((Date.now() - at) / 60000)
        if (minutes < 1) return T('刚刚同步')
        if (minutes < 60) return T('{n} 分钟前同步', { n: minutes })
        return T('{n} 小时前同步', { n: Math.floor(minutes / 60) })
      }

      /** [ST0014] Is this pen mate drawn on our desk? */
      function penShown(id) {
        return penShownIn(cloud, id)
      }

      /**
       * [ST0014] Draw the chosen pen mates to our pig's left: their own pose
       * and outfit, at most two thirds of their size (and never bigger than a
       * plump pig), a name underneath. Rebuilt only when something changed,
       * so the sprites do not flicker on every poll. [ST0026] While the desk
       * has a pen drawn, they live in there instead.
       */
      function renderFriends() {
        var list = deskPen !== null && deskPen.set ? [] : friendsIn(cloud)
        var drawn = list.map(function (m) { return friendLook(m, view.jobs) })
        var key = JSON.stringify(drawn)
        if (key === friendsKey) return
        friendsKey = key
        Array.prototype.slice.call(friends.children).forEach(function (child) { child.remove() })
        friends.hidden = drawn.length === 0
        for (var i = 0; i < drawn.length; i += 1) {
          var d = drawn[i]
          var one = el('div', 'dp-friend')
          one.style.setProperty('--friend-size', d.size + 'px')
          one.setAttribute('data-faded', d.faded ? 'true' : 'false')
          one.title = d.name
          if (d.src !== null) {
            var img = document.createElement('img')
            img.className = 'dp-friend-img'
            img.alt = ''
            img.src = d.src
            one.appendChild(img)
          } else {
            one.appendChild(el('span', 'dp-friend-emoji', d.emoji))
          }
          one.appendChild(el('span', 'dp-friend-name', d.name))
          friends.appendChild(one)
        }
      }

      /** [ST0014] 在线: the cloud login, then the pig pen and who shows on the desk. */
      function onlineTab() {
        if (cloud === null) {
          content.appendChild(el('div', 'dp-empty', T('连接不上宿主')))
          return
        }
        content.appendChild(cloudBox())
      }

      /** [ST0014] Who of the pen shows beside our pig: a line, two shortcuts and a toggle per pig. */
      function penShowControls(pen) {
        var others = pen.members.filter(function (m) { return !m.you })
        var wrap = el('div', 'dp-pen-show')
        if (others.length === 0) {
          wrap.appendChild(el('div', 'dp-note', T('朋友加入后，可以选择让它们的猪出现在你的猪旁边。')))
          return wrap
        }
        var shownCount = others.filter(function (m) { return penShown(m.id) }).length
        var said = cloud.penShow === 'all' ? T('全部')
          : shownCount === 0 ? T('只有自己')
          : T('{n} 只', { n: shownCount })
        var head = el('div', 'dp-row dp-version')
        head.appendChild(el('span', null, '👀 ' + T('桌面上显示：{who}', { who: said })))
        var self = button('dp-mini', { 'data-cloud-act': 'pen-show-self', 'aria-pressed': String(shownCount === 0) }, function () { cloudAct('pen-show', { show: 'self' }) })
        self.textContent = T('只看自己')
        self.disabled = cloudBusy
        head.appendChild(self)
        var every = button('dp-mini', { 'data-cloud-act': 'pen-show-all', 'aria-pressed': String(cloud.penShow === 'all') }, function () { cloudAct('pen-show', { show: 'all' }) })
        every.textContent = T('全部显示')
        every.disabled = cloudBusy
        head.appendChild(every)
        wrap.appendChild(head)
        return wrap
      }

      /**
       * [ST0026] The pen on the desk: its size, and fencing one in by dragging
       * across the desk (the host takes over the screen for that), again, or
       * taking it down so the pen mates stand beside our pig once more.
       */
      function deskPenControls() {
        var wrap = el('div', 'dp-pen-area')
        var head = el('div', 'dp-row dp-version')
        head.appendChild(el('span', null, '🏡 ' + (deskPen.set
          ? T('桌面猪圈 {w}×{h}', { w: deskPen.width, h: deskPen.height })
          : T('桌面上还没有猪圈'))))
        var draw = button('dp-mini', { 'data-desk-pen': 'draw' }, function () { drawPen() })
        draw.textContent = deskPen.set ? T('重新圈') : T('在桌面上圈一块')
        head.appendChild(draw)
        if (deskPen.set && clearPen !== null) {
          var clear = button('dp-mini', { 'data-desk-pen': 'clear' }, function () { clearPen() })
          clear.textContent = T('拆掉')
          head.appendChild(clear)
        }
        wrap.appendChild(head)
        if (!deskPen.set) wrap.appendChild(el('div', 'dp-note', T('在桌面上拖出一块地方，没事做的朋友的猪就在里面跑来跑去、打滚、躺着。')))
        return wrap
      }

      /** [ST0014] Show or hide one pen mate; 'all' turns into an explicit list first. */
      function togglePenShow(id) {
        var others = cloud.pen.members.filter(function (m) { return !m.you }).map(function (m) { return m.id })
        var current = others.filter(penShown)
        var next = current.indexOf(id) >= 0 ? current.filter(function (x) { return x !== id }) : current.concat([id])
        cloudAct('pen-show', { show: next.length === 0 ? 'self' : (next.length === others.length ? 'all' : next) })
      }

      /** [ST0014 P3] An outing's name in the panel's language, from the tables the snapshot sent. */
      function outingLabel(kind, key, fallback) {
        var list = kind === 'work' ? view.jobs : kind === 'study' ? view.subjects : []
        if (kind === 'trip' && view.world !== null) {
          for (var r = 0; r < view.world.regions.length; r += 1) list = list.concat(view.world.regions[r].places)
        }
        for (var i = 0; i < list.length; i += 1) if (list[i].key === key) return list[i].emoji + ' ' + list[i].label
        return fallback
      }

      /** [ST0014 P3] What can be picked for an invite of `kind`: `{ value, label }`, value = JSON args. */
      function penChoices(kind) {
        var out = []
        if (kind === 'work') {
          for (var i = 0; i < view.jobs.length; i += 1) out.push({ value: JSON.stringify([view.jobs[i].key]), label: view.jobs[i].emoji + ' ' + view.jobs[i].label })
        } else if (kind === 'study') {
          for (var s = 0; s < view.stages.length; s += 1) {
            if (!view.stages[s].unlocked) continue
            for (var j = 0; j < view.subjects.length; j += 1) {
              out.push({ value: JSON.stringify([[view.subjects[j].key], view.stages[s].key]), label: view.stages[s].label + ' · ' + view.subjects[j].emoji + ' ' + view.subjects[j].label })
            }
          }
        } else if (kind === 'trip' && view.world !== null) {
          for (var r = 0; r < view.world.regions.length; r += 1) {
            var places = view.world.regions[r].places
            for (var p = 0; p < places.length; p += 1) out.push({ value: JSON.stringify([places[p].key]), label: places[p].emoji + ' ' + places[p].label })
          }
        }
        return out
      }

      function penSelect(key, options, current, onPick) {
        var select = document.createElement('select')
        select.className = 'dp-input'
        select.setAttribute('data-cloud', key)
        for (var i = 0; i < options.length; i += 1) {
          var option = document.createElement('option')
          option.value = options[i].value
          option.textContent = options[i].label
          if (options[i].value === current) option.selected = true
          select.appendChild(option)
        }
        select.addEventListener('focus', function () { cloudFocus = key })
        select.addEventListener('blur', function () { if (cloudFocus === key) cloudFocus = null })
        select.addEventListener('change', function () { onPick(String(select.value)) })
        return select
      }

      /**
       * [ST0014 P3] 🐷 猪圈: friends' pigs and what they are up to, invites to
       * head out together (30% faster, 30% more), and the code to share.
       */
      function penBox() {
        var pen = cloud.pen
        var wrap = el('div', 'dp-pen')
        var head = el('div', 'dp-row dp-version')
        wrap.appendChild(head)
        if (pen === null) {
          head.appendChild(el('span', null, '🐷 ' + T('猪圈') + ' · ' + T('和朋友的猪一起出门：快 30%、收获多 30%')))
          if (!penJoining) {
            var make = button('dp-mini', { 'data-cloud-act': 'pen-create' }, function () { cloudAct('pen-create', { name: T('猪圈') }) })
            make.textContent = T('建一个')
            make.disabled = cloudBusy
            head.appendChild(make)
            var join = button('dp-mini', { 'data-cloud-act': 'pen-join-open' }, function () { penJoining = true; renderContent(); renderSide() })
            join.textContent = T('加入')
            head.appendChild(join)
            return wrap
          }
          var line = el('div', 'dp-rename-row')
          line.appendChild(cloudInput('pen', T('6 位邀请码'), 'text'))
          var go = button('dp-mini', { 'data-cloud-act': 'pen-join' }, function () {
            cloudAct('pen-join', { code: cloudDraft.pen.trim() })
          })
          go.textContent = T('加入')
          go.disabled = cloudBusy
          line.appendChild(go)
          var back = button('dp-btn', { 'data-cloud-act': 'pen-join-cancel' }, function () { penJoining = false; renderContent(); renderSide() })
          back.textContent = T('算了')
          line.appendChild(back)
          wrap.appendChild(line)
          return wrap
        }

        head.appendChild(el('span', null, '🐷 ' + pen.name + ' · ' + T('邀请码 {code}', { code: pen.code })))
        var leave = button('dp-mini', { 'data-cloud-act': 'pen-leave' }, function () { cloudAct('pen-leave') })
        leave.textContent = T('退出猪圈')
        leave.disabled = cloudBusy
        head.appendChild(leave)

        var list = el('div', 'dp-list')
        for (var i = 0; i < pen.members.length; i += 1) {
          var m = pen.members[i]
          var doing = m.dead ? T('已经走了')
            : m.activity !== null ? outingLabel(m.activity.kind, m.activity.key, m.activity.emoji + ' ' + m.activity.label) + (m.activity.partner !== '' ? ' 🤝 ' + m.activity.partner : '')
            : m.asleep ? T('在睡觉') : T('在家')
          var item = el('div', 'dp-item')
          item.appendChild(el('span', null, m.owner ? '👑' : '🐷'))
          var grow = el('div', 'dp-grow')
          grow.appendChild(el('div', null, m.name + (m.you ? ' ' + T('（你）') : '')))
          grow.appendChild(el('div', 'dp-dim', doing))
          item.appendChild(grow)
          // [ST0014] show this pig beside ours, or not.
          if (!m.you && m.id !== '') {
            (function (member) {
              var on = penShown(member.id)
              var eye = button('dp-mini dp-pen-eye', { 'data-pen-show': member.id, 'aria-pressed': String(on) }, function () { togglePenShow(member.id) })
              eye.textContent = on ? T('显示中') : T('不显示')
              eye.disabled = cloudBusy
              item.appendChild(eye)
            })(m)
          }
          list.appendChild(item)
        }
        wrap.appendChild(list)
        wrap.appendChild(penShowControls(pen))
        if (deskPen !== null && drawPen !== null) wrap.appendChild(deskPenControls())

        for (var k = 0; k < pen.invites.length; k += 1) {
          (function (inv) {
            var what = outingLabel(inv.kind, inv.kind === 'study' ? arr(inv.args[0])[0] : inv.args[0], inv.label)
            var inviteCard = el('div', 'dp-alert dp-work')
            if (inv.mine) {
              inviteCard.appendChild(el('div', null, T('等朋友接受：一起去 {what}', { what: what })))
              var withdraw = button('dp-mini', { 'data-cloud-act': 'pen-cancel' }, function () { cloudAct('pen-cancel', { inviteId: inv.id }) })
              withdraw.textContent = T('撤回')
              withdraw.disabled = cloudBusy
              inviteCard.appendChild(withdraw)
            } else {
              inviteCard.appendChild(el('b', null, '🤝 ' + T('{from} 邀请一起去 {what}', { from: inv.from, what: what })))
              var yes = button('dp-mini', { 'data-cloud-act': 'pen-accept' }, function () { cloudAct('pen-accept', { inviteId: inv.id }) })
              yes.textContent = T('一起去')
              yes.disabled = cloudBusy || view.activity !== null
              inviteCard.appendChild(yes)
            }
            wrap.appendChild(inviteCard)
          })(pen.invites[k])
        }

        if (pen.members.length > 1 && view.activity === null && !pen.invites.some(function (inv) { return inv.mine })) {
          var kinds = [{ value: 'work', label: T('打工') }, { value: 'study', label: T('学习') }, { value: 'trip', label: T('旅行') }]
          var choices = penChoices(penKind)
          if (!choices.some(function (c) { return c.value === penPick })) penPick = choices.length > 0 ? choices[0].value : ''
          var pick = el('div', 'dp-rename-row')
          pick.appendChild(penSelect('pen-kind', kinds, penKind, function (value) { penKind = value; penPick = ''; renderContent(); renderSide() }))
          pick.appendChild(penSelect('pen-item', choices, penPick, function (value) { penPick = value }))
          var ask = button('dp-mini', { 'data-cloud-act': 'pen-invite' }, function () {
            if (penPick === '') return
            cloudAct('pen-invite', { kind: penKind, args: JSON.parse(penPick) })
          })
          ask.textContent = T('邀请')
          ask.disabled = cloudBusy || penPick === ''
          pick.appendChild(ask)
          wrap.appendChild(pick)
        }
        return wrap
      }

      /** [ST0014] One field of the login form; its text lives in `cloudDraft`. */
      function cloudInput(key, placeholder, type) {
        var input = document.createElement('input')
        input.className = 'dp-input'
        input.type = type
        input.value = cloudDraft[key]
        input.placeholder = placeholder
        input.setAttribute('data-cloud', key)
        input.setAttribute('aria-label', placeholder)
        input.setAttribute('autocomplete', key === 'code' ? 'one-time-code' : (key === 'email' ? 'email' : 'off'))
        if (key === 'code') { input.inputMode = 'numeric'; input.maxLength = 6 }
        if (key === 'pen') { input.maxLength = 6; input.style.textTransform = 'uppercase' }
        input.addEventListener('input', function () { cloudDraft[key] = String(input.value ?? '') })
        input.addEventListener('focus', function () { cloudFocus = key })
        input.addEventListener('blur', function () { if (cloudFocus === key) cloudFocus = null })
        input.addEventListener('keydown', function (event) {
          event.stopPropagation?.()
          if (event.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter') { event.preventDefault?.(); if (key === 'pen') cloudAct('pen-join', { code: cloudDraft.pen.trim() }); else cloudSubmit() }
          else if (event.key === 'Escape') { event.preventDefault?.(); cloudOpen = false; cloudFocus = null; renderContent(); renderSide() }
        })
        return input
      }

      /** [ST0014] Is the player typing in the login form? Then polls must not rebuild it. */
      function cloudHasFocus() {
        return cloudFocus !== null && document.activeElement !== null && document.activeElement?.getAttribute?.('data-cloud') === cloudFocus
      }

      function cloudSubmit() {
        if (cloud === null || cloudBusy) return
        if (cloud.phase === 'code-sent') {
          var code = cloudDraft.code.replace(/\s+/g, '')
          if (!/^\d{6}$/.test(code)) { showBubble(T('验证码是 6 位数字'), 2400); return }
          cloudAct('verify', { code: code })
          return
        }
        cloudAct('code', { email: cloudDraft.email.trim(), server: (cloudDraft.server || cloud.server).trim() })
      }

      /**
       * [ST0014] ☁️ 云同步, under the languages: log in with an emailed code,
       * then how the sync stands. Only on hosts that run the pig server.
       */
      function cloudBox() {
        var c = cloud
        var box = el('div', 'dp-cloud')
        var row = el('div', 'dp-row dp-version')
        box.appendChild(row)

        if (c.phase === 'choose' && c.conflict !== null) {
          var chooseBox = el('div', 'dp-alert dp-legacy')
          chooseBox.appendChild(el('b', null, '☁️ ' + T('云端已经有一只猪了')))
          chooseBox.appendChild(el('div', 'dp-line', T('云端：{name}（{coins} 🪙）· 这台电脑：{local}（{localCoins} 🪙）', {
            name: c.conflict.cloud.name, coins: c.conflict.cloud.coins, local: c.conflict.local.name, localCoins: c.conflict.local.coins,
          })))
          chooseBox.appendChild(el('div', 'dp-line dp-dim', T('一个账号只能养一只猪。用云端的猪的话，这台电脑上的猪会存成备份文件。')))
          var acts = el('div', 'dp-actions')
          var keep = button('dp-btn', { 'data-cloud-act': 'keep-cloud' }, function () { cloudAct('keep-cloud') })
          keep.appendChild(el('span', null, T('用云端的猪')))
          acts.appendChild(keep)
          var leave = button('dp-btn', { 'data-cloud-act': 'sign-out' }, function () { cloudAct('sign-out') })
          leave.appendChild(el('span', null, T('退出登录')))
          acts.appendChild(leave)
          chooseBox.appendChild(acts)
          row.appendChild(el('span', null, '☁️ ' + c.email))
          box.appendChild(chooseBox)
          return box
        }

        if (c.linked) {
          var said = c.phase === 'offline' ? T('连不上云端，联网后自动同步')
            : c.phase === 'error' ? cloudReason({ reason: c.lastError })
            : c.phase === 'syncing' ? T('正在同步…')
            : cloudAgo(c.lastSyncAt)
          row.appendChild(el('span', null, '☁️ ' + c.email + ' · ' + said + (c.waiting > 0 ? ' · ' + T('{n} 条待上传', { n: c.waiting }) : '')))
          var now = button('dp-mini', { 'data-cloud-act': 'sync' }, function () { cloudAct('sync') })
          now.textContent = T('同步')
          now.disabled = cloudBusy || c.phase === 'syncing'
          row.appendChild(now)
          var out = button('dp-mini', { 'data-cloud-act': 'sign-out' }, function () { cloudAct('sign-out') })
          out.textContent = T('退出')
          out.disabled = cloudBusy
          row.appendChild(out)
          box.appendChild(penBox())
          return box
        }

        if (c.phase === 'linking') {
          row.appendChild(el('span', null, '☁️ ' + T('正在连接云端…')))
          return box
        }

        row.appendChild(el('span', null, '☁️ ' + T('云同步') + ' · ' + (c.phase === 'code-sent' ? T('验证码已发到 {email}', { email: c.email }) : T('未登录'))))
        if (!cloudOpen && c.phase !== 'code-sent') {
          var open = button('dp-mini', { 'data-cloud-act': 'open' }, function () {
            cloudOpen = true
            renderContent()
            renderSide()
          })
          open.textContent = T('登录')
          row.appendChild(open)
          if (c.lastError === 'revoked') box.appendChild(el('div', 'dp-note', cloudReason({ reason: 'revoked' })))
          return box
        }

        var form = el('div', 'dp-rename')
        if (c.phase === 'code-sent') {
          form.appendChild(el('div', 'dp-note', T('输入邮件里的 6 位验证码（10 分钟内有效）')))
          var line = el('div', 'dp-rename-row')
          line.appendChild(cloudInput('code', T('验证码'), 'text'))
          var go = button('dp-mini', { 'data-cloud-act': 'verify' }, cloudSubmit)
          go.textContent = T('登录')
          go.disabled = cloudBusy
          line.appendChild(go)
          form.appendChild(line)
          var again = el('div', 'dp-rename-row')
          var resend = button('dp-btn', { 'data-cloud-act': 'resend' }, function () {
            cloudAct('code', { email: c.email, server: c.server })
          })
          resend.textContent = T('重新发送')
          resend.disabled = cloudBusy
          again.appendChild(resend)
          form.appendChild(again)
        } else {
          form.appendChild(el('div', 'dp-note', T('用邮箱登录，多台电脑养同一只猪。不用密码，每次登录发验证码。')))
          if (c.server === '') {
            var where = el('div', 'dp-rename-row')
            where.appendChild(cloudInput('server', T('云端地址 https://…'), 'url'))
            form.appendChild(where)
          }
          var mail = el('div', 'dp-rename-row')
          mail.appendChild(cloudInput('email', T('邮箱'), 'email'))
          var send = button('dp-mini', { 'data-cloud-act': 'code' }, cloudSubmit)
          send.textContent = T('发送验证码')
          send.disabled = cloudBusy
          mail.appendChild(send)
          form.appendChild(mail)
          var cancel = button('dp-cancel', { 'data-cloud-act': 'cancel' }, function () {
            cloudOpen = false
            cloudFocus = null
            renderContent()
            renderSide()
          })
          cancel.textContent = T('算了')
          form.appendChild(cancel)
        }
        box.appendChild(form)
        return box
      }

      /** The pig's bag for one care action: pick what to spend. */
      function pickerPanel(action) {
        var wrap = el('div', 'dp-pick')
        var asks = { feed: '喂点什么？', bathe: '用哪个洗澡？', play: '拿哪个玩具？' }
        wrap.appendChild(el('div', 'dp-pick-head', T(asks[action] ?? '用哪个？')))
        var list = el('div', 'dp-list')
        var shelf = view.care[action] ?? []
        for (var i = 0; i < shelf.length; i += 1) {
          (function (item) {
            var row = el('div', 'dp-item')
            row.appendChild(el('span', null, item.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, item.default
              ? T('{label}（自带）', { label: item.label })
              : item.label + ' ×' + num(item.count, 0)))
            grow.appendChild(el('div', 'dp-dim', careEffectLine(action, item)))
            row.appendChild(grow)
            var use = button('dp-mini', { 'data-care': action + ':' + item.key }, function () {
              picker = null
              send(action, { item: item.key })
            })
            use.textContent = T('用')
            row.appendChild(use)
            list.appendChild(row)
          })(shelf[i])
        }
        wrap.appendChild(list)
        var cancel = button('dp-cancel', {}, function () { picker = null; repaintCare() })
        cancel.textContent = T('算了')
        wrap.appendChild(cancel)
        return wrap
      }

      /** "+35 清洁" and friends, so the picker says what each item does. */
      function careEffectLine(action, item) {
        var parts = []
        if (action === 'feed') {
          parts.push(T('饱食') + ' +' + item.satiety)
          if (item.happiness) parts.push(T('心情') + ' +' + item.happiness)
        } else if (action === 'bathe') {
          parts.push(T('清洁') + ' +' + item.cleanliness)
          if (item.happiness) parts.push(T('心情') + ' +' + item.happiness)
        } else {
          parts.push(T('心情') + ' +' + item.happiness)
          if (item.satiety) parts.push(T('饱食') + ' ' + item.satiety)
        }
        return parts.join(' · ')
      }

      /** The school ladder as the host sent it, or the client's own when it sent none. */
      function stageList() {
        if (view.stages.length > 0) return view.stages
        return STAGES.map(entry => ({
          key: entry.key, label: T(entry.label), minutes: 0, tuition: null, gain: 0,
          unlocked: true, progress: null, parallel: 1, cap: null, taken: {}, fallback: true,
        }))
      }

      function stageDetail(key) {
        for (var d = 0; d < view.stages.length; d += 1) if (view.stages[d].key === key) return view.stages[d]
        return null
      }

      function studyTab() {
        if (view.subjects.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('宿主还没提供课程表。')))
          return
        }
        if (view.pig !== null && view.pig.doctor) content.appendChild(el('div', 'dp-badge', '🎓 ' + T('博士毕业')))
        var ladder = stageList()
        // Four stages do not fit one row of pills in Japanese, so 2 × 2.
        var seg = el('div', 'dp-seg' + (ladder.length > 3 ? ' dp-seg-2' : ''))
        for (var s = 0; s < ladder.length; s += 1) {
          (function (entry) {
            var locked = entry.unlocked === false
            var label = entry.label + (entry.tuition !== null ? ' · ' + entry.tuition + '🪙' : '') + (locked ? ' 🔒' : '')
            // A locked stage stays clickable on purpose: selecting it is how the
            // pig tells you what it is still missing. Only the courses inside it
            // are inert.
            var btn = button(null, { 'data-stage': entry.key }, function () {
              stage = entry.key
              renderContent()
            })
            btn.textContent = label
            btn.setAttribute('data-active', entry.key === stage ? 'true' : 'false')
            btn.setAttribute('data-locked', locked ? 'true' : 'false')
            seg.appendChild(btn)
          })(ladder[s])
        }
        content.appendChild(seg)

        var detail = stageDetail(stage)
        var locked = detail !== null && detail.unlocked === false
        var most = detail === null ? 1 : detail.parallel
        if (detail !== null) {
          var note = el('div', 'dp-empty', T('{time} · 学费 {tuition} 🪙 · 属性 +{gain}',
            { time: formatMinutes(detail.minutes), tuition: detail.tuition, gain: detail.gain }) +
            (detail.cap !== null ? ' · ' + T('每门限 {cap} 次', { cap: detail.cap }) : ''))
          note.style.marginBottom = '7px'
          note.style.marginTop = '0'
          content.appendChild(note)
          // A gated stage says exactly what it is waiting for.
          if (locked && detail.progress !== null) {
            content.appendChild(el('div', 'dp-locked', '🔒 ' + T('要先念完{label}（{done}/{need}）',
              { label: detail.progress.label, done: detail.progress.done, need: detail.progress.need })))
          }
        }

        // Ticks belong to one stage; switching stage starts over.
        if (studyPicks.stage !== stage) studyPicks = { stage: stage, keys: [] }
        var known = view.subjects.map(sub => sub.key)
        // [mod] a subject that has used up this stage's lessons cannot be picked.
        var usedUp = key => detail !== null && detail.cap !== null && num(detail.taken[key], 0) >= detail.cap
        studyPicks.keys = studyPicks.keys.filter(key => known.indexOf(key) >= 0 && !usedUp(key)).slice(0, most)
        var multi = most > 1

        if (multi) {
          var hint = el('div', 'dp-note', T('可以一起上 {n} 门 · 已选 {k}', { n: most, k: studyPicks.keys.length }))
          hint.style.marginBottom = '6px'
          content.appendChild(hint)
        }

        // [dsh-piggy-claude-code mod] one block per trait, so it is plain which
        // lessons build which trait (and so which jobs they pay for).
        var grid = null
        var studyGroup = null
        var bySubject = traitGroups(view.subjects)
        for (var i = 0; i < bySubject.length; i += 1) {
          if (bySubject[i].group !== studyGroup) {
            studyGroup = bySubject[i].group
            content.appendChild(groupTitle(studyGroup))
            grid = el('div', 'dp-grid')
            content.appendChild(grid)
          }
          (function (sub) {
            var picked = studyPicks.keys.indexOf(sub.key) >= 0
            var btn = button('dp-item', { 'data-subject': sub.key }, function () {
              // One subject per sitting: a tap sends it off, as it always has.
              if (!multi) {
                send('study', { subject: sub.key, stage: stage })
                return
              }
              var at = studyPicks.keys.indexOf(sub.key)
              if (at >= 0) {
                studyPicks.keys.splice(at, 1)
              } else if (studyPicks.keys.length >= most) {
                // Over the limit: ignored, and the pig says why.
                showBubble(T('这一段一次最多上 {n} 门课', { n: most }), 2200)
                return
              } else {
                studyPicks.keys.push(sub.key)
              }
              renderContent()
            })
            if (multi) btn.setAttribute('aria-pressed', picked ? 'true' : 'false')
            var full = usedUp(sub.key)
            if (locked || full) btn.disabled = true
            btn.setAttribute('data-full', full ? 'true' : 'false')
            btn.style.cursor = 'pointer'
            btn.style.textAlign = 'left'
            btn.appendChild(el('span', null, sub.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, sub.label))
            grow.appendChild(el('div', 'dp-dim', sub.traitLabel + ' · ' + (detail !== null && detail.cap !== null
              ? T('本段 {n}/{cap}', { n: num(detail.taken[sub.key], 0), cap: detail.cap }) + (full ? ' ' + T('已满') : '')
              : T('已上 {n} 次', { n: sub.level }))))
            btn.appendChild(grow)
            if (multi) btn.appendChild(el('span', 'dp-check', picked ? '✅' : '⬜'))
            grid.appendChild(btn)
          })(bySubject[i].entry)
        }

        if (multi) {
          var count = studyPicks.keys.length
          var wrap = el('div', 'dp-actions dp-study-go')
          var go = button('dp-btn dp-btn-wide', { 'data-study': 'go' }, function () {
            if (studyPicks.keys.length === 0) return
            send('study', { subjects: studyPicks.keys.slice(0, most), stage: stage })
          })
          go.appendChild(el('span', null, '📚'))
          go.appendChild(el('span', null, count === 0
            ? T('先选课')
            : T('上课 × {n}（学费 {total} 🪙）', { n: count, total: detail.tuition * count })))
          go.disabled = count === 0 || locked
          wrap.appendChild(go)
          content.appendChild(wrap)
        }
      }

      /**
       * [dsh-piggy-claude-code mod] Entries sorted into trait blocks, in the
       * fixed 智力 · 魅力 · 武力 order; anything without a known trait goes last.
       */
      function traitGroups(entries) {
        var out = []
        var keys = TRAIT_KEYS.concat([''])
        for (var g = 0; g < keys.length; g += 1) {
          for (var e = 0; e < entries.length; e += 1) {
            var trait = TRAIT_KEYS.indexOf(entries[e].trait) >= 0 ? entries[e].trait : ''
            if (trait === keys[g]) out.push({ group: trait, entry: entries[e] })
          }
        }
        return out
      }

      function groupTitle(trait) {
        var title = TRAIT_TITLE[trait]
        var head = el('div', 'dp-shelf', title === undefined ? T('其他') : title[0] + ' ' + T(title[1]))
        head.style.margin = '9px 0 5px'
        return head
      }

      /** [Q0016] The gym door at the top of the work page; the casino door's look. */
      function gymEntry() {
        var door = button('dp-casino-door', { 'data-gym': 'open' }, function () {
          workPage = 'gym'
          renderContent()
        })
        door.appendChild(el('span', 'dp-casino-icon', '🏋️'))
        var grow = el('div', 'dp-grow')
        grow.appendChild(el('b', null, T('健身房')))
        grow.appendChild(el('div', 'dp-note', view.gym.classes.map(entry => entry.emoji + ' ' + entry.label).join(' · ')))
        door.appendChild(grow)
        door.appendChild(el('span', 'dp-casino-go', '›'))
        return door
      }

      /**
       * [Q0016] The gym page: today's weight and the floor, how far the pig is
       * from the muscle look, and one row per class.
       */
      function gymPage() {
        var gym = view.gym
        var head = el('div', 'dp-title')
        var back = button('dp-casino-back', { 'data-gym': 'back' }, function () {
          workPage = 'work'
          renderContent()
        })
        back.textContent = '‹ ' + T('返回打工')
        head.appendChild(back)
        head.appendChild(el('span', null, '🪙 ' + view.pig.coins))
        content.appendChild(head)
        content.appendChild(el('div', 'dp-casino-title', '🏋️ ' + T('健身房')))
        content.appendChild(el('div', 'dp-note', '⚖️ ' + T('体重 {weight} · 最低 {kg} kg', { weight: view.pig.weight, kg: gym.floorKg })))
        content.appendChild(el('div', 'dp-note', gym.muscle
          ? '💪 ' + T('已经练成肌肉猪')
          : '💪 ' + T('一共瘦掉 {lost}/{need} kg 练成肌肉猪', { lost: gym.lostKg, need: gym.muscleKg })))
        if (gym.atFloor) content.appendChild(el('div', 'dp-dim', T('已经瘦到 {kg} kg，不能再减了', { kg: gym.floorKg })))
        var list = el('div', 'dp-list')
        list.style.marginTop = '8px'
        for (var i = 0; i < gym.classes.length; i += 1) {
          (function (entry) {
            var row = el('div', 'dp-item')
            row.appendChild(el('span', null, entry.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, entry.label))
            grow.appendChild(el('div', 'dp-dim', formatDuration(entry.minutes) + ' · ' + entry.price + ' 🪙 · '
              + T('瘦 {kg} kg', { kg: entry.lossKg })))
            row.appendChild(grow)
            var go = button('dp-mini', { 'data-gym-class': entry.key }, function () { send('gym', { gym: entry.key }) })
            go.textContent = T('出发')
            go.disabled = !view.canGoOut || gym.atFloor
            row.appendChild(go)
            list.appendChild(row)
          })(gym.classes[i])
        }
        content.appendChild(list)
      }

      function workTab() {
        if (workPage === 'gym' && view.gym !== null && view.pig !== null) {
          gymPage()
          return
        }
        workPage = 'work'
        if (view.gym !== null && view.pig !== null) content.appendChild(gymEntry())
        if (view.jobs.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('宿主还没提供工作列表。')))
          return
        }
        var list = null
        var workGroup = null
        var byJob = traitGroups(view.jobs)
        for (var i = 0; i < byJob.length; i += 1) {
          if (byJob[i].group !== workGroup) {
            workGroup = byJob[i].group
            content.appendChild(groupTitle(workGroup))
            list = el('div', 'dp-list')
            content.appendChild(list)
          }
          (function (job) {
            var row = el('div', 'dp-item')
            row.setAttribute('data-tier', job.tier)
            row.setAttribute('data-locked', job.locked ? 'true' : 'false')
            row.appendChild(el('span', null, job.emoji))
            var grow = el('div', 'dp-grow')
            var name = el('div', null, job.label)
            if (job.tier === 'pro') name.appendChild(el('span', 'dp-tag', '⭐ ' + T('高阶')))
            grow.appendChild(name)
            var line = formatDuration(job.minutes) + ' · ' + (job.random !== null
              ? T('收入随机 {min}–{max} 🪙', { min: job.random[0], max: job.random[1] })
              : T('赚 {coins} 🪙', { coins: job.coins }))
            if (job.traitPoints > 0 && job.speedPercent > 0) {
              line += ' · ' + T('省 {pct}% 时间', { pct: job.speedPercent })
            }
            grow.appendChild(el('div', 'dp-dim', line))
            if (job.locked && job.requires.length > 0) {
              // A career says exactly which trait points it is still waiting for.
              grow.appendChild(el('div', 'dp-dim', '🔒 ' + T('需要 {list}', {
                list: job.requires.map(need => need.emoji + need.label + ' ' + need.have + '/' + need.need).join(' · '),
              })))
            } else {
              // Spell out which lessons are paying for this, or the linkage between
              // 学习 and 打工 is invisible.
              var byTrait = job.traitEmoji + job.traitLabel + ' ' + job.traitPoints
                + ' · ' + (job.payPercent > 0 ? T('报酬 +{pct}%', { pct: job.payPercent }) : T('去上课就能涨'))
              grow.appendChild(el('div', 'dp-dim', byTrait))
            }
            row.appendChild(grow)
            var go = button('dp-mini', { 'data-job': job.key }, function () { send('work', { job: job.key }) })
            go.textContent = job.locked ? '🔒' : T('出发')
            go.disabled = !view.canGoOut || job.locked
            row.appendChild(go)
            list.appendChild(row)
          })(byJob[i].entry)
        }
      }

      /**
       * [dsh-piggy-claude-code mod] What an item does, in one line: the bars it
       * moves, or what it cures, or what it is for.
       */
      function effectLine(item) {
        var fx = item.effects ?? { satiety: 0, happiness: 0, cleanliness: 0, cures: [] }
        if (item.kind === 'medicine') return fx.cures.length > 0 ? T('治：{list}', { list: fx.cures.join(' / ') }) : T('药')
        if (item.kind === 'revive') return T('死后用来复活')
        if (item.kind === 'card') return T('用来改名')
        if (item.kind === 'wear') return T('衣柜装扮，买一次一直有')
        var signed = n => (n > 0 ? '+' : '') + n
        var parts = []
        if (fx.satiety) parts.push(T('饱食 {n}', { n: signed(fx.satiety) }))
        if (fx.happiness) parts.push(T('心情 {n}', { n: signed(fx.happiness) }))
        if (fx.cleanliness) parts.push(T('清洁 {n}', { n: signed(fx.cleanliness) }))
        return parts.length > 0 ? parts.join(' · ') : T('没有效果')
      }

      /** [dsh-piggy-claude-code mod] The scratch-card counter at the top of the shop. */
      function lotteryBlock() {
        var lot = view.lottery
        var box = el('div', 'dp-lottery')
        var head = el('div', 'dp-row')
        head.appendChild(el('b', null, '🎟️ ' + T('刮彩票')))
        head.appendChild(el('span', 'dp-note', T('{price} 🪙 一张 · 每 {n} 分钟一次', { price: lot.price, n: lot.cooldownMinutes })))
        box.appendChild(head)
        var chips = el('div', 'dp-chips')
        for (var i = 0; i < lot.prizes.length; i += 1) {
          var prize = lot.prizes[i]
          chips.appendChild(el('span', 'dp-chip', prize.emoji + prize.label + (prize.coins > 0 ? ' ' + prize.coins : '')))
        }
        box.appendChild(chips)
        var row = el('div', 'dp-actions')
        row.style.marginTop = '7px'
        var go = button('dp-btn dp-btn-wide', { 'data-lottery': 'go' }, function () { send('lottery') })
        go.appendChild(el('span', null, '🎟️'))
        go.appendChild(el('span', null, lot.waitSeconds > 0
          ? T('{time} 后再来', { time: formatWait(lot.waitSeconds) })
          : T('刮一张')))
        go.disabled = lot.waitSeconds > 0 || !lot.affordable || view.activity !== null || view.dead
        row.appendChild(go)
        box.appendChild(row)
        return box
      }

      /** [ST0015] One hand's cards face up, with its total (or how it ended). */
      function blackjackCards(hand, caption) {
        var row = el('div', 'dp-cards')
        if (caption) row.appendChild(el('span', 'dp-note', caption))
        for (var i = 0; i < hand.cards.length; i += 1) {
          var card = el('span', 'dp-card', hand.cards[i].rank + hand.cards[i].suit)
          card.setAttribute('data-red', hand.cards[i].suit === '♥' || hand.cards[i].suit === '♦' ? 'true' : 'false')
          row.appendChild(card)
        }
        var total = el('span', 'dp-bj-total', hand.soft && hand.outcome === ''
          ? T('{total} 点（A 算 11）', { total: hand.total })
          : T('{total} 点', { total: hand.total }))
        if (hand.outcome !== '') {
          total.setAttribute('data-outcome', hand.outcome)
          total.textContent += ' · ' + (hand.outcome === 'bust' ? T('爆了') : '+' + hand.coins + ' 🪙')
        }
        row.appendChild(total)
        return row
      }

      /** [ST0015] The blackjack table under the scratch cards: bet, hit, stand. */
      function blackjackBlock() {
        var bj = view.blackjack
        var box = el('div', 'dp-bj')
        var head = el('div', 'dp-row')
        head.appendChild(el('b', null, '🃏 ' + T('21 点')))
        head.appendChild(el('span', 'dp-note', T('下注 {min} 起 · {n} 点以上才能停', {
          min: bj.bets.length > 0 ? Math.min.apply(null, bj.bets) : 0, n: bj.standAt,
        })))
        box.appendChild(head)
        var chips = el('div', 'dp-chips')
        for (var i = 0; i < bj.payouts.length; i += 1) {
          chips.appendChild(el('span', 'dp-chip', T('{total} 点', { total: bj.payouts[i].total }) + ' ×' + bj.payouts[i].multiplier))
        }
        box.appendChild(chips)
        var hand = bj.hand
        if (hand !== null) {
          box.appendChild(blackjackCards(hand, T('下注 {bet} 🪙', { bet: hand.bet })))
          var moves = el('div', 'dp-actions')
          moves.setAttribute('data-bj', 'hand')
          var hit = button('dp-btn', { 'data-blackjack': 'hit' }, function () { send('blackjack', { move: 'hit' }) })
          hit.appendChild(el('span', null, '🃏'))
          hit.appendChild(el('span', null, T('要牌')))
          moves.appendChild(hit)
          var canStand = hand.total >= bj.standAt
          var stand = button('dp-btn', { 'data-blackjack': 'stand' }, function () { send('blackjack', { move: 'stand' }) })
          stand.appendChild(el('span', null, '✋'))
          stand.appendChild(el('span', null, canStand ? T('停牌') : T('{n} 点起才能停', { n: bj.standAt })))
          stand.disabled = !canStand
          moves.appendChild(stand)
          box.appendChild(moves)
          return box
        }
        if (blackjackLast !== null) box.appendChild(blackjackCards(blackjackLast, T('上一手')))
        var row = el('div', 'dp-actions')
        for (var b = 0; b < bj.bets.length; b += 1) {
          (function (bet) {
            var go = button('dp-btn', { 'data-blackjack': 'deal', 'data-bet': String(bet) }, function () {
              send('blackjack', { move: 'deal', bet: bet })
            })
            go.appendChild(el('span', null, T('下注 {bet}', { bet: bet })))
            go.disabled = view.pig === null || view.pig.coins < bet || view.activity !== null || view.dead
            row.appendChild(go)
          })(bj.bets[b])
        }
        box.appendChild(row)
        return box
      }

      /** "9:05" for a wait in seconds. */
      function formatWait(seconds) {
        var m = Math.floor(seconds / 60)
        var r = seconds % 60
        return m + ':' + (r < 10 ? '0' : '') + r
      }

      /** [ST0015] The games the host offers, by name, for the casino entry. */
      function casinoGames() {
        var games = []
        if (view.lottery !== null) games.push(T('刮彩票'))
        if (view.blackjack !== null) games.push(T('21 点'))
        return games
      }

      /** [ST0015] The casino door at the top of the shop. */
      function casinoEntry(games) {
        var door = button('dp-casino-door', { 'data-casino': 'open' }, function () {
          shopPage = 'casino'
          renderContent()
        })
        door.appendChild(el('span', 'dp-casino-icon', '🎰'))
        var grow = el('div', 'dp-grow')
        grow.appendChild(el('b', null, T('赌场')))
        grow.appendChild(el('div', 'dp-note', games.join(' · ')))
        door.appendChild(grow)
        door.appendChild(el('span', 'dp-casino-go', '›'))
        return door
      }

      /** [ST0015] The casino page: scratch cards and blackjack, and the way back. */
      function casinoPage() {
        var head = el('div', 'dp-title')
        var back = button('dp-casino-back', { 'data-casino': 'back' }, function () {
          shopPage = 'shop'
          renderContent()
        })
        back.textContent = '‹ ' + T('返回商店')
        head.appendChild(back)
        head.appendChild(el('span', null, '🪙 ' + view.pig.coins))
        content.appendChild(head)
        content.appendChild(el('div', 'dp-casino-title', '🎰 ' + T('赌场')))
        if (view.lottery !== null) content.appendChild(lotteryBlock())
        if (view.blackjack !== null) content.appendChild(blackjackBlock())
      }

      function shopTab() {
        if (shopPage === 'casino' && casinoGames().length > 0) {
          casinoPage()
          return
        }
        shopPage = 'shop'
        if (view.shop.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('宿主还没提供货架。')))
          return
        }
        var head = el('div', 'dp-title')
        head.appendChild(el('b', null, '🛒 ' + T('商店')))
        head.appendChild(el('span', null, '🪙 ' + view.pig.coins))
        content.appendChild(head)
        var games = casinoGames()
        if (games.length > 0) content.appendChild(casinoEntry(games))
        var list = el('div', 'dp-list')
        var shelf = ''
        // The host sends the shop in shelf order, but sort defensively so a
        // reordered table cannot produce duplicate headers.
        var ordered = view.shop.slice().sort(
          (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
        )
        for (var i = 0; i < ordered.length; i += 1) {
          (function (item) {
            // Shelves, so 21 items read as five short lists instead of one long one.
            if (item.kind !== shelf) {
              shelf = item.kind
              var title = KIND_TITLE[shelf]
              list.appendChild(el('div', 'dp-shelf', title === undefined ? shelf : title[0] + ' ' + T(title[1])))
            }
            var row = el('div', 'dp-item' + (item.needed ? ' dp-wanted' : ''))
            row.appendChild(el('span', null, item.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, item.label))
            var limitNote = item.dailyLimit === null ? '' : ' · ' + (item.leftToday === 0 ? T('今天已买完') : T('每天限 {n} 个', { n: item.dailyLimit }))
            grow.appendChild(el('div', 'dp-dim', item.price + ' 🪙' + (item.needed ? ' · ' + T('现在需要') : '') + limitNote))
            // [dsh-piggy-claude-code mod] what it does, or the shelves all look alike.
            grow.appendChild(el('div', 'dp-dim', effectLine(item)))
            row.appendChild(grow)
            var buy = button('dp-mini', { 'data-buy': item.key }, function () { send('buy', { item: item.key }) })
            var soldOut = item.leftToday === 0
            buy.textContent = item.owned ? T('已拥有') : soldOut ? T('明天再来') : T('买')
            buy.disabled = item.owned || soldOut || !item.affordable
            row.appendChild(buy)
            list.appendChild(row)
          })(ordered[i])
        }
        content.appendChild(list)
      }

      /**
       * [dsh-piggy-claude-code mod] The travel world: where home is, what the
       * last trip brought back, then the seven regions as an accordion — one
       * open at a time — each with its three destinations and its souvenirs.
       */
      function travelTab() {
        var w = view.world
        if (w === null) {
          legacyTravelTab()
          return
        }
        var head = el('div', 'dp-title')
        head.appendChild(el('b', null, '🏠 ' + homeLabel(w.home)))
        head.appendChild(el('span', null, '🪙 ' + view.pig.coins))
        content.appendChild(head)
        var rule = el('div', 'dp-note', T('每跨一个时区 +{cost} 🪙 · +{hours} 小时', { cost: w.fare.costPerZone, hours: w.fare.hoursPerZone }))
        rule.style.margin = '-4px 0 8px'
        content.appendChild(rule)

        var last = w.lastTrip
        if (last !== null && last.at > 0 && Date.now() - last.at < LAST_TRIP_MS) content.appendChild(lastTripBanner(last))

        // Nothing chosen yet: unfold the first region still missing souvenirs.
        var current = openRegion
        if (current === null) {
          current = ''
          for (var f = 0; f < w.regions.length; f += 1) {
            if (!w.regions[f].done) { current = w.regions[f].key; break }
          }
        }
        for (var i = 0; i < w.regions.length; i += 1) content.appendChild(regionBlock(w.regions[i], w.regions[i].key === current))

        var done = w.regions.filter(r => r.done).length
        var world = el('div', 'dp-world')
        world.setAttribute('data-done', w.worldDone ? 'true' : 'false')
        world.appendChild(el('span', null, w.worldTitle.emoji))
        var grow = el('div', 'dp-grow')
        grow.appendChild(el('div', null, w.worldTitle.label + (w.worldDone ? ' ✅' : '')))
        if (w.worldDone) grow.appendChild(el('div', 'dp-note', T('已获得称号')))
        else if (w.worldTitle.reward.length > 0) grow.appendChild(el('div', 'dp-note', T('集齐奖励：{list}', { list: w.worldTitle.reward.join(' · ') })))
        world.appendChild(grow)
        world.appendChild(el('b', null, done + '/' + w.regions.length))
        content.appendChild(world)

        if (w.oldSouvenirs.length > 0) {
          var old = el('div', 'dp-note', '🗃 ' + T('以前的纪念品：{list}', { list: w.oldSouvenirs.join(' · ') }))
          old.style.marginTop = '8px'
          content.appendChild(old)
        }
      }

      /** "Tokyo · UTC+9", "UTC+5:30" — wherever the player's computer is. */
      function homeLabel(home) {
        var parts = []
        if (home.city !== '') parts.push(home.city)
        if (home.utc !== null) parts.push(utcLabel(home.utc))
        return parts.length > 0 ? parts.join(' · ') : T('家')
      }

      function utcLabel(hours) {
        var abs = Math.abs(hours)
        var whole = Math.floor(abs)
        var mins = Math.round((abs - whole) * 60)
        return 'UTC' + (hours < 0 ? '-' : '+') + whole + (mins > 0 ? ':' + (mins < 10 ? '0' : '') + mins : '')
      }

      function lastTripBanner(last) {
        var box = el('div', 'dp-alert dp-trip')
        box.setAttribute('data-last-trip', 'true')
        box.appendChild(el('b', null, last.emoji + ' ' + T('刚从{place}回来', { place: last.place })))
        if (last.souvenir !== null) {
          var got = el('div', 'dp-line', '🎁 ' + last.souvenir.emoji + last.souvenir.label)
          if (last.souvenir.fresh) got.appendChild(el('span', 'dp-tag', T('新！')))
          box.appendChild(got)
        }
        if (last.loot.length > 0) {
          var loot = el('div', 'dp-line', T('还带回了：'))
          for (var i = 0; i < last.loot.length; i += 1) {
            var item = last.loot[i]
            loot.appendChild(el('span', null, (i > 0 ? ' · ' : '') + item.emoji + item.label))
            if (item.exclusive) loot.appendChild(el('span', 'dp-tag', T('✈️ 限定')))
          }
          box.appendChild(loot)
        }
        if (last.regionDone !== null) box.appendChild(el('div', 'dp-line', '🎉 ' + T('集齐了「{region}」！', { region: last.regionDone })))
        return box
      }

      function regionBlock(region, open) {
        var wrap = el('div', 'dp-region')
        wrap.setAttribute('data-done', region.done ? 'true' : 'false')
        var head = button('dp-region-head', { 'data-region': region.key, 'aria-expanded': String(open) }, function () {
          openRegion = open ? '' : region.key
          writeStore(REGION_KEY, openRegion)
          renderContent()
        })
        head.appendChild(el('span', 'dp-caret', open ? '▼' : '▶'))
        head.appendChild(el('span', null, region.emoji))
        head.appendChild(el('span', 'dp-grow', region.label))
        head.appendChild(el('span', 'dp-have', region.have + '/' + region.total + (region.done ? ' ✅' : '')))
        wrap.appendChild(head)
        if (!open) return wrap

        var body = el('div', 'dp-region-body')
        if (region.reward.length > 0) body.appendChild(el('div', 'dp-note', '🎁 ' + T('集齐奖励：{list}', { list: region.reward.join(' · ') })))
        if (region.perk !== null) {
          var perk = el('div', 'dp-perk', region.perk.emoji + ' ' + region.perk.label
            + (region.perk.text !== '' ? ' · ' + region.perk.text : '') + ' · '
            + (region.perk.active ? T('已生效') : T('🔒 集齐后解锁')))
          perk.setAttribute('data-active', region.perk.active ? 'true' : 'false')
          body.appendChild(perk)
        }
        var chips = el('div', 'dp-chips')
        for (var i = 0; i < region.places.length; i += 1) {
          (function (place) {
            var row = el('div', 'dp-item')
            row.appendChild(el('span', null, place.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, place.label))
            grow.appendChild(el('div', 'dp-dim', place.cost + ' 🪙 · ' + formatDuration(place.minutes)))
            row.appendChild(grow)
            var go = button('dp-mini', { 'data-trip': place.key }, function () { send('trip', { trip: place.key }) })
            go.textContent = T('出发')
            go.disabled = !view.canGoOut || !place.available || !place.affordable
            row.appendChild(go)
            body.appendChild(row)
            for (var k = 0; k < place.souvenirs.length; k += 1) {
              var souvenir = place.souvenirs[k]
              var have = souvenir.count > 0
              var chip = el('span', 'dp-chip', have
                ? souvenir.emoji + souvenir.label + (souvenir.count > 1 ? ' ×' + souvenir.count : '')
                : '？')
              chip.setAttribute('data-souvenir', souvenir.key)
              chip.setAttribute('data-have', have ? 'true' : 'false')
              if (!have) chip.title = T('去{place}能带回来', { place: place.label })
              chips.appendChild(chip)
            }
          })(region.places[i])
        }
        body.appendChild(chips)
        wrap.appendChild(body)
        return wrap
      }

      /** An older host: the flat list of trips and the plain souvenir names. */
      function legacyTravelTab() {
        if (view.trips.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('宿主还没提供目的地。')))
          return
        }
        var list = el('div', 'dp-list')
        for (var i = 0; i < view.trips.length; i += 1) {
          (function (trip) {
            var row = el('div', 'dp-item')
            row.appendChild(el('span', null, trip.emoji))
            var grow = el('div', 'dp-grow')
            grow.appendChild(el('div', null, trip.label))
            grow.appendChild(el('div', 'dp-dim', formatMinutes(trip.minutes) + ' · ' + trip.cost + ' 🪙'))
            row.appendChild(grow)
            var go = button('dp-mini', { 'data-trip': trip.key }, function () { send('trip', { trip: trip.key }) })
            go.textContent = T('出发')
            go.disabled = !view.canGoOut || !trip.affordable
            row.appendChild(go)
            list.appendChild(row)
          })(view.trips[i])
        }
        content.appendChild(list)

        var souvenirs = view.pig.souvenirs
        var head = el('div', 'dp-title')
        head.style.marginTop = '10px'
        head.appendChild(el('b', null, '🎁 ' + T('纪念品') + ' ' + souvenirs.length))
        content.appendChild(head)
        content.appendChild(el('div', 'dp-empty', souvenirs.length === 0 ? T('还没出过远门。') : souvenirs.join(' · ')))
      }

      /**
       * [dsh-piggy-claude-code mod] The bag, as shelves: what can be used up,
       * [ST0004] the wardrobe right beside it, and the two collections —
       * souvenirs from travel, diplomas from school — each where it came from.
       */
      function bagTab() {
        var owned = ownedItems()
        var diplomas = view.pig !== null && Array.isArray(view.pig.diplomas) ? view.pig.diplomas : []
        var trips = souvenirTally()
        // An older host has no wardrobe, and a grave wears nothing: no shelf then.
        var clothes = view.pig !== null && !view.dead ? view.pig.wardrobe : []
        var shelves = [
          { key: 'items', label: '🎒 ' + T('消耗品') + ' ' + owned.reduce((sum, item) => sum + item.count, 0) },
          { key: 'wardrobe', label: '👗 ' + T('衣柜') + ' ' + clothes.filter(item => item.unlocked).length + '/' + clothes.length, hidden: clothes.length === 0 },
          { key: 'travel', label: '🧳 ' + T('纪念品') + ' ' + (trips.total > 0 ? trips.have + '/' + trips.total : trips.have) },
          { key: 'school', label: '📜 ' + T('毕业证') + ' ' + diplomas.filter(d => d.count > 0).length + '/' + diplomas.length },
        ].filter(entry => entry.hidden !== true)
        var current = shelves.some(entry => entry.key === bagView) ? bagView : 'items'
        // Four shelves sit two by two; three still fit on one row.
        var seg = el('div', 'dp-seg' + (shelves.length > 3 ? ' dp-seg-2' : ''))
        for (var s = 0; s < shelves.length; s += 1) {
          (function (entry) {
            var btn = button(null, { 'data-bag': entry.key }, function () {
              bagView = entry.key
              writeStore(BAG_KEY, bagView)
              renderContent()
            })
            btn.textContent = entry.label
            btn.setAttribute('data-active', entry.key === current ? 'true' : 'false')
            seg.appendChild(btn)
          })(shelves[s])
        }
        content.appendChild(seg)
        if (current === 'travel') souvenirShelf()
        else if (current === 'wardrobe') wardrobeShelf()
        else if (current === 'school') diplomaShelf(diplomas)
        else itemShelf(owned)
      }

      /**
       * `bag` is everything the pig holds, travel specialties and rename cards
       * included; an older host only sent the shop's counts, so read those instead.
       */
      function ownedItems() {
        if (view.bag !== null) return view.bag
        var owned = []
        for (var i = 0; i < view.shop.length; i += 1) {
          var count = num(view.inventory[view.shop[i].key], 0)
          if (count > 0) owned.push({ key: view.shop[i].key, label: view.shop[i].label, emoji: view.shop[i].emoji, kind: view.shop[i].kind, count: count, exclusive: false, effects: view.shop[i].effects })
        }
        return owned
      }

      /** Souvenirs held / to be had; an older host only has the plain names. */
      function souvenirTally() {
        var w = view.world
        if (w === null) return { have: view.pig === null ? 0 : view.pig.souvenirs.length, total: 0 }
        var have = 0
        var total = 0
        for (var r = 0; r < w.regions.length; r += 1) { have += w.regions[r].have; total += w.regions[r].total }
        return { have: have, total: total }
      }

      function itemShelf(owned) {
        if (owned.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('背包空空的 —— 去「商店」买点东西。')))
          return
        }
        var list = el('div', 'dp-list')
        // [dsh-piggy-claude-code mod] the same shelves as the shop.
        owned = owned.slice().sort((a, b) => kindRank(a.kind) - kindRank(b.kind))
        var bagShelf = ''
        for (var j = 0; j < owned.length; j += 1) {
          if (owned[j].kind !== bagShelf) {
            bagShelf = owned[j].kind
            var bagTitle = KIND_TITLE[bagShelf]
            list.appendChild(el('div', 'dp-shelf', bagTitle === undefined ? T('其他') : bagTitle[0] + ' ' + T(bagTitle[1])))
          }
          (function (item) {
            var needed = view.shop.some(entry => entry.key === item.key && entry.needed)
            var row = el('div', 'dp-item' + (needed ? ' dp-wanted' : ''))
            row.appendChild(el('span', null, item.emoji))
            var grow = el('div', 'dp-grow')
            var name = el('div', null, item.label + ' ×' + item.count)
            if (item.exclusive) name.appendChild(el('span', 'dp-tag', T('✈️ 限定')))
            grow.appendChild(name)
            grow.appendChild(el('div', 'dp-dim', needed ? T('对症！') + ' · ' + effectLine(item) : effectLine(item)))
            row.appendChild(grow)
            // A rename card is spent by renaming, so it gets no Use button.
            if (item.kind !== 'card') {
              var use = button('dp-mini', { 'data-use': item.key }, function () { send('use', { item: item.key }) })
              use.textContent = T('使用')
              row.appendChild(use)
            }
            list.appendChild(row)
          })(owned[j])
        }
        content.appendChild(list)
      }

      /** Travel souvenirs, region by region; the trips themselves stay on the travel tab. */
      function souvenirShelf() {
        var w = view.world
        if (w === null) {
          var names = view.pig === null ? [] : view.pig.souvenirs
          content.appendChild(el('div', 'dp-empty', names.length === 0 ? T('收藏册还空着。') : names.join(' · ')))
          return
        }
        var list = el('div', 'dp-list')
        for (var r = 0; r < w.regions.length; r += 1) {
          var region = w.regions[r]
          list.appendChild(el('div', 'dp-shelf', region.emoji + ' ' + region.label + ' ' + region.have + '/' + region.total + (region.done ? ' ✅' : '')))
          if (region.perk !== null) {
            var perk = el('div', 'dp-perk', region.perk.emoji + ' ' + region.perk.label + ' · ' + (region.perk.active ? T('已生效') : T('🔒 集齐后解锁')))
            perk.setAttribute('data-active', region.perk.active ? 'true' : 'false')
            list.appendChild(perk)
          }
          var chips = el('div', 'dp-chips')
          for (var p = 0; p < region.places.length; p += 1) {
            var place = region.places[p]
            for (var k = 0; k < place.souvenirs.length; k += 1) {
              var souvenir = place.souvenirs[k]
              var have = souvenir.count > 0
              var chip = el('span', 'dp-chip', have
                ? souvenir.emoji + souvenir.label + (souvenir.count > 1 ? ' ×' + souvenir.count : '')
                : '？')
              chip.setAttribute('data-souvenir', souvenir.key)
              chip.setAttribute('data-have', have ? 'true' : 'false')
              if (!have) chip.title = T('去{place}能带回来', { place: place.label })
              chips.appendChild(chip)
            }
          }
          list.appendChild(chips)
        }
        content.appendChild(list)
        if (w.oldSouvenirs.length > 0) {
          var old = el('div', 'dp-note', '🗃 ' + T('以前的纪念品：{list}', { list: w.oldSouvenirs.join(' · ') }))
          old.style.marginTop = '8px'
          content.appendChild(old)
        }
        var link = button('dp-link', { 'data-goto': 'travel' }, function () { select('travel') })
        link.textContent = '🧳 ' + T('去「旅行」出发 →')
        content.appendChild(link)
      }

      /** School diplomas: collectibles, nothing to use. */
      function diplomaShelf(diplomas) {
        if (diplomas.length === 0) {
          content.appendChild(el('div', 'dp-empty', T('还没有毕业证。')))
          return
        }
        var shelf = el('div', 'dp-list')
        for (var k = 0; k < diplomas.length; k += 1) {
          var d = diplomas[k]
          var held = d.count > 0
          var row = el('div', 'dp-item')
          row.setAttribute('data-diploma', d.key)
          if (!held) row.style.opacity = '0.5'
          row.appendChild(el('span', null, held ? d.emoji : '🔒'))
          var grow = el('div', 'dp-grow')
          grow.appendChild(el('div', null, d.label + (held ? ' ×' + d.count : '')))
          var hint = d.next === null
            ? T('收藏品')
            : (held ? T('再上 {left} 节再发一张', { left: d.next.need - d.next.done }) : T('上满 {need} 节发证（{done}/{need}）', d.next))
          grow.appendChild(el('div', 'dp-dim', hint))
          row.appendChild(grow)
          shelf.appendChild(row)
        }
        content.appendChild(shelf)
        var link = button('dp-link', { 'data-goto': 'study' }, function () { select('study') })
        link.textContent = '📚 ' + T('去「学习」上课 →')
        content.appendChild(link)
      }

      /** "3 天" / "12 小时" / "40 分钟" for an upcoming stage, in the pig's language. */
      function formatDays(days) {
        if (days >= 1) return T('{n} 天', { n: Math.round(days) })
        const hours = days * 24
        return hours >= 1 ? T('{n} 小时', { n: Math.round(hours) }) : formatMinutes(Math.max(1, Math.round(hours * 60)))
      }

      /** "40 分钟" · "40分" · "40 min". */
      function formatMinutes(minutes) {
        return T('{n} 分钟', { n: num(minutes, 0) })
      }

      /** Whole hours read as hours ("3 小时"); anything else stays in minutes. */
      function formatDuration(minutes) {
        var m = num(minutes, 0)
        return m >= 60 && m % 60 === 0 ? T('{n} 小时', { n: m / 60 }) : formatMinutes(m)
      }

      function kindRank(kind) {
        var at = KIND_ORDER.indexOf(kind)
        return at < 0 ? KIND_ORDER.length : at
      }

      /**
       * Rebuild the content area. If the player is typing a name, the rebuilt
       * field gets the caret back exactly where it was (the draft itself lives
       * in `renameDraft`, so the text survives regardless).
       */
      function renderContent() {
        var typing = renameHasFocus()
        var range = typing ? [num(renameInput.selectionStart, 0), num(renameInput.selectionEnd, 0)] : null
        var page = [tab, shopPage, workPage, bagView].join('/')
        if (page === scrollPage) keepScroll(split ? [content, sheet, left] : [content], renderContentNow)
        else renderContentNow()
        scrollPage = page
        if (typing && renameInput !== null) focusRename(range)
      }

      /**
       * [ST0018] Run a rebuild without losing the player's place. Emptying a
       * box clamps its scroll to the top, and a button press (or a state push)
       * rebuilds everything — so without this every click in the shop jumped
       * back to the first shelf. The boxes that can scroll differ by layout
       * (the card's content, the big panel's left column, the whole stacked
       * page on a narrow window or in the spreadsheet skin), so all are kept.
       */
      function keepScroll(boxes, rebuild) {
        var kept = []
        for (var i = 0; i < boxes.length; i += 1) {
          if (boxes[i]) kept.push([boxes[i], boxes[i].scrollTop])
        }
        rebuild()
        for (var j = 0; j < kept.length; j += 1) {
          if (kept[j][0].scrollTop !== kept[j][1]) kept[j][0].scrollTop = kept[j][1]
        }
      }

      function renderContentNow() {
        content.textContent = ''
        renameInput = null
        for (var k = 0; k < TABS.length; k += 1) {
          if (icons[TABS[k].key] === undefined) continue // 在线 on a host without the cloud
          icons[TABS[k].key].setAttribute('data-active', TABS[k].key === tab ? 'true' : 'false')
        }
        if (host.getAttribute('data-open') !== 'true') return

        // Alerts sit above the tab body so they are visible from any tab.
        // Each one is guarded on `pig` because an unhatched pig is null — the
        // hatch affordance below is the only thing that may render then.
        if (view.legacy) {
          var legacy = el('div', 'dp-alert dp-legacy')
          legacy.appendChild(el('b', null, '⚠️ ' + T('宿主是旧版本')))
          legacy.appendChild(el('div', null, T('猪币、健康、打工、商店这些是新增的，重启 dsh（不是刷新页面）之后才会出现。')))
          content.appendChild(legacy)
        }
        var updating = updateAlert()
        if (updating !== null) content.appendChild(updating)
        if (view.pig !== null && view.dead) {
          var dead = el('div', 'dp-alert dp-dead')
          dead.appendChild(el('b', null, '🪦 ' + T(view.pig.soul ? '{name} 走了，灵魂还留在墓碑上 👻' : '{name} 走了',
            { name: view.pig.name })))
          dead.appendChild(el('div', null, T(view.pig.soul
            ? '用还魂丹可以把它叫回来，或者领养一只新的小猪'
            : '在「背包」里用还魂丹就能救回来（猪币、收藏、上过的课都保留）')))
          content.appendChild(dead)
          // Adopting is available the moment the pig dies — not only once the
          // soul turns up a day later. Waiting a day to start over was a
          // mistake: the grave is already a dead end with nothing to do.
          var adoptWrap = el('div', 'dp-actions')
          var adopt = button('dp-btn dp-btn-wide', { 'data-action': 'adopt' }, function () { send('adopt') })
          adopt.appendChild(el('span', null, '📦'))
          adopt.appendChild(el('span', null, T('领养新猪')))
          adoptWrap.appendChild(adopt)
          content.appendChild(adoptWrap)
        } else if (view.pig !== null && view.pig.illness !== null) {
          var sick = el('div', 'dp-alert dp-sick')
          sick.appendChild(el('b', null, '🤒 ' + T('{name}（第 {stage}/4 期）',
            { name: view.pig.illness.name, stage: view.pig.illness.stage })))
          sick.appendChild(el('div', null, T('需要「{cure}」—— 去商店买对应的药', { cure: view.pig.illness.cure })))
          // If it cannot afford the cure, say the way out plainly: being ill is
          // not a reason to stay home, so it can go out and earn the medicine.
          // careView only carries the consumable shelves (feed/bathe/play), so
          // the price has to come from the shop listing.
          var cures = (view.shop || []).filter(function (i) { return i.kind === 'medicine' })
          var cheapest = cures.length === 0 ? null : cures.reduce(function (a, b) { return a.price <= b.price ? a : b })
          if (view.canGoOut) {
            sick.appendChild(el('div', 'dp-dim',
              T('带病也能出门，但报酬只有一半；在外面病情会走得更快，躺着养最省')))
          }
          if (cheapest !== null && view.canGoOut && view.pig.coins < cheapest.price) {
            sick.appendChild(el('div', 'dp-dim',
              T('钱不够也没关系 —— 先去打工，赚够 {price} 🪙 买「{item}」', { price: cheapest.price, item: cheapest.label })))
          }
          content.appendChild(sick)
        } else if (view.pig !== null && view.activity !== null) {
          var away = el('div', 'dp-alert dp-work')
          away.appendChild(el('b', null, view.activity.emoji + ' ' + T('在外面：{label}', { label: view.activity.label })))
          away.appendChild(el('div', null, T('还有 {n} 秒', { n: view.activity.secondsLeft })))
          content.appendChild(away)
          var wrap = el('div', 'dp-actions')
          var call = button('dp-btn dp-btn-wide', { 'data-action': 'calloff' }, function () { send('calloff') })
          call.appendChild(el('span', null, '↩️'))
          call.appendChild(el('span', null, T('叫它回来')))
          wrap.appendChild(call)
          content.appendChild(wrap)
        }

        // [dsh-piggy-claude-code mod] asleep — alongside an illness, if it has one.
        if (view.pig !== null && !view.dead && view.pig.asleep) {
          var sleeping = el('div', 'dp-alert dp-sleep')
          sleeping.appendChild(el('b', null, '😴 ' + T('{name} 在睡觉', { name: view.pig.name })))
          sleeping.appendChild(el('div', null, T('睡着时只会变饿，心情和清洁会慢慢恢复')))
          if (view.pig.sleepAuto) sleeping.appendChild(el('div', 'dp-dim', T('跟着电脑一起睡的，电脑醒来它就起床')))
          content.appendChild(sleeping)
        }

        // [ST0014] logging in works before there is a pig (a new computer can
        // take the cloud's pig instead of opening a box).
        if (tab === 'online') {
          onlineTab()
          fitPanel()
          return
        }

        if (view.pig === null) {
          content.appendChild(el('div', 'dp-empty', T('门口放着一个纸盒，里面窸窸窣窣 📦')))
          var grid = el('div', 'dp-actions')
          var hatch = button('dp-btn dp-btn-wide', { 'data-action': 'hatch' }, function () { send('hatch') })
          hatch.appendChild(el('span', null, '🥚'))
          hatch.appendChild(el('span', null, T('拆开纸盒')))
          grid.appendChild(hatch)
          content.appendChild(grid)
          content.appendChild(el('div', 'dp-empty', T('拆开就会蹦出一只小猪 —— 不用敲命令')))
          // The language can be picked before the pig exists (the big panel
          // has its switcher in the left column).
          if (!split) content.appendChild(langSwitcher())
          fitPanel()
          return
        }

        if (tab === 'status') statusTab()
        else if (tab === 'study') studyTab()
        else if (tab === 'work') workTab()
        else if (tab === 'shop') shopTab()
        else if (tab === 'travel') travelTab()
        else if (tab === 'dev') devTab()
        else bagTab()

        // Every tab is a different height, so the fit is recomputed after each
        // render rather than only on open.
        fitPanel()
      }

      var AWAY_LINE = {
        work: '在忙',
        study: '在念书',
        trip: '在路上',
        gym: '在健身',
      }

      function render(next) {
        view = normalize(next)
        // [dsh-piggy-claude-code mod] everything below is rebuilt from scratch
        // on every render, so switching language needs nothing but this.
        currentLang = view.lang
        host.setAttribute('lang', view.lang)
        relabelBar()
        scene.title = T('左键摸摸 · 右键打开面板 · 拖动可移动')
        pokeHintText.textContent = T('戳三下')
        host.setAttribute('data-dead', view.dead ? 'true' : 'false')
        host.setAttribute('data-open', isOpen ? 'true' : 'false')
      host.setAttribute('data-dev', 'false')
        // Drives both the prop and the pig's own activity animation.
        host.setAttribute('data-away', view.activity === null ? 'false' : view.activity.kind)
        if (view.activity === null) {
          work.hidden = true
        } else {
          work.hidden = false
          prop.textContent = view.activity.emoji
          progressFill.style.width = view.activity.progress + '%'
          work.setAttribute('data-kind', view.activity.kind)
          work.title = T('{what}：{label}', { what: T(AWAY_LINE[view.activity.kind] ?? '在外面'), label: view.activity.label })
        }

        if (view.hatched !== true) {
          wearQuery = ''
          showArt(view.boxStage.art, view.boxStage.emoji)
          pig.setAttribute('data-mood', 'box')
          // Size comes from the host so the box and the pig can never drift.
          host.style.setProperty('--pig-size', view.boxStage.size + 'px')
          soul.hidden = true
          host.setAttribute('data-soul', 'false')
          host.setAttribute('data-faded', 'false')
          host.setAttribute('data-unhatched', 'true')
          pokeHint.hidden = false
          hudName.textContent = T('一个{box}', { box: view.boxStage.label })
          hudCoins.textContent = T('点开拆开它')
          hudHealth.textContent = ''
          lastStage = null
        } else {
          const stage = view.pig.stage
          var pose = poseFor(stage, view.pig.mood, view.pig.moodLevel, view.activity)
          // A grave or a soul wears nothing; the host already sends none for them.
          wearQuery = stage.key !== 'grave' && view.pig.outfit.worn.length > 0 ? '?wear=' + view.pig.outfit.worn.join(',') : ''
          showArt(pose !== undefined ? pose : stage.art, stage.emoji)
          // Literally grows up: the stage carries its own size.
          host.style.setProperty('--pig-size', stage.size + 'px')
          pig.setAttribute('data-mood', view.pig.mood)
          host.setAttribute('data-soul', view.pig.soul ? 'true' : 'false')
          // Old age reads as a faded coat, since every stage is the same 🐖.
          host.setAttribute('data-faded', stage.faded ? 'true' : 'false')
          host.setAttribute('data-unhatched', 'false')
          pokeHint.hidden = true
          soul.hidden = view.pig.soul !== true
          pig.setAttribute('data-stage', stage.key)
          hudName.textContent = view.pig.name + ' · ' + stage.label + (view.pig.ageLabel ? ' · ' + view.pig.ageLabel : '')
          hudCoins.textContent = '🪙 ' + view.pig.coins
          hudHealth.textContent = '💚 ' + view.pig.health + '/' + view.maxHealth
          // Growing up is announced with the same flourish a level-up used to get.
          if (lastStage !== null && stage.key !== lastStage) {
            react('levelup', 950)
            burst(['✨', '🎉', '⭐'], 4)
            showBubble(T('我长大啦！') + stage.emoji, 2600)
          }
          lastStage = stage.key
        }

        // Alerts on the icon bar itself, so a collapsed pig still warns.
        icons.study.setAttribute('data-alert', view.pig !== null && view.pig.illness === null && view.activity === null && view.pig.satiety < 25 ? 'false' : 'false')
        icons.shop.setAttribute('data-alert', view.pig !== null && view.pig.illness !== null ? 'true' : 'false')
        icons.travel.setAttribute('data-alert', view.pig !== null && view.pig.coins >= 400 ? 'true' : 'false')

        for (var i = 0; i < view.pending.length; i += 1) {
          var event = view.pending[i]
          if (event.at <= lastPendingAt) continue
          lastPendingAt = event.at
          toast(str(event.text, T('猪有新消息')))
          if (event.kind === 'levelup') { react('levelup', 950); burst(['✨', '🎉'], 3) }
          else if (event.kind === 'cured') { react('cure', 900); burst(['💚', '✨'], 3) }
          else if (event.kind === 'death') react('refuse', 700)
          else if (event.kind === 'work') { react('away', 900); burst(['🪙', '💰'], 3) }
          else if (event.kind === 'study') { react('away', 900); burst(['📚', '✨'], 3) }
          else if (event.kind === 'diploma') { react('graduate', 2600); burst(['📜', '🎓', '✨'], 3) }
          else if (event.kind === 'trip') { react('away', 900); burst(['🧳', '🎁'], 3) }
          else if (event.kind === 'doctor') { react('graduate', 2600); burst(['🎓', '🎉'], 3) }
          // [Q0016]
          else if (event.kind === 'gym') { react('away', 900); burst(['💦', '💪'], 3) }
          else if (event.kind === 'muscle') { react('levelup', 950); burst(['💪', '✨', '🎉'], 3) }
          else if (event.kind === 'gold') { react('levelup', 950); burst(['🪙', '✨', '🎉'], 3) }
        }

        relabelChrome()
        // The big panel's left column and spreadsheet chrome hold no input, so
        // they always follow the snapshot.
        // [ST0014] …except the cloud login form, which can sit in that column.
        if (!cloudHasFocus()) renderSide()
        updateExcel()

        // [dsh-piggy-claude-code mod] A poll lands every few seconds. Rebuilding
        // the field mid-word would break an IME composition (Japanese, Chinese),
        // so while the name field has focus the content area waits; the hud and
        // toasts above still update, and the next poll after blur catches up.
        if (renameHasFocus() || cloudHasFocus()) return
        renderContent()
      }

      /** [dsh-piggy-claude-code mod] Tooltips on the floating panel's ⤢ and grips. */
      function relabelChrome() {
        if (expand !== null) {
          expand.title = T('打开大面板')
          expand.setAttribute('aria-label', T('打开大面板'))
        }
        for (var i = 0; i < grips.length; i += 1) grips[i].title = T('拖动调整大小 · 双击还原')
      }

      // ---- talking to the host ----
      async function refresh() {
        if (stopped) return
        // A poll can change the live content (a job finishing, an illness
        // starting), so re-check the panel still fits.
        fitPanel()
        try {
          var res = await fetch(STATE_URL, { cache: 'no-store' })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          render(await res.json())
        } catch (error) {
          if (stopped) return
          showBubble(T('连接不上宿主'), 4000)
        }
        await pollUpdate()
        await pollCloud()
      }

      /** [ST0014] Ask the pig server how the cloud login stands; a 404 means there is none. */
      async function pollCloud() {
        if (!cloudRoute || stopped) return
        try {
          var res = await fetch(CLOUD_URL, { cache: 'no-store' })
          if (res.status === 404) {
            cloudRoute = false
            return
          }
          if (res.ok) setCloud(await res.json())
        } catch (error) { /* the next poll asks again */ }
      }

      async function cloudAct(action, extra) {
        if (stopped || cloudBusy) return
        cloudBusy = true
        renderContent()
        renderSide()
        try {
          var res = await fetch(CLOUD_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(Object.assign({ action: action }, extra ?? {})),
          })
          var reply = await res.json()
          if (reply.ok === false) showBubble(cloudReason(reply), 4200)
          else if (action === 'code') { cloudDraft.code = ''; showBubble(T('验证码已发出，去邮箱看看'), 3200) }
          else if (action === 'verify') { cloudOpen = false; cloudDraft.code = ''; cloudFocus = null }
          else if (action === 'keep-cloud') showBubble(T('用了云端的猪，这台电脑的猪已经备份'), 4200)
          else if (action === 'sign-out') { cloudOpen = false; showBubble(T('已退出登录，猪留在这台电脑上'), 3200) }
          else if (action === 'pen-join') { penJoining = false; cloudDraft.pen = ''; cloudFocus = null }
          else if (action === 'pen-invite') showBubble(T('邀请发出去了，10 分钟内有效'), 3200)
          else if (action === 'pen-accept') showBubble(T('一起出发！'), 3200)
          cloudBusy = false
          if (isObj(reply.status)) setCloud(reply.status)
          if (action === 'verify' || action === 'keep-cloud' || action === 'sync' || action === 'pen-accept') await refresh()
        } catch (error) {
          showBubble(T('连接不上宿主'), 4000)
        } finally {
          cloudBusy = false
          renderContent()
          renderSide()
        }
      }

      function setCloud(raw) {
        var before = JSON.stringify(cloud)
        var hadRoute = cloud !== null
        cloud = normalizeCloud(raw)
        // [ST0014] the 在线 tab appears once the host has answered.
        if (hadRoute !== (cloud !== null)) paintBar()
        renderFriends()
        if (cloud !== null) {
          // A refused op from another device: say it once.
          for (var i = 0; i < cloud.notices.length; i += 1) {
            var n = cloud.notices[i]
            var key = n.at + ':' + n.op + ':' + n.reason
            if (cloudSaid[key]) continue
            cloudSaid[key] = true
            showBubble(T('另一台电脑上先发生了别的事，刚才的操作没有生效'), 4200)
          }
        }
        if (JSON.stringify(cloud) === before || cloudHasFocus()) return
        renderContent()
        renderSide()
      }

      /** [ST0007] Ask the host's updater how things stand; a 404 means it has none. */
      async function pollUpdate() {
        if (!updateRoute || stopped) return
        try {
          var res = await fetch(UPDATE_URL, { cache: 'no-store' })
          if (res.status === 404) {
            updateRoute = false
            return
          }
          if (res.ok) setUpdate(await res.json())
        } catch (error) { /* the next poll asks again */ }
      }

      async function updateAct(action) {
        if (stopped) return
        try {
          var res = await fetch(UPDATE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: action }),
          })
          if (res.ok) setUpdate(await res.json())
        } catch (error) {
          showBubble(T('连接不上宿主'), 4000)
        }
      }

      function setUpdate(raw) {
        var before = JSON.stringify(update)
        update = normalizeUpdate(raw)
        if (update !== null && (update.status === 'checking' || update.status === 'downloading' || update.status === 'installing')) {
          // Moving along: look again soon rather than at the next state poll.
          window.setTimeout(pollUpdate, 1000)
        }
        if (JSON.stringify(update) === before) return
        // The pig says it once per version, even with the panel closed.
        if (update !== null && update.status === 'available' && update.latest !== null && !updateTold[update.latest.version]) {
          updateTold[update.latest.version] = true
          showBubble(T('有新版本 v{version} 啦，右键打开面板更新', { version: update.latest.version }), 6000)
        }
        renderContent()
        renderSide()
      }

      async function send(action, extra) {
        if (busy || stopped) return
        // The language can be switched before hatching, too.
        if (view.pig === null && action !== 'hatch' && action !== 'lang') return
        busy = true
        flash(action)
        try {
          var body = { action: action }
          if (extra) for (var k in extra) body[k] = extra[k]
          var res = await fetch(ACT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          var next = await res.json()
          var refused = next && next.ok === false
          // A refused name reopens the field with what was typed, so it can be fixed.
          if (action === 'rename') {
            if (refused && ['bad-name', 'same-name', 'need-card'].indexOf(next.reason) >= 0) renaming = true
            else if (!refused) renameDraft = ''
          }
          if (action === 'study' && !refused) studyPicks = { stage: null, keys: [] }
          // [ST0015] a blackjack hand that just ended stays on the table until the next deal.
          var round = action === 'blackjack' && !refused ? normalizeHand(next.round) : null
          if (action === 'blackjack' && !refused) blackjackLast = round !== null && round.outcome !== '' ? round : null
          render(next)
          if (action === 'rename' && renaming) focusRename(null)
          // [dsh-piggy-claude-code mod] the scratch card's result, said by the pig.
          if (action === 'lottery' && !refused && isObj(next.prize)) {
            var won = num(next.prize.coins, 0)
            var prizeEntry = (view.lottery === null ? [] : view.lottery.prizes).filter(p => p.tier === next.prize.tier)[0]
            var verdict = next.prize.mood === 'jackpot' ? 'jackpot' : next.prize.mood === 'happy' ? 'win' : 'lose'
            var line = won > 0
              ? T('中了{prize}！+{coins} 🪙', { prize: prizeEntry === undefined ? '' : prizeEntry.label, coins: won })
              : T('谢谢参与…下次一定')
            // Scratch first; the result (and what the pig says) only after.
            react('scratch', 1500)
            window.setTimeout(function () {
              react(verdict, 2400)
              if (verdict === 'jackpot') burst(['🪙', '✨', '🎉'], 5)
              else if (verdict === 'win') burst(['🎉', '🎊'], 3)
              showBubble(line, 3600)
            }, 1400)
          }
          // [ST0015] a blackjack hand that ended: the pig reacts and says the total.
          if (round !== null && round.outcome !== '') {
            react(round.outcome === 'bust' ? 'lose' : round.outcome, 2400)
            if (round.outcome === 'jackpot') burst(['🃏', '🪙', '🎉'], 5)
            else if (round.outcome === 'win') burst(['🪙', '🎊'], 3)
            showBubble(round.outcome === 'jackpot'
              ? T('正好 21 点！+{coins} 🪙', { coins: round.coins })
              : round.outcome === 'win'
                ? T('{total} 点，×{m}，+{coins} 🪙', { total: round.total, m: round.multiplier, coins: round.coins })
                : T('爆了！{total} 点，输掉 {bet} 🪙', { total: round.total, bet: round.bet }), 3600)
          }
          if (next && next.ok === false) {
            react('refuse', 520)
            if (next.reason === 'no-item') {
              var emptyKind = str(next.kind, '')
              showBubble(T(NO_ITEM_LINE[emptyKind] ?? '背包里没有能用的东西'), 3200)
              return
            }
            var reasons = {
              poor: '钱不够',
              away: '它在外面',
              weak: '太虚弱了，先养好再出门',
              hungry: '太饿了',
              'wrong-medicine': '药不对症',
              empty: '背包里没有',
              'not-sick': '它没生病',
              dead: '它已经走了…',
              idle: '它没在外面',
              'bad-lang': '不认识这种语言',
              'not-for-sale': '这是旅行限定，商店不卖',
              'use-to-rename': '更名卡要在「状态」里改名时用',
              owned: '已经在衣柜里了',
              'daily-limit': '这个每天只能买一个，明天再来',
              'bad-name': '名字要 1–16 个字',
              'same-name': '和现在的名字一样',
              asleep: '它已经在睡了',
              awake: '它本来就醒着',
              // [ST0015] blackjack
              'in-hand': '先把这一手打完',
              'no-hand': '桌上没有牌',
              'bad-bet': '没有这个下注',
            }
            // [dsh-piggy-claude-code mod] refusals that carry a number.
            if (next.reason === 'too-many') {
              var most = num(next.max, stageDetail(stage) === null ? 1 : stageDetail(stage).parallel)
              showBubble(T('这一段一次最多上 {n} 门课', { n: most }), 2400)
              return
            }
            if (next.reason === 'capped') {
              showBubble(T('这一段每门课最多上 {n} 次', { n: num(next.max, 0) }), 2400)
              return
            }
            if (next.reason === 'job-locked') {
              var lacking = arr(next.missing).map(m => {
                var title = TRAIT_TITLE[str(obj(m).trait, '')]
                return (title === undefined ? '' : title[0] + T(title[1])) + ' ' + num(obj(m).need, 0)
              })
              showBubble(T('这份工作要求：{list}', { list: lacking.join(' · ') }), 3200)
              return
            }
            if (next.reason === 'too-low') {
              var line18 = view.blackjack === null ? 18 : view.blackjack.standAt
              showBubble(T('不到 {n} 点不能停，再要一张吧', { n: line18 }), 2600)
              return
            }
            // [Q0016] the gym turns away a pig already down at the floor.
            if (next.reason === 'too-light' && view.gym !== null) {
              showBubble(T('已经瘦到 {kg} kg，不能再减了', { kg: view.gym.floorKg }), 2600)
              return
            }
            if (next.reason === 'need-card') {
              var price = num(next.price, view.pig === null ? 1000 : view.pig.renameCardPrice)
              showBubble(T('改名要一张 🪪 更名卡（商店 {price} 🪙）', { price: price }), 3200)
              return
            }
            showBubble(next.reason === 'cooldown'
              ? T('还要等 {n} 秒', { n: num(next.wait, 0) })
              : T(reasons[next.reason] ?? '这个操作没成'), 2400)
          }
        } catch (error) {
          showBubble(T('操作没送到宿主'), 2600)
          react('refuse', 520)
        } finally {
          busy = false
        }
      }

      // ---- drag the pig; right-click it for the menu ----
      var drag = null
      scene.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return
        // The big panel's pig stands still in its column: a press is a pat.
        if (split) return
        drag = {
          x: event.clientX, y: event.clientY,
          right: parseFloat(getComputedStyle(host).right) || 18,
          bottom: parseFloat(getComputedStyle(host).bottom) || 18,
          moved: false,
        }
        scene.setAttribute('data-dragging', 'true')
        scene.setPointerCapture?.(event.pointerId)
      })
      scene.addEventListener('pointermove', function (event) {
        if (drag === null) return
        var dx = event.clientX - drag.x
        var dy = event.clientY - drag.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true
        userRight = drag.right - dx
        userBottom = drag.bottom - dy
        clampPig()
        // The panel rides along so it is never left behind off screen.
        fitPanel()
      })
      function endDrag() {
        if (drag === null) return false
        var moved = drag.moved
        drag = null
        scene.removeAttribute('data-dragging')
        clampPig()
        writeStore(POSITION_KEY, JSON.stringify({ right: userRight, bottom: userBottom }))
        fitPanel()
        return moved
      }
      // [dsh-piggy-claude-code mod] A desktop shell drags the whole window, and
      // keeps the window on screen; whatever of the move the window cannot take
      // at a screen edge, it hands back here as the pig's spot inside the window.
      host.addEventListener('dsh-pig:place', function (event) {
        var at = isObj(event.detail) ? event.detail : {}
        if (split || typeof at.right !== 'number' || typeof at.bottom !== 'number') return
        if (!isFinite(at.right) || !isFinite(at.bottom)) return
        userRight = at.right
        userBottom = at.bottom
        clampPig()
        writeStore(POSITION_KEY, JSON.stringify({ right: userRight, bottom: userBottom }))
        fitPanel()
      })
      // [ST0026] The desktop host says whether a pen is fenced in on the desk
      // (on load, and whenever it is drawn or taken down).
      host.addEventListener('dsh-pig:pen', function (event) {
        var at = isObj(event.detail) ? event.detail : {}
        deskPen = { set: at.set === true, width: Math.round(num(at.width, 0)), height: Math.round(num(at.height, 0)) }
        renderFriends()
        if (cloudHasFocus()) return
        renderContent()
        renderSide()
      })
      var boxPokes = 0

      /**
       * Poke the box. Three pokes and the piglet comes out — the count is what
       * makes it feel like something is in there rather than a button that
       * happens to be cardboard-shaped.
       */
      function pokeBox() {
        boxPokes += 1
        react('poke', 560)
        if (boxPokes >= BOX_POKES_TO_OPEN) {
          boxPokes = 0
          host.removeAttribute('data-poke')
          showBubble(T('哇——！'), 1200)
          burst(['✨', '🎉', '💨'], 6)
          send('hatch')
          return
        }
        host.setAttribute('data-poke', String(boxPokes))
        burst(['💨'], 2)
        showBubble(T(BOX_POKE_LINES[boxPokes - 1]), 2200)
      }

      // Left click is a pat on the head. The menu is on the context menu, so a
      // stray click can no longer open or close the panel by accident.
      scene.addEventListener('pointerup', function (event) {
        if (endDrag()) return
        // [ST0014] a pen mate's pig is not ours to pat.
        if (event?.target?.closest?.('.dp-friends')) return
        // An unhatched save is a box, whether or not one exists yet.
        if (view.hatched !== true) {
          pokeBox()
          return
        }
        if (!view.dead) flash('pet')
      })
      scene.addEventListener('pointercancel', function () { endDrag() })
      scene.addEventListener('contextmenu', function (event) {
        event.preventDefault()
        // Nothing to toggle in the big panel.
        if (split) return
        setOpen(!isOpen)
        if (isOpen && view.pig !== null) flash('pet')
      })

      // ---- [dsh-piggy-claude-code mod] resize the panel ----
      // Grabbed by the top-left corner (both ways) or the top/left edge (one
      // way). The panel is pinned at its bottom-right, so pulling up and left
      // makes it bigger. Everything stops at the grip: a resize never reaches
      // the pig, so it cannot pat it, toggle the menu or start a pig drag.
      var sizing = null
      function startResize(grip, event) {
        if (event.button !== undefined && event.button !== 0) return
        event.stopPropagation?.()
        event.preventDefault?.()
        var r = card.getBoundingClientRect()
        sizing = {
          grip: grip,
          kind: grip.getAttribute('data-resize'),
          x: num(event.clientX, 0),
          y: num(event.clientY, 0),
          w: r.width > 0 ? r.width : PANEL_WIDTH,
          h: r.height > 0 ? r.height : CARD_MIN_HEIGHT,
        }
        // Hosts that pass clicks through transparent pixels can key off this
        // to keep the pointer while it is dragged past the panel's edge.
        host.setAttribute('data-resizing', sizing.kind)
        grip.setPointerCapture?.(event.pointerId)
      }
      function moveResize(event) {
        if (sizing === null) return
        event.stopPropagation?.()
        var dx = sizing.x - num(event.clientX, sizing.x)
        var dy = sizing.y - num(event.clientY, sizing.y)
        cardSize = clampCardSize(
          sizing.kind === 'top' ? sizing.w : sizing.w + dx,
          sizing.kind === 'left' ? sizing.h : sizing.h + dy,
          panelRoom(),
        )
        fitPanel()
      }
      function endResize(event) {
        if (sizing === null) return
        event?.stopPropagation?.()
        sizing.grip.releasePointerCapture?.(event?.pointerId)
        sizing = null
        host.removeAttribute('data-resizing')
        if (cardSize !== null) writeStore(CARD_SIZE_KEY, JSON.stringify(cardSize))
      }
      function resetCardSize(event) {
        event?.stopPropagation?.()
        event?.preventDefault?.()
        cardSize = null
        writeStore(CARD_SIZE_KEY, '')
        fitPanel()
      }
      for (var gi = 0; gi < grips.length; gi += 1) {
        (function (grip) {
          grip.addEventListener('pointerdown', function (event) { startResize(grip, event) })
          grip.addEventListener('pointermove', moveResize)
          grip.addEventListener('pointerup', endResize)
          grip.addEventListener('pointercancel', endResize)
          grip.addEventListener('dblclick', resetCardSize)
          grip.addEventListener('click', function (event) { event.stopPropagation?.() })
        })(grips[gi])
      }

      // [dsh-piggy-claude-code mod] The panel closes when it loses focus: a
      // click anywhere on the page outside the pig and its panel, or — on the
      // desktop pet, whose window lets clicks fall through to other apps — the
      // window itself losing focus. Dev mode keeps it open for inspection, and
      // the big panel has nothing to close.
      function onOutsidePointer(event) {
        if (!isOpen || devMode || split) return
        var target = event.target
        if (target !== null && typeof target === 'object' && typeof host.contains === 'function' && host.contains(target)) return
        setOpen(false)
      }
      var desktopPet = (function () {
        try { return typeof window.webkit?.messageHandlers?.pig?.postMessage === 'function' } catch (error) { return false }
      })()
      function onWindowBlur() {
        if (!isOpen || devMode || split || !desktopPet) return
        setOpen(false)
      }
      document.addEventListener?.('pointerdown', onOutsidePointer, true)
      window.addEventListener?.('blur', onWindowBlur)

      // ---- life ----
      clampPig()
      applySkin()
      setOpen(isOpen)
      render(view)
      refresh()
      pollTimer = window.setInterval(refresh, POLL_MS)
      // Optional call: minimal test environments stub a window without listeners.
      // Optional call: minimal test environments stub a window without listeners.
      function onResize() {
        clampPig()
        fitPanel()
      }
      window.addEventListener?.('resize', onResize)

      // ---- developer mode: Ctrl+Shift+D ----
      function setDevMode(on) {
        devMode = on === true
        writeStore(DEV_KEY, devMode ? '1' : '0')
        host.setAttribute('data-dev', devMode ? 'true' : 'false')
        paintBar()
        if (devMode) {
          setOpen(true)
          select('dev')
          showBubble('🔧 ' + T('开发者模式已开'), 2000)
        } else {
          if (tab === 'dev') select('status')
          showBubble(T('开发者模式已关'), 1600)
        }
      }

      devMode = readStore(DEV_KEY) === '1'
      host.setAttribute('data-dev', devMode ? 'true' : 'false')
      if (devMode) paintBar()

      function onKeyDown(event) {
        if (event.ctrlKey && event.shiftKey && (event.key === 'D' || event.key === 'd')) {
          event.preventDefault()
          setDevMode(!devMode)
          return
        }
        if (!split) return
        // [dsh-piggy-claude-code mod] The boss key: Ctrl+Shift+E, or Escape
        // twice in quick succession, turns the big panel into a spreadsheet
        // at once. Only the status bar's view button turns it back.
        if (event.ctrlKey && event.shiftKey && (event.key === 'E' || event.key === 'e')) {
          event.preventDefault?.()
          setSkin('excel')
          return
        }
        if (event.key === 'Escape') {
          var now = Date.now()
          if (now - lastEscape <= BOSS_ESC_MS) {
            lastEscape = 0
            setSkin('excel')
          } else {
            lastEscape = now
          }
        }
      }
      window.addEventListener?.('keydown', onKeyDown)

      // Also reachable from the console, for when the panel is off screen.
      try {
        window.dshPigDev = {
          on: function () { setDevMode(true) },
          off: function () { setDevMode(false) },
          toggle: function () { setDevMode(!devMode) },
        }
      } catch (error) { /* frozen window */ }

      function dispose() {
        stopped = true
        window.removeEventListener?.('resize', onResize)
        window.removeEventListener?.('keydown', onKeyDown)
        try {
          if (split && originalTitle !== null) document.title = originalTitle
        } catch (error) { /* a read-only title */ }
        window.removeEventListener?.('blur', onWindowBlur)
        document.removeEventListener?.('pointerdown', onOutsidePointer, true)
        if (pollTimer !== null) window.clearInterval(pollTimer)
        if (reactTimer !== null) window.clearTimeout(reactTimer)
        if (bubbleTimer !== null) window.clearTimeout(bubbleTimer)
        pollTimer = null
        reactTimer = null
        bubbleTimer = null
        host.remove()
        style.remove()
        font.remove()
      }

      return dispose
    }

    exports.name = 'dsh-piggy'
    exports.apply = apply
    // For tests and tooling, like the host's `dictionaries`.
    exports.I18N = I18N
    exports.pickRoamMove = pickRoamMove
    exports.tr = tr
    return module.exports
  },
})
