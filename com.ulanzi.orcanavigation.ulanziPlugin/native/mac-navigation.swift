import AppKit
import ApplicationServices

func wheelTarget(_ remaining: Int, _ delta: Int) -> Int {
    let pending = remaining * delta < 0 ? 0 : remaining
    // shortcut: cap the backlog at 600px; calibrate distance with physical knob input.
    return max(-600, min(600, pending + delta))
}
func wheelStep(_ remaining: Int) -> Int {
    return remaining == 0 ? 0 : (remaining > 0 ? 1 : -1) * max(1, Int(ceil(Double(abs(remaining)) * 0.25)))
}

func fail(_ message: String) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: ["ok": false, "error": message])
    print(String(data: data, encoding: .utf8)!)
    exit(1)
}
let args = Array(CommandLine.arguments.dropFirst())
let shortcuts: [String: (CGKeyCode, CGEventFlags)] = [
    "leftPanel": (11, .maskCommand), "rightPanel": (37, .maskCommand),
    "confirm": (36, []), "cancel": (53, []), "dictation": (14, .maskCommand),
    "newAgent": (17, [.maskCommand, .maskAlternate])
]
guard args.count == 2,
      (args[0] == "shortcut" && shortcuts[args[1]] != nil) ||
      (["workspace", "chat", "wheel"].contains(args[0]) && ["previous", "next"].contains(args[1])) ||
      (args[0] == "wheel" && args[1] == "stream") else {
    fail("알 수 없는 탐색 동작입니다.")
}
if args[0] == "wheel" {
    guard CGPreflightPostEventAccess() else { fail("Studio의 키 입력 권한이 필요합니다. 권한을 자동 변경하지 않습니다.") }
    guard let source = CGEventSource(stateID: .privateState) else { fail("키 입력을 만들지 못했습니다.") }
    var remaining = 0
    var ended = false
    func accept(_ direction: String) {
        guard ["previous", "next"].contains(direction) else { fail("알 수 없는 탐색 동작입니다.") }
        let delta = direction == "previous" ? 60 : -60
        remaining = wheelTarget(remaining, delta)
        print("{\"ok\":true,\"delivered\":true}")
        fflush(stdout)
    }
    let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { _ in
        if remaining != 0 {
            let step = wheelStep(remaining)
            guard let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel,
                                      wheelCount: 1, wheel1: Int32(step), wheel2: 0, wheel3: 0) else {
                fail("키 입력을 만들지 못했습니다.")
            }
            event.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
            event.post(tap: .cghidEventTap)
            remaining -= step
        } else if ended { exit(0) }
    }
    if args[1] == "stream" {
        DispatchQueue.global().async {
            while let line = readLine() {
                DispatchQueue.main.async { accept(line) }
            }
            DispatchQueue.main.async { ended = true }
        }
    } else {
        accept(args[1])
        ended = true
    }
    RunLoop.main.run()
    withExtendedLifetime(timer) {}
    exit(0)
}
let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.stablyai.orca")
guard apps.count == 1 else { fail("Orca 앱이 하나 실행되어 있어야 합니다.") }
let app = apps[0]
guard CGPreflightPostEventAccess() else { fail("Studio의 키 입력 권한이 필요합니다. 권한을 자동 변경하지 않습니다.") }
func key(_ code: CGKeyCode, _ flags: CGEventFlags = [], foreground: Bool = false) {
    guard let source = CGEventSource(stateID: .privateState),
          let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false) else {
        fail("키 입력을 만들지 못했습니다.")
    }
    down.flags = flags
    up.flags = flags
    if foreground {
        guard app.isActive else { fail("Orca를 활성화하지 못했습니다.") }
        down.post(tap: .cghidEventTap)
        // shortcut: short holds let native tab shortcuts settle; recalibrate with physical input after updates.
        Thread.sleep(forTimeInterval: 0.02)
        up.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.025)
    } else {
        down.postToPid(app.processIdentifier)
        up.postToPid(app.processIdentifier)
    }
}
if args[0] == "shortcut", let chord = shortcuts[args[1]] {
    app.activate(options: [])
    Thread.sleep(forTimeInterval: 0.025)
    // Enter/Escape preserve Orca's current focus; they do not identify or approve a request.
    key(chord.0, chord.1, foreground: true)
} else if args[0] == "chat" {
    app.activate(options: [])
    Thread.sleep(forTimeInterval: 0.025)
    key(args[1] == "previous" ? 33 : 30, [.maskCommand, .maskShift], foreground: true)
} else {
    key(29, [.maskCommand, .maskShift])
    // shortcut: allow 25ms for Orca to handle the focus chord; calibrate again after app updates.
    Thread.sleep(forTimeInterval: 0.025)
    key(args[1] == "previous" ? 126 : 125)
}
print("{\"ok\":true,\"delivered\":true}")
