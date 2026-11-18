// Windows native helper: brings Orca to the foreground and sends shortcuts with SendInput.
// Build: C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:windows-navigation.exe windows-navigation.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;
using System.Threading;

static class OrcaNavigation
{
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);

    static IntPtr cachedOrca = IntPtr.Zero;

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public KEYBDINPUT ki; public long pad; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }

    const ushort CTRL = 0x11, SHIFT = 0x10, ALT = 0x12;
    const ushort ENTER = 0x0D, ESC = 0x1B, UP = 0x26, DOWN = 0x28;
    const uint KEYUP = 0x0002, EXTENDED = 0x0001;

    static void Fail(string message)
    {
        Console.WriteLine("{\"ok\":false,\"error\":\"" + message.Replace("\"", "'") + "\"}");
        Environment.Exit(1);
    }

    static IntPtr FindOrca()
    {
        // Serve mode keeps the handle; re-resolve only when the window is gone.
        if (cachedOrca != IntPtr.Zero && IsWindow(cachedOrca)) return cachedOrca;
        cachedOrca = IntPtr.Zero;
        foreach (var p in Process.GetProcessesByName("Orca"))
        {
            try { if (p.MainWindowHandle != IntPtr.Zero) { cachedOrca = p.MainWindowHandle; return cachedOrca; } } catch { }
        }
        return IntPtr.Zero;
    }

    static bool Foreground(IntPtr h)
    {
        if (IsIconic(h)) ShowWindow(h, 9);
        if (GetForegroundWindow() == h) return true;
        uint pid;
        uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        uint me = GetCurrentThreadId();
        bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
        SetForegroundWindow(h);
        if (attached) AttachThreadInput(me, fgThread, false);
        for (int i = 0; i < 20; i++)
        {
            if (GetForegroundWindow() == h) return true;
            Thread.Sleep(25);
        }
        return false;
    }

    static INPUT Key(ushort vk, bool up)
    {
        var i = new INPUT { type = 1 };
        i.ki.vk = vk;
        uint flags = up ? KEYUP : 0;
        if (vk == UP || vk == DOWN || vk == 0x21 || vk == 0x22) flags |= EXTENDED;
        i.ki.flags = flags;
        return i;
    }

    static void Press(ushort key, params ushort[] mods)
    {
        var list = new List<INPUT>();
        foreach (var m in mods) list.Add(Key(m, false));
        list.Add(Key(key, false));
        var down = list.ToArray();
        if (SendInput((uint)down.Length, down, Marshal.SizeOf(typeof(INPUT))) != down.Length) Fail("키 입력을 만들지 못했습니다.");
        Thread.Sleep(20);
        var ups = new List<INPUT> { Key(key, true) };
        for (int i = mods.Length - 1; i >= 0; i--) ups.Add(Key(mods[i], true));
        var up = ups.ToArray();
        SendInput((uint)up.Length, up, Marshal.SizeOf(typeof(INPUT)));
        Thread.Sleep(25);
    }

    static string Wheel(string dir)
    {
        AutomationElement focused;
        try { focused = AutomationElement.FocusedElement; } catch { return "포커스된 요소를 읽지 못했습니다."; }
        if (focused == null) return "포커스된 요소를 읽지 못했습니다.";
        string owner;
        try { owner = Process.GetProcessById(focused.Current.ProcessId).ProcessName; } catch { return "포커스된 요소를 읽지 못했습니다."; }
        // Never scroll another app: the focused element must belong to Orca.
        if (!owner.Equals("Orca", StringComparison.OrdinalIgnoreCase)) return "Orca 터미널에 포커스가 없습니다.";
        var rect = focused.Current.BoundingRectangle;
        int x = (int)(rect.X + 4), y = (int)(rect.Y + 8);
        IntPtr window = IntPtr.Zero;
        for (var node = focused; node != null; node = TreeWalker.RawViewWalker.GetParent(node))
        {
            int handle = node.Current.NativeWindowHandle;
            if (handle != 0) { window = new IntPtr(handle); break; }
        }
        if (window == IntPtr.Zero) window = FindOrca();
        if (window == IntPtr.Zero) return "Orca 앱이 실행되어 있어야 합니다.";
        int delta = dir == "previous" ? 120 : -120;
        // WM_MOUSEWHEEL carries screen coordinates, so the wheel lands on the caret's pane and the pointer stays put.
        IntPtr wParam = new IntPtr((long)((delta & 0xFFFF) << 16));
        IntPtr lParam = new IntPtr((long)(((y & 0xFFFF) << 16) | (x & 0xFFFF)));
        SendMessage(window, 0x020A, wParam, lParam);
        return null;
    }

    static string Handle(string scope, string dir)
    {
        var shortcuts = new Dictionary<string, KeyValuePair<ushort, ushort[]>> {
            { "leftPanel", new KeyValuePair<ushort, ushort[]>(0x42, new[] { CTRL }) },
            { "rightPanel", new KeyValuePair<ushort, ushort[]>(0x4C, new[] { CTRL }) },
            { "confirm", new KeyValuePair<ushort, ushort[]>(ENTER, new ushort[0]) },
            { "cancel", new KeyValuePair<ushort, ushort[]>(ESC, new ushort[0]) },
            // Dictation: Ctrl+Space (external dictation tool), not Orca's own Ctrl+E.
            { "dictation", new KeyValuePair<ushort, ushort[]>(0x20, new[] { CTRL }) },
            // New agent tab has no Orca default on Windows: bind Alt+Shift+T to "New agent tab (default agent)" in Orca settings.
            { "newAgent", new KeyValuePair<ushort, ushort[]>(0x54, new[] { ALT, SHIFT }) },
            { "closePane", new KeyValuePair<ushort, ushort[]>(0x57, new[] { CTRL }) },
        };
        bool prevNext = dir == "previous" || dir == "next";
        bool valid = (scope == "shortcut" && shortcuts.ContainsKey(dir)) ||
                     (scope == "app" && dir == "open") ||
                     ((scope == "workspace" || scope == "chat" || scope == "pane" || scope == "wheel") && prevNext);
        if (!valid) return "알 수 없는 탐색 동작입니다.";

        // Scrolls the pane that holds the keyboard caret, not whatever is under the mouse pointer.
        if (scope == "wheel") return Wheel(dir);

        // Dictation, Enter and Escape go to whatever window currently has focus; do not pull Orca to the foreground.
        if (scope == "shortcut" && (dir == "dictation" || dir == "confirm" || dir == "cancel"))
        {
            var d = shortcuts[dir];
            Press(d.Key, d.Value);
            return null;
        }

        IntPtr h = FindOrca();
        if (h == IntPtr.Zero) return "Orca 앱이 실행되어 있어야 합니다.";
        if (!Foreground(h)) return "Orca를 활성화하지 못했습니다. 다른 창이 포커스를 막고 있습니다.";

        if (scope == "shortcut")
        {
            var s = shortcuts[dir];
            Press(s.Key, s.Value);
        }
        else if (scope == "chat")
        {
            Press(dir == "previous" ? (ushort)0xDB : (ushort)0xDD, CTRL, SHIFT);
        }
        else if (scope == "pane")
        {
            // Focus previous/next split pane: Ctrl+[ / Ctrl+]
            Press(dir == "previous" ? (ushort)0xDB : (ushort)0xDD, CTRL);
        }
        else if (scope == "workspace")
        {
            // Orca default: Ctrl+Shift+Up / Ctrl+Shift+Down (previous / next worktree)
            Press(dir == "previous" ? UP : DOWN, CTRL, SHIFT);
        }
        return null;
    }

    static void Reply(string error)
    {
        Console.WriteLine(error == null ? "{\"ok\":true,\"delivered\":true}" : "{\"ok\":false,\"error\":\"" + error.Replace("\"", "'") + "\"}");
        Console.Out.Flush();
    }

    static int Main(string[] args)
    {
        // The plugin parses stdout as UTF-8; the default console code page would garble Korean messages.
        Console.OutputEncoding = new UTF8Encoding(false);
        // Resident mode: one process answers many "scope direction" lines. Process start costs over a second on
        // machines with endpoint scanners, so the plugin starts it once and reuses it.
        if (args.Length == 1 && args[0] == "serve")
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                var parts = line.Trim().Split(' ');
                Reply(parts.Length == 2 ? Handle(parts[0], parts[1]) : "알 수 없는 탐색 동작입니다.");
            }
            return 0;
        }
        if (args.Length != 2) { Reply("알 수 없는 탐색 동작입니다."); return 1; }
        string error = Handle(args[0], args[1]);
        Reply(error);
        return error == null ? 0 : 1;
    }
}
