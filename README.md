k3 is an i3 inspired window manager for kde plasma 6 on Wayland.

This readme will contain project notes and 
be updated as the project progresses with documentation
and a how to use guide. 

The goals of this project:
- i3 like tiling window manager for kde plasma 6 on Wayland
- implemented as a kwin script. 
- Sensible defaults, easy to modify keybindings using kde system settings

## Status

Phase 3 (focus parent/child) is done and running live. In progress: an
AeroSpace-style accordion for tabbed layouts. After that comes phase 4
(multi-monitor). See [PLAN.md](PLAN.md) for the design, the i3 feature
feasibility tables and the milestones.

## How to use

*The full guide is written as features land (phase 5 finishes it).*

What k3 does today:
- **New windows:** each normal window on a desktop is tiled side by side with
  the others, and a new window opens right after the focused one.
- **Floating:** dialogs, modal or fixed-size windows, utility windows, and
  windows that skip the taskbar float, and k3 leaves them alone.
- **Your existing KDE keys keep working.** Moving a window to another desktop
  or screen moves it in the layout. *Keep on all desktops* takes a window out
  of the tiling until you turn it off again. A minimized window leaves the
  layout and comes back next to the focused window when restored.
- **Fullscreen and maximized windows** cover the screen while the others keep
  their places. A restored window returns to its slot.
- **Snap-back:** a tiled window that you quick-tile (Meta+arrow) or drag
  returns to its slot.

### Keybindings

Every k3 action is listed in **System Settings → Keyboard → Shortcuts →
KWin**; search for "k3" to rebind any of them. A rebind takes effect
immediately, and k3's code defaults never override it. Afterwards, run
`make check-keys` to catch a key that's also bound elsewhere.

| Action | Default | Notes |
|---|---|---|
| Focus left / down / up / right | Alt+H / J / K / L | Entering a container lands on its last-focused window. In a tabbed container, left/right switch tabs. |
| Move left / down / up / right | Alt+Shift+H / J / K / L | Swaps with a neighbor, enters a neighboring container, or steps out of the current one |
| Shrink width / grow height / shrink height / grow width | Ctrl+Alt+H / J / K / L | `resizeStep` % of the parent per press |
| Split horizontal / vertical | Alt+Shift+B / Alt+Shift+V | The next window opens beside / below the focused one |
| Toggle split direction | Alt+Shift+T | Flips the focused window's container |
| Toggle tabbed | Alt+Shift+W | Tabbed has no tab bar: the focused tab covers the others |
| Toggle floating | Alt+Shift+Space | A floated window stays above the tiled ones (`floatAbove`) |
| Focus parent / child | Alt+Shift+U / Alt+Shift+D | Selects the container around the focused window, one level up per press. Move, split, layout, resize and focus then act on the whole container, which is shown with KWin's translucent outline. Any focus change or mouse movement ends the selection. |
| Focus tiled ↔ floating | *(none)* | |
| Retile | *(none)* | Recovery: re-checks every window and re-applies the layouts |

The rest of i3's keys are KDE's own actions, which k3 follows: switch to or
move to desktop N, fullscreen, close, keep on all desktops, and switch to or
move to the next screen.

**Before enabling k3, unbind the KDE actions that use the same keys.** KDE
doesn't refuse a duplicate: both actions get the key, and which one fires is
undefined. With your current setup that means *Walk Through Windows* (all
four Alt+H/J/K/L variants) and *Quick Tile Window* Left/Bottom/Top/Right
(Alt+Shift+H/J/K/L). After loading k3, run:

```sh
make check-keys   # lists every key a k3 shortcut shares with another action
```

### Settings

Until phase 5 adds a dialog, set these with `kwriteconfig6`. The class lists
are comma-separated and matched against a window's class or name:

```sh
kwriteconfig6 --file kwinrc --group Script-k3 --key gapsInner 8      # px between windows (default 4)
kwriteconfig6 --file kwinrc --group Script-k3 --key gapsOuter 8      # px at screen edges (default 4)
kwriteconfig6 --file kwinrc --group Script-k3 --key resizeStep 10    # % of the parent per resize press (default 5)
kwriteconfig6 --file kwinrc --group Script-k3 --key floatAbove false # don't keep floated windows above (default true)
kwriteconfig6 --file kwinrc --group Script-k3 --key floatClasses "org.kde.spectacle,steam"
kwriteconfig6 --file kwinrc --group Script-k3 --key ignoreClasses "plasmashell,krunner"
make reload
```

## Development

```sh
make test                  # unit tests (Qt 6 qmltestrunner, offscreen)
make install enable        # install the package into ~/.local/share/kwin/scripts and turn it on
make reload                # after editing src/: rebuild and restart k3 in the live session
make logs                  # follow k3's log lines in the journal (errors show as "[k3] error: …")
make check-keys            # keys a k3 shortcut shares with another action
make disable / uninstall
```

Safe testing in a nested KWin (2 virtual screens, isolated config):

```sh
make nested HEADLESS=1 &   # or without HEADLESS to get a visible window
make nested-load           # load the current build into it
make nested-run CMD=konsole
make nested-key K="Window to Desktop 2"   # fire any KWin shortcut via D-Bus
grep '\[k3\]' .dev/nested.log
make nested-stop
```

`src/*.js` are concatenated (order set by `SRC` in the Makefile) into
`package/contents/code/main.js`. That file is generated, so never edit it.

## Project notes

### Decisions log

- **2026-11-02: initial design** (details in PLAN.md §2)
  - k3 keeps its own i3-style container tree and sets window geometry
    directly. It doesn't use KWin's Meta+T tiles.
  - Plain JS split across `src/*.js`, concatenated by `make` into one KWin
    script.
  - i3 default placement for new windows; no autotiling.
  - Reuse KDE's built-in actions (desktop switching, move to desktop,
    fullscreen, close, move to screen, keep on all desktops). k3 only adds
    what KDE lacks.
  - Alt is the mod key: Alt+h/j/k/l focuses, Alt+Shift+h/j/k/l moves.
  - Keep KDE titlebars. Tabbed is a monocle layout with no tab bar, and
    stacked is dropped.
  - v1 scope: core features, plus multi-monitor and focus parent/child.
    Scratchpad and mouse sync are in the backlog.

### Environment (dev machine)

- Plasma / KWin 6.8.2, Qt 6.12, Wayland, 1 screen. KWin runs as the
  `plasma-kwin_wayland` user service.
- 11 fixed, named virtual desktops (scratch1, scratch2, scratch, reading,
  messages, notes, video calls, code, emacs, all, photos), switched with
  Alt+letter and moved to with Alt+Shift+letter.
- `kde_plasma_config/` holds backups of the KDE config. `backup_kde` and
  `restore_kde` copy them to and from `~/.config`. `pre_krohnkite/` and
  `post_krohnkite/` are snapshots from an earlier Krohnkite experiment.
- Tools available: `kpackagetool6`, `kwriteconfig6`/`kreadconfig6`, `qdbus6`,
  `qmltestrunner`, `make`. Node is **not** installed.

### KWin scripting notes

- Package layout to copy: `/usr/share/kwin/scripts/videowall/`
  (`metadata.json`, `contents/code/main.js`, `contents/config/main.xml`,
  `contents/ui/config.ui`). A config dialog needs
  `"X-KDE-ConfigModule": "kwin/effects/configs/kcm_kwin4_genericscripted"`.
- `registerShortcut(name, text, keys, fn)` puts the action in System Settings
  under the **KWin** component. The `name` is the persistent id in
  `kglobalshortcutsrc`, so never rename one after release.
- Shortcuts can be fired over D-Bus:
  `qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut <name>`.
- The Plasma OSD can be shown over D-Bus:
  `org.kde.plasmashell /org/kde/osdService org.kde.osdService.showText(icon, text)`.
- Per-screen desktop switching is opt-in in Plasma 6.7+ ("Switch desktops
  independently for each screen", Wayland only). The set of desktops is still
  shared across screens. Script API: `workspace.currentDesktopForScreen(output)`
  and `setCurrentDesktopForScreen(desktop, output)`.
- Nested KWin for testing: `kwin_wayland --width W --height H --output-count N`
  inside `dbus-run-session`.
- No file I/O or `writeConfig` in the JS API, so k3 can't persist a layout
  across a script reload.

### Phase 0 findings (2026-11-02)

Shortcuts:
- **A taken default key gets bound twice.** `registerShortcut` with a default
  key another KWin action already owns (tested with Alt+F4) binds both actions
  to it in kglobalaccel. Which one fires is undefined. So conflicting KDE
  bindings must be removed *before* enabling k3.
- **Script-registered shortcuts don't store a default.** They're written to
  `kglobalshortcutsrc` as `k3-x=<key>,none,<text>`.
- **Querying who owns a key:** `busctl --user call org.kde.kglobalaccel
  /kglobalaccel org.kde.KGlobalAccel getGlobalShortcutsByKey i <qt-key-int>`
  (Alt = 0x08000000, Shift = 0x02000000, F4 = 0x01000033).

Script lifecycle:
- **Loading:** `make install enable` loads the script immediately.
- **Disabling:** `make disable` (`reconfigure`) really unloads it.
- **Reloading:** `Scripting.unloadScript k3` + `Scripting.start` reloads the
  new build, with exactly one instance running.
- **Logs:** in the live session, `print()` reaches the journal with
  `QT_CATEGORY=default` and the message text unchanged (`[k3] …`). In the
  nested session it goes to stderr as `js: [k3] …`.

Testing:
- **Qt version:** `/usr/bin/qmltestrunner` is **Qt 5**; use
  `/usr/lib/qt6/bin/qmltestrunner`.
- **Output:** results only print with `QT_FORCE_STDERR_LOGGING=1`; otherwise
  they go to the journal.
- **Imports:** all top-level JS forms are reachable through a QML `import … as X`.

Nested session:
- **Headless works:** `kwin_wayland --virtual --socket k3-nested --output-count 2`
  runs with no window, and its outputs are named `Virtual-0` / `Virtual-1`.
- **Screenshots:** `spectacle -b -n -f -o file.png` works inside it.
- **Stopping it:** `pkill -f` patterns must be anchored (`^kwin_wayland --socket k3-nested`).
  An unanchored pattern also matches the shell that runs it.

Window API:
- **Available:** `workspace.windowList()`, `workspace.currentDesktopForScreen()`,
  `workspace.slotSwitchTo{Left,Right,Above,Below}Screen()`,
  `slotWindowTo{…}Screen()`, `windowAt`, `screenAt`, and the window signals
  `windowClassChanged`, `interactiveMoveResizeFinished`, `maximizedChanged`,
  `fullScreenChanged`, `outputChanged`, `desktopsChanged`, `minimizedChanged`,
  `closed`, `tileChanged`.
- **Event order:** `windowActivated` fires *before* `windowAdded` for a new
  window.
- **Class at add time:** `resourceClass` is already set at `windowAdded` for
  Wayland apps (`org.kde.konsole`, `com.mitchellh.ghostty`), but `minSize` can
  change afterwards.
- **Geometry:** setting `frameGeometry` is asynchronous, and reading it back
  right away returns the old rect. Coordinates are fractional.
- **Outline:** `showOutline()` creates a real window (it fires `windowAdded`,
  with an empty class, `normalWindow=true`, on all desktops). It stays until
  `hideOutline()`. In the nested session it's an opaque gray fill.

Still open:
- What the outline looks like in the live, Plasma-themed session (phase 3).
- Whether the host's shortcuts leak into a *windowed* nested session.

Confirmed by hand: `k3-hello`, bound to a key in System Settings, logged
`[k3] hello …` when pressed in the live session.

### Phase 1 findings (2026-11-02)

Script loading:
- **Disabled plugins get unloaded.** `Scripting.start()` unloads any loaded
  script whose name matches an *installed* plugin that the config doesn't
  enable. Loading the build as `k3` into the nested session (where it's
  disabled) failed silently for this reason. `make nested-load` now uses the
  name `k3-nested`.
- **Runtime errors aren't logged.** A script that throws while loading just
  disappears. Syntax errors do show up as `kwin_scripting: file:line: error`.
  To surface a runtime error, wrap a scratch copy in `try { … } catch (e) {
  print(e.stack) }`.

KWin tiling:
- **`window.tile` is deprecated for writing.** Assigning it logs a warning.
  Release a window with `w.tile.unmanage(w)` instead. Tile objects also have
  `manage`, `resizeByPixels`, `windows` and `tiles`.
- **Quick tiling** sets `w.tile`. Maximized means `w.maximizeMode === 3`.

Window types:
- **zenity's info dialog** reports `normal=true` but `modal=true` and
  `resizeable=false`, so k3 floats it.
- **Fullscreen windows** report `resizeable=false`, so k3 only trusts
  `resizeable` when a window isn't fullscreen.

Focus and geometry:
- **Focus after close:** when a window closes, KWin activates the next one
  (most recently used) *before* `windowRemoved` fires.
- **Hidden windows resize late.** A window on a hidden desktop moves right
  away, but a Wayland client applies the new size only once its desktop is
  shown.

### Phase 2 findings (2026-11-02)

- **Callback exceptions are silent too.** An exception thrown inside a
  `registerShortcut` callback or a signal handler disappears without a log
  line. k3 wraps every handler in `guarded()`, which logs `[k3] error: …`
  plus the stack.
- **Apps reopen at their last size.** konsole comes back at 1592×892 after
  being closed while tiled full-width. So "the geometry before k3 tiled it"
  can be near full-screen. Floating falls back to two thirds of the screen,
  centered, when the saved geometry is at least 90% of the screen both ways.
- **Activation works for keyboard focus.** `workspace.activeWindow = w`
  focuses and raises the window. Raising the focused tab is enough to make
  monocle tabbed work.
- **Duplicate shortcuts.** KDE stores script shortcuts in the canonical
  modifier order (`Ctrl+Alt+H`, not `Alt+Ctrl+H`). `make check-keys` parses
  `kglobalshortcutsrc`: keys are joined by a literal `\t`, and an escaped
  comma is `\\,`.

### Phase 3 findings (2026-11-02)

- **The outline is KWin's quick-tile preview.**
  `/usr/share/kwin/outline/plasma/outline.qml` draws Plasma's
  `widgets/translucentbackground` frame. It animates when `showOutline` is
  called again with a new rect, so it can follow a container as it moves.
- **It's translucent.** In the nested session it washes over the selected
  container rather than hiding it; the opaque gray seen in phase 0 didn't
  recur. There's only one outline in KWin, so k3 keeps a single global
  selection.
- **The outline swallows clicks** (checked live). It's an input-grabbing
  window that a script can't make click-through. k3 therefore ends the
  selection on `workspace.cursorPosChanged`. KWin doesn't emit that signal
  when windows move under a still pointer, so keyboard use keeps the
  selection.
- **KWin scripts have `QTimer`** (`new QTimer()`, with `interval`,
  `singleShot`, `timeout`, `start()`), but no `setTimeout`. `window.opacity`
  is writable.


### References

- KWin scripting API: https://develop.kde.org/docs/plasma/kwin/api/
- Expanded unofficial API docs: https://zeroxoneafour.github.io/kwin-scripting-docs/workspace.html
- i3 user guide: https://i3wm.org/docs/userguide.html
