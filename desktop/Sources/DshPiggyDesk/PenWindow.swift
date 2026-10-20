import Cocoa
import WebKit

/// [ST0026] The desk's pig pen: a transparent, click-through window over the
/// area the player fenced in, showing the pen page (`/desk?pen=1`), where the
/// pen mates chosen in 在线 roam. Hidden while no pen is fenced in.
@MainActor
final class PenYard {
    private static let rectKey = "penRect"

    let window: NSPanel
    private let webView: WKWebView
    /// Where the pen is on the desk, in screen coordinates; nil while there is none.
    private(set) var rect: NSRect?

    init() {
        window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        webView = WKWebView(frame: window.contentLayoutRect, configuration: WKWebViewConfiguration())
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        // Like the pig: an ordinary window, which other apps may cover.
        window.level = .normal
        window.hidesOnDeactivate = false
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces]
        // The pen mates are to look at, never to click: the desk stays usable.
        window.ignoresMouseEvents = true
        window.contentView = webView

        if let saved = UserDefaults.standard.string(forKey: Self.rectKey) {
            let restored = NSRectFromString(saved)
            // A screen that has since gone away takes its pen with it.
            if restored.width > 0, restored.height > 0, NSScreen.screens.contains(where: { $0.visibleFrame.intersects(restored) }) {
                rect = restored
                window.setFrame(restored, display: false)
            }
        }
    }

    func load(_ url: URL) {
        webView.load(URLRequest(url: url))
    }

    func reload() {
        webView.reload()
    }

    /// Fence in a new pen (or take it down with nil) and remember it.
    func set(_ next: NSRect?) {
        rect = next
        if let next {
            UserDefaults.standard.set(NSStringFromRect(next), forKey: Self.rectKey)
            window.setFrame(next, display: true)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.rectKey)
            window.orderOut(nil)
        }
    }

    /// Show the pen just under the pig, so the pig stays in front of its friends.
    func show(below pig: NSWindow) {
        guard rect != nil else {
            window.orderOut(nil)
            return
        }
        window.order(.below, relativeTo: pig.windowNumber)
    }

    func hide() {
        window.orderOut(nil)
    }

    /// What the pig's page is told about the pen (`window.__pigPen`).
    var pageInfo: String {
        guard let rect else { return "{set:false}" }
        return "{set:true,width:\(Int(rect.width.rounded())),height:\(Int(rect.height.rounded()))}"
    }
}

/// A borderless panel that takes the keyboard, for Esc.
private final class KeyPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// Reacts to the first click even when its window is not key.
private final class PickerWebView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// [ST0026] Fencing in the pen: the overlay page (`/pen-pick`) over the work
/// area of the screen the mouse is on. Dragging out a box ends it with that
/// box in screen coordinates; Esc, a right click or switching apps ends it
/// with nil.
@MainActor
final class PenPicker: NSObject, WKScriptMessageHandler {
    private let window: NSPanel
    private let webView: WKWebView
    private let onDone: (NSRect?) -> Void
    private var done = false

    init(baseURL: URL, lang: String, current: NSRect?, onDone: @escaping (NSRect?) -> Void) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main ?? NSScreen.screens[0]
        let frame = screen.visibleFrame
        window = KeyPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        let configuration = WKWebViewConfiguration()
        webView = PickerWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: configuration)
        self.onDone = onDone
        super.init()

        configuration.userContentController.add(WeakMessageHandler(self), name: "pig")
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .statusBar
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.contentView = webView
        window.setFrame(frame, display: false)

        var components = URLComponents(url: baseURL.appendingPathComponent("pen-pick"), resolvingAgainstBaseURL: false)!
        var items = [URLQueryItem(name: "lang", value: lang)]
        // The pen there is now, in the page's coordinates (top-left origin).
        if let current, current.intersects(frame) {
            items += [
                URLQueryItem(name: "x", value: String(Int(current.minX - frame.minX))),
                URLQueryItem(name: "y", value: String(Int(frame.maxY - current.maxY))),
                URLQueryItem(name: "w", value: String(Int(current.width))),
                URLQueryItem(name: "h", value: String(Int(current.height))),
            ]
        }
        components.queryItems = items
        webView.load(URLRequest(url: components.url!))
    }

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "penPicked":
            let x = (body["x"] as? Double) ?? 0
            let y = (body["y"] as? Double) ?? 0
            let width = (body["width"] as? Double) ?? 0
            let height = (body["height"] as? Double) ?? 0
            guard width > 0, height > 0 else { return }
            let frame = window.frame
            finish(NSRect(x: frame.minX + x, y: frame.maxY - y - height, width: width, height: height))
        case "penCancel":
            finish(nil)
        default:
            break
        }
    }

    private func finish(_ rect: NSRect?) {
        guard !done else { return }
        done = true
        window.orderOut(nil)
        onDone(rect)
    }
}
