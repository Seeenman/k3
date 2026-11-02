k3 is an i3 inspired window manager for kde plasma 6 on Wayland.

This readme will contain project notes and 
be updated as the project progresses with documentation
and a how to use guide. 

The goals of this project:
- i3 like tiling window manager for kde plasma 6 on Wayland
- implemented as a kwin script. 
- Sensible defaults, easy to modify keybindings using kde system settings

## Status

Phase 0 (scaffolding and spikes) is done. k3 installs, loads, and registers a
`k3-hello` test shortcut, but it doesn't tile anything yet. See
[PLAN.md](PLAN.md) for the design, the i3 feature feasibility tables, the
proposed keybindings and the milestones.

## How to use

*To be written as features land (phase 5 finishes this).*

## Development

```sh
make test                  # unit tests (Qt 6 qmltestrunner, offscreen)
make install enable        # install the package into ~/.local/share/kwin/scripts and turn it on
make reload                # after editing src/: rebuild and restart k3 in the live session
make logs                  # follow k3's log lines in the journal
make disable / uninstall
```

Safe testing in a nested KWin (2 virtual screens, isolated config):

```sh
make nested HEADLESS=1 &   # or without HEADLESS to get a visible window
make nested-load           # load the current build into it
make nested-run CMD=konsole
make nested-key K=k3-hello # fire a shortcut via D-Bus
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


### References

- KWin scripting API: https://develop.kde.org/docs/plasma/kwin/api/
- Expanded unofficial API docs: https://zeroxoneafour.github.io/kwin-scripting-docs/workspace.html
- i3 user guide: https://i3wm.org/docs/userguide.html
