import Cocoa

/// Menu-bar app: no Dock icon, a floating pig, and a small status menu —
/// the same shape as the traffic-light widget.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let server = PigServer()
    private let pet = PetWindow()
    /// [ST0026] The desk's pig pen, and the overlay that fences one in.
    private let pen = PenYard()
    private var picker: PenPicker?
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let statusLineItem = NSMenuItem(title: "🐖 …", action: nil, keyEquivalent: "")
    private var toggleItem: NSMenuItem?
    private var peekTimer: Timer?
    /// The pig's language (zh · ja · en), read from the panel server.
    private var lang = "zh"

    func applicationDidFinishLaunching(_ notification: Notification) {
        setUpStatusItem()
        Task { @MainActor in
            guard await server.ensureRunning() else {
                statusLineItem.title = t("面板服务没起来：检查 {path}").replacingOccurrences(of: "{path}", with: server.root.path)
                return
            }
            pet.onOpenPanel = { [weak self] in self?.openInBrowser() }
            pet.onPenDraw = { [weak self] in self?.pickPen() }
            pet.onPenClear = { [weak self] in self?.setPen(nil) }
            pet.onLoaded = { [weak self] in self?.announcePen() }
            pet.onFront = { [weak self] in self?.showPen() }
            pet.load(server.deskURL)
            pen.load(server.penURL)
            pet.show()
            showPen()
            await refreshPeek()
            peekTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                Task { @MainActor in await self?.refreshPeek() }
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    // MARK: status item

    private func setUpStatusItem() {
        if let image = NSImage(contentsOf: server.artURL) {
            image.size = NSSize(width: 18, height: 18)
            item.button?.image = image
        } else {
            item.button?.title = "🐖"
        }
        rebuildMenu()
    }

    /// Menu titles follow the pig's language, so the menu is rebuilt when it changes.
    private func rebuildMenu() {
        // The status line is one item reused across rebuilds; AppKit throws if
        // it is added to a new menu while still in the old one — and an
        // Objective-C exception unwinding through Swift async code left the
        // concurrency runtime corrupt, so the app crashed later elsewhere.
        statusLineItem.menu?.removeItem(statusLineItem)
        let menu = NSMenu()
        menu.addItem(statusLineItem)
        menu.addItem(.separator())
        let toggle = action(pet.isVisible ? t("隐藏猪") : t("显示猪"), #selector(togglePet))
        toggleItem = toggle
        menu.addItem(toggle)
        menu.addItem(action(t("猪回到右下角"), #selector(resetPosition)))
        menu.addItem(action(t("在浏览器打开面板"), #selector(openInBrowser)))
        menu.addItem(action(t("重新载入"), #selector(reload)))
        menu.addItem(.separator())
        let languages = NSMenuItem(title: "🌐 " + t("语言"), action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for (key, name) in Self.languages {
            let choice = action(name, #selector(chooseLanguage(_:)))
            choice.representedObject = key
            choice.state = key == lang ? .on : .off
            submenu.addItem(choice)
        }
        languages.submenu = submenu
        menu.addItem(languages)
        menu.addItem(.separator())
        menu.addItem(action(t("退出"), #selector(quit)))
        item.menu = menu
    }

    private func action(_ title: String, _ selector: Selector) -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        menuItem.target = self
        return menuItem
    }

    private func refreshPeek() async {
        guard let peek = await server.peek() else {
            statusLineItem.title = t("🐖 面板服务无响应")
            return
        }
        statusLineItem.title = peek.line
        item.button?.toolTip = peek.line
        if let next = peek.lang, next != lang {
            lang = next
            rebuildMenu()
        }
    }

    private func refreshToggleTitle() {
        toggleItem?.title = pet.isVisible ? t("隐藏猪") : t("显示猪")
    }

    @objc private func togglePet() {
        if pet.isVisible {
            pet.hide()
            pen.hide()
        } else {
            pet.show()
            showPen()
        }
        refreshToggleTitle()
    }

    @objc private func resetPosition() {
        pet.resetPosition()
        pet.show()
        showPen()
        refreshToggleTitle()
    }

    // MARK: the desk's pen (ST0026)

    /// The pen sits just under the pig, and only while the pig is out.
    private func showPen() {
        if pet.isVisible { pen.show(below: pet.window) } else { pen.hide() }
    }

    private func announcePen() {
        pet.announcePen(pen.pageInfo)
    }

    /// Lay the overlay over the desk; the box dragged out there becomes the pen.
    private func pickPen() {
        guard picker == nil else { return }
        let next = PenPicker(baseURL: server.baseURL, lang: lang, current: pen.rect) { [weak self] rect in
            guard let self else { return }
            self.picker = nil
            if let rect { self.setPen(rect) }
        }
        picker = next
        next.show()
    }

    private func setPen(_ rect: NSRect?) {
        pen.set(rect)
        showPen()
        announcePen()
    }

    @objc private func openInBrowser() {
        NSWorkspace.shared.open(server.panelURL)
    }

    @objc private func reload() {
        pet.reload()
        pen.reload()
    }

    @objc private func chooseLanguage(_ sender: NSMenuItem) {
        guard let key = sender.representedObject as? String else { return }
        Task { @MainActor in
            await server.act(["action": "lang", "lang": key])
            await refreshPeek()
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    // MARK: language

    private static let languages: [(String, String)] = [("zh", "中文"), ("ja", "日本語"), ("en", "English")]

    /// Menu strings; Chinese is the key, like the pig's own i18n.js.
    private static let strings: [String: [String: String]] = [
        "ja": [
            "隐藏猪": "ブタをかくす",
            "显示猪": "ブタを表示",
            "猪回到右下角": "ブタを右下にもどす",
            "在浏览器打开面板": "ブラウザでパネルを開く",
            "重新载入": "再読み込み",
            "语言": "言語",
            "退出": "終了",
            "🐖 面板服务无响应": "🐖 パネルサーバーが応答しません",
            "面板服务没起来：检查 {path}": "パネルサーバーを起動できません：{path} を確認してください",
        ],
        "en": [
            "隐藏猪": "Hide the pig",
            "显示猪": "Show the pig",
            "猪回到右下角": "Move the pig back to the corner",
            "在浏览器打开面板": "Open the panel in a browser",
            "重新载入": "Reload",
            "语言": "Language",
            "退出": "Quit",
            "🐖 面板服务无响应": "🐖 The panel server is not answering",
            "面板服务没起来：检查 {path}": "The panel server did not start: check {path}",
        ],
    ]

    private func t(_ zh: String) -> String {
        Self.strings[lang]?[zh] ?? zh
    }
}
