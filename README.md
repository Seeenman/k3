k3 is an [i3](https://i3wm.org/) and [aerospace](https://github.com/nikitabobko/AeroSpace) inspired window manager for kde plasma 6 on Wayland.

This readme will contain project notes and 
be updated as the project progresses with documentation
and a how to use guide. 

The goals of this project:
- i3 like tiling window manager for kde plasma 6 on Wayland
- implemented as a kwin script. 
- Sensible defaults, easy to modify keybindings using kde system settings

## Status

Phases 1–4 are implemented: tiling, the i3 commands, focus parent/child and
multi-monitor support, plus an AeroSpace-style accordion for tabbed layouts.
Everything up to the accordion is in daily use. Multi-monitor support is
verified on real monitors: a monitor above a laptop screen scaled to 120%,
with panels. That check found and fixed three bugs that virtual screens can't
show. Since then:
- a binary tree layout has become the default;
- a selected container can move to another screen;
- unplugging and replugging a monitor keeps its layouts.

Next is phase 5, a settings dialog in System Settings. See
[PLAN.md](PLAN.md) for the design and the milestones.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [First-time setup](#first-time-setup)
- [Using k3](#using-k3)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)
- [Differences from i3](#differences-from-i3)
- [Development](#development)
- [Project notes](#project-notes)

## Requirements

- KDE Plasma 6 on **Wayland**. k3 is developed on Plasma/KWin 6.8.2;
  X11 sessions are untested.
- To install from source: `make`, `kpackagetool6`, `kwriteconfig6` and
  `qdbus6`. On Arch Linux these come from the `make`, `kpackage`, `kconfig`
  and `qt6-tools` packages.
- Optional:
  - Plasma 6.7 or newer, for switching desktops independently on each
    screen;
  - `qt6-declarative`, to run the unit tests.

## Installation

```sh
git clone <repository-url> k3     # or copy this directory
cd k3
make install    # build the script and install it to ~/.local/share/kwin/scripts/k3
make enable     # turn it on and load it into the running KWin
```

- **Enabling from System Settings instead:** go to Window Management → KWin
  Scripts, tick **k3** and click Apply. This is the same as `make enable`.
- **Checking it's running:** this command prints `true`:
  ```sh
  qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded k3
  ```
- **What happens when it loads:** k3 tiles the existing windows on every
  screen and desktop, each as a [binary tree](#binary-tree-layout). If you
  turn it off again (`make disable`), windows stay where k3 put them.
- **Updating:** after pulling changes, run `make reload`. It reinstalls and
  restarts k3, and says so if k3 fails to load.

## First-time setup

### 1. Clear key conflicts

k3 uses **Alt** as its modifier (see [Keybindings](#keybindings)). KDE
doesn't refuse a duplicate binding: if another action already has one of
k3's keys, both actions get it, and which one fires is undefined. k3's
defaults don't collide with KWin's own default shortcuts, but your own
shortcuts might. With k3 loaded, run:

```sh
make check-keys
```

It lists every key that a k3 action shares with another action, along with
both owners. Unbind one side in **System Settings → Keyboard → Shortcuts**
(the search box finds actions by name), then run it again until it reports
no conflicts.

Global shortcuts always win over applications, so apps no longer receive
k3's keys. For example, Emacs loses M-/ and M-, to Alt+/ and Alt+,, and Alt+H
no longer opens a Help menu. Rebind any k3 action that gets in your way (see
[Changing keybindings](#changing-keybindings)).

### 2. Bind KDE's own actions for the rest of i3

k3 doesn't duplicate actions KDE already has. Bind them yourself, and k3
follows whatever they do to a window. These i3-style keys are only
suggestions; check them with `make check-keys` afterwards.

| i3 | KDE action (Keyboard → Shortcuts) | Suggested key |
|---|---|---|
| `workspace N` | Switch to Desktop N | Alt+1 … Alt+9 |
| `move container to workspace N` | Window to Desktop N | Alt+Shift+1 … Alt+Shift+9 |
| `fullscreen toggle` | Make Window Fullscreen | Alt+F |
| `kill` | Close Window | Alt+Shift+Q |
| `sticky toggle` | Keep Window on All Desktops | — |
| `focus output next` | Switch to Next Screen | — |
| `move container to output next` | Window to Next Screen | — |
| `exec terminal` | Add New → Application, then pick your terminal | Alt+Return |
| dmenu | KRunner | Alt+Space (KDE's default) |

KDE records Alt+Shift+1 as Alt+!, Alt+Shift+2 as Alt+@ and so on; that's
expected. Create as many desktops as you want workspaces in **System Settings
→ Window Management → Virtual Desktops**.

### 3. Optional KDE settings

- **Switching desktops independently on each screen** (Plasma 6.7+) is
  closer to i3's workspace-per-monitor. It's in Window Management → Virtual
  Desktops.
- **Focus follows mouse:** Window Management → Window Behavior → Focus. k3
  keeps track of focus however it changes.
- **Gaps, sliver width, floating rules:** see [Settings](#settings).

## Using k3

### How layouts work

- **Every screen and desktop has its own layout**, the equivalent of an i3
  workspace.
- **A layout is a tree.** Containers arrange their children as a **row**
  (split horizontal), a **column** (split vertical), or **tabs**. Windows
  are the leaves.
- **New windows go next to the focused window.** In a
  [binary tree](#binary-tree-layout), the default, a new window takes half
  of the focused one. In a split layout (i3's), it goes after the focused
  window in its container. Either way, to choose where the *next* window
  goes, split first.
- **Containers remember their last-focused child.** Moving focus into a
  container lands there.
- **Containers tidy themselves up.** An empty container disappears. A
  container left with a single window dissolves into its parent, unless you
  just split it and it's waiting for its second window.

### Keybindings

Every k3 action is in **System Settings → Keyboard → Shortcuts → KWin**, named
"k3: …".

| Action | Default | What it does |
|---|---|---|
| k3: Focus Left / Down / Up / Right | Alt+H / J / K / L | Focus the neighboring window. Entering a container lands on its last-focused window. In tabs, the keys along the tabs' direction switch tabs. At the edge of a screen, focus goes on to the next screen, even an empty one. |
| k3: Move Left / Down / Up / Right | Alt+Shift+H / J / K / L | Swap with the neighboring window, move into the neighboring container, or step out of the current one. In tabs, reorder them; past the first or last tab, the tab pops out. At the edge of a screen, the window moves to the next screen. |
| k3: Grow Width / Shrink Width | Ctrl+Alt+L / Ctrl+Alt+H | Resize by `resizeStep` (default 5%) of the container, trading space with the neighbor. Nothing gets smaller than 5%. |
| k3: Grow Height / Shrink Height | Ctrl+Alt+J / Ctrl+Alt+K | The same, vertically |
| k3: Split Horizontal / Split Vertical | Alt+Shift+B / Alt+Shift+V | The next window opens beside / below the focused one |
| k3: Toggle Split Direction | Alt+/ | Flip the container between row and column; tabs turn back into the split they came from |
| k3: Toggle Tabbed | Alt+, | Turn the container into tabs (an accordion), and back |
| k3: Toggle Binary Tree | Alt+Shift+T | Rebuild this screen and desktop's layout as a binary tree, or as one row |
| k3: Toggle Floating | Alt+Shift+Space | Float a tiled window, or tile a floating one |
| k3: Focus Parent / Focus Child | Alt+Shift+U / Alt+Shift+D | Select the container around the focused window, one level up per press / step back down |
| k3: Focus Tiled/Floating | *(none)* | Jump between the tiled and the floating windows of this screen and desktop |
| k3: Retile | *(none)* | Recovery: re-check every window and re-apply the visible layouts |

#### Changing keybindings

Rebind any action in System Settings → Keyboard → Shortcuts (search "k3").
A change takes effect immediately. Your bindings survive k3 updates: if a
new k3 version changes a default, the binding you already have is kept.
Run `make check-keys` afterwards to catch duplicates.

### Example

Starting from one window, A:

1. Open B: `[A | B]`.
2. On B, press Alt+Shift+V, then open C. C opens below B: `[A | [B / C]]`.
   (In a binary tree it would anyway, since B is taller than wide.)
3. Press Alt+Shift+U to select `[B / C]`, then Alt+Shift+H to move it
   left: `[[B / C] | A]`.
4. Press Alt+Shift+D to step back down to the window, then Alt+, to turn B
   and C into tabs. Alt+J/K now switch between B and C, and Alt+L goes to A.

### Tabbed layout (accordion)

This follows [AeroSpace](https://github.com/nikitabobko/AeroSpace)'s
accordion rather than i3's tabbed layout.

- **One tab is visible.** 30px slivers of the others peek out beside it
  (`tabPadding`). There's no tab bar.
- **The direction follows the position.** Tabs that fill the screen run
  left/right (Alt+H/L switch them). Tabs next to another window run the other
  way: in `[A | tabs]`, Alt+H/L go between A and the tabs, and Alt+J/K step
  through the tabs. The slivers point the same way.
- **Pop out:** moving along the tabs' direction reorders them. Past the
  first or last tab, the tab pops out beside the others. From 3+ tabs the
  remaining ones switch direction; from 2, you get a plain split.
- **Merge back:** moving the popped-out window back toward the tabs puts it
  in again. Moving a tab across the tabs' direction moves it out like any
  other move.
- **Back to a split:** Alt+/ or Alt+, turns the tabs back into the split
  they came from.

### Binary tree layout

This is like bspwm, or Hyprland's dwindle layout, and it's the default
(`defaultLayout`).

- **A new window halves the focused one,** along its longer side: beside it
  if the focused window is wider than tall, below it otherwise. Closing a
  window gives its space back to its neighbor.
- **It's the same tree as always,** made of two-way splits. Focus, move,
  resize, focus parent and the split keys all work as usual: Alt+/ flips a
  pair, and Alt+, turns a pair into tabs.
- **When the binary tree doesn't decide:**
  - after Alt+Shift+B or Alt+Shift+V, the next window goes beside or below,
    whatever the shape;
  - a window opened from a tab becomes another tab.
- **Switching (Alt+Shift+T)** rebuilds this screen and desktop's windows in
  their current order: as a binary tree (each window halving the one before
  it), or as a single row with i3's placement for new windows. Containers
  and tabs are dropped.
- **The choice lasts while the screen and desktop have windows.** Once the
  last one closes, the next one starts over in the default layout.

### Floating windows

- **Floated automatically:**
  - dialogs and utility windows;
  - transient and modal windows;
  - windows that can't be resized;
  - windows that skip the taskbar;
  - classes listed in `floatClasses`.

  k3 never moves a floating window.
- **Ignored completely:** panels, popups, notifications, on-screen displays,
  and classes listed in `ignoreClasses`.
- **Toggle Floating on a tiled window:** it floats at the size and place it
  had before k3 tiled it. If that nearly fills the screen (apps often reopen
  at their last tiled size), it's centered at two thirds of the screen
  instead. It also stays above the tiled windows (`floatAbove`).
- **Toggle Floating on a floating window:** it's tiled after the focused
  window. This works on automatically floated windows too.
- **Temporarily untiled windows:** a minimized window, or one kept on all
  desktops, leaves the layout until that ends.

### Selecting containers (focus parent / child)

- **Selecting:** Alt+Shift+U selects the container around the focused
  window. Each further press goes one level up, stopping below the whole
  screen. KWin's translucent outline marks the selection.
- **What acts on the selection:** move, split, Toggle Split Direction,
  Toggle Tabbed, resize and focus all act on the whole container, so
  Alt+Shift+H swaps it with its neighbor as a unit. Toggle Floating still
  acts on the window.
- **Moving it to another screen:** at the edge of a screen, move takes the
  container, layout and all, to the next screen, next to the focused window
  there. On an empty screen it becomes that screen's whole layout and stays
  selected, so it can move on.
- **Deselecting:** Alt+Shift+D steps back down; reaching the window ends the
  selection. Any focus change, desktop switch or **mouse movement** also ends
  it. KWin's outline would otherwise block clicks.

### Fullscreen, maximize and minimize

- **Fullscreen and maximize** work as usual: the window covers the screen
  while the others keep their places, and on restore it returns to its slot.
- **A window that opens maximized** is un-maximized and tiled.
- **Minimized windows** leave the layout. When restored, they come back after
  the focused window.

### Desktops and screens

- **Desktops:** use KDE's desktop actions (see
  [setup](#2-bind-kdes-own-actions-for-the-rest-of-i3)). A window moved to
  another desktop joins that desktop's layout after its focused window.
- **Several monitors:**
  - **Crossing screens:** focus and move continue onto the next screen at
    the edge of a screen's layout, including onto an empty screen. A
    selected container moves as a unit.
  - **The keys follow the focused window,** not the mouse pointer: Alt+H/J/K/L
    walk from the screen the focused window is on, wherever the pointer
    rests.
  - **Which screen is next:** screens count as neighbors when they're side
    by side or stacked, even offset, but not diagonal.
  - **KDE's screen actions:** *Window to Next Screen* works as well.
- **Panels:** layouts stay clear of panels on each screen. When a panel
  appears, hides or changes size, k3 re-tiles within a second.
- **Unplugging a monitor:** each of its layouts (one per desktop) moves to
  a remaining screen as a unit, next to the focused window there. Order,
  containers and tabs are kept. On replug, k3 puts them back where they
  were.
- **Per-screen desktops** (Plasma 6.7+): a window moved to another screen
  lands on the desktop that screen is showing.

### Mouse

- **Tiled windows snap back:** a tiled window you drag, or quick-tile
  (Meta+arrow, dragging to a screen edge), returns to its slot. Use the move
  keys to rearrange.
- **Clicking a window focuses it** as usual, and clicking a tab's sliver
  switches to that tab.
- **Floating windows** can be dragged and resized freely.

## Settings

k3's settings live in the `[Script-k3]` group of `kwinrc`. Until phase 5 adds
a settings dialog, set them with `kwriteconfig6` and then run `make reload`.

| Key | Default | Meaning |
|---|---|---|
| `defaultLayout` | `btree` | how each screen and desktop's layout starts: `btree` (a new window halves the focused one) or `split` (i3: a row, new windows after the focused one) |
| `gapsInner` | `10` | px between tiled windows |
| `gapsOuter` | `10` | px between tiled windows and the screen edge |
| `tabPadding` | `30` | px of each hidden tab left showing beside the visible one (`0` = a plain stack) |
| `resizeStep` | `5` | % of the container per resize press |
| `floatAbove` | `true` | windows you float stay above the tiled ones |
| `floatClasses` | `org.kde.spectacle,org.kde.polkit-kde-authentication-agent-1,pinentry-qt` | window classes that always float |
| `ignoreClasses` | `plasmashell,krunner,ksmserver-logout-greeter,xwaylandvideobridge` | window classes k3 never touches |

```sh
kwriteconfig6 --file kwinrc --group Script-k3 --key gapsInner 8
kwriteconfig6 --file kwinrc --group Script-k3 --key floatClasses \
    "org.kde.spectacle,org.kde.polkit-kde-authentication-agent-1,pinentry-qt,steam"
make reload
```

- **Class lists** are comma-separated and matched case-insensitively
  against a window's class or name. Setting one **replaces** its default
  list, so include the defaults you want to keep.
- **Finding a window's class:** run `make logs`, then open the window. k3
  logs `[k3] tile <class>` or `[k3] float <class>`.
- **Back to a default:** `kwriteconfig6 --file kwinrc --group Script-k3 --key
  gapsInner --delete`, then `make reload`.

## Troubleshooting

- **Nothing tiles:** check that `qdbus6 org.kde.KWin /Scripting
  org.kde.kwin.Scripting.isScriptLoaded k3` prints `true`. If it doesn't,
  run `make reload`; it reports when k3 fails to load.
- **Errors:** `make logs` follows k3's log. A `[k3] error: …` line (with a
  stack trace) is a bug; please report it.
- **A key does nothing, or something else happens:** run
  `make check-keys`.
- **A layout looks wrong:** bind and press *k3: Retile*. Reloading k3, or
  restarting KWin or the session, rebuilds every layout from scratch in the
  default layout (a binary tree per screen and desktop). k3 can't save
  layouts.
- **A window tiles but should float, or the other way round:** toggle it
  with Alt+Shift+Space. To make it permanent, find its class with
  `make logs` and add it to `floatClasses`.
- **Clicks don't reach a window:** if a container is selected (the outline is
  showing), move the mouse first; that ends the selection.
- **Turning k3 off:** run `make disable`, or untick it in KWin Scripts.
  Windows stay where they are.

## Uninstalling

```sh
make uninstall    # disable k3 and remove the installed script
```

KDE keeps k3's actions in its shortcut list. To remove them too:

```sh
for id in $(grep -o '^k3-[a-z-]*' ~/.config/kglobalshortcutsrc); do
    busctl --user call org.kde.kglobalaccel /kglobalaccel \
        org.kde.KGlobalAccel unregister ss kwin "$id"
done
```

Any settings you made stay in `kwinrc`. Remove them with
`kwriteconfig6 --file kwinrc --group Script-k3 --key <key> --delete`.

## Differences from i3

- **Window decorations:** k3 draws no tab bars or colored borders. KDE's
  titlebars stay, tabs are an accordion, and the selected container is shown
  with KWin's outline.
- **No binding modes** such as i3's resize mode. Resizing has its own keys.
- **No config file, `i3-msg` or IPC.** Keys live in System Settings and
  settings in `kwinrc`.
- **Workspaces are KDE virtual desktops.** k3 doesn't create or remove them,
  and KWin can't move a desktop to another monitor.
- **Tab direction follows position** (as in AeroSpace) instead of i3's
  separate tabbed and stacked layouts.
- **New windows halve the focused one by default** (a binary tree, as in
  bspwm). Alt+Shift+T, or `defaultLayout=split`, gives i3's placement.
- **Not implemented (yet):** scratchpad, marks, `workspace back_and_forth`,
  mouse warping, and saving or restoring layouts. See the backlog in
  [PLAN.md](PLAN.md).

## Development

```sh
make test          # unit tests for the layout tree (Qt 6 qmltestrunner, offscreen)
make build         # concatenate src/*.js into package/contents/code/main.js
make reload        # install the build and (re)start k3 in the live session
make logs          # follow k3's log lines in the journal
make check-keys    # keys a k3 shortcut shares with another action
make disable / uninstall
```

| Path | Contents |
|---|---|
| `src/config.js` | settings and their defaults |
| `src/tree.js` | the layout tree and layout math. It doesn't call KWin, so `test/tst_tree.qml` unit-tests it directly. |
| `src/kwin.js` | which windows tile, window events, applying geometry |
| `src/commands.js` | the commands behind the shortcuts |
| `src/main.js` | the shortcut table and startup |
| `package/` | the KWin script package. `contents/code/main.js` is generated by `make build`; never edit it. |
| `tools/check-keys.awk` | the duplicate-key check behind `make check-keys` |

`src/*.js` are concatenated in the order `SRC` in the Makefile sets.

**Safe testing in a nested KWin.** It has 2 virtual screens, its own D-Bus
session, and a config that starts empty every time:

```sh
make nested HEADLESS=1 &   # or without HEADLESS to get a visible window
make nested-load           # load the current build into it
make nested-run CMD=konsole
make nested-key K="Window to Desktop 2"   # fire any KWin shortcut via D-Bus
grep '\[k3\]' .dev/nested.log
make nested-stop
```

Inside it, `spectacle -b -n -f -o shot.png` takes screenshots, and
`kscreen-doctor output.Virtual-1.disable` / `.enable` simulates unplugging a
screen.

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
- **2026-11-02: selection indicator.**
  - Focus parent shows the selected container with KWin's outline.
  - The outline swallows clicks, so mouse movement ends the selection. This
    was chosen over flashing the outline or dimming the other windows.
- **2026-11-02: tabbed becomes an AeroSpace-style accordion.**
  - Slivers of the hidden tabs show beside the visible one.
  - The tabs' direction follows their position (across the parent's
    direction), so it covers what i3's "stacked" was for.
  - Moving past the first or last tab pops it out; moving it back merges it.
  - This deliberately departs from i3's tabbed layout.
- **2026-11-02: default keys Alt+, (Toggle Tabbed) and Alt+/ (Toggle Split
  Direction)**, after AeroSpace's `alt-comma` / `alt-slash`. They were
  Alt+Shift+W and Alt+Shift+T.
- **2026-11-02: phase 4 built and tested on virtual screens** ahead of real
  two-monitor hardware.
- **2026-11-02: phase 4 checked on real monitors.**
  - Focus keys follow the focused window's screen, not KWin's active screen
    (which follows the pointer).
  - k3 checks the screens' usable areas once a second, because KWin has no
    signal for it.
- **2026-11-02: moving between screens.**
  - A selected container may move to another screen, as in i3.
  - On unplug, a screen's layouts keep their order (and their containers),
    and they're put back on replug.
- **2026-11-02: binary tree layout, the new default.** This revises "no
  autotiling" from the initial design.
  - A new window halves the focused window along its longer side (as in
    bspwm and Hyprland), rather than a spiral off the newest window.
  - *Toggle Binary Tree* (Alt+Shift+T) rebuilds a screen and desktop's
    layout both ways, rather than only changing where new windows go.
  - `defaultLayout` sets the starting layout.

### Environment (dev machine)

- Plasma / KWin 6.8.2, Qt 6.12, Wayland. KWin runs as the
  `plasma-kwin_wayland` user service.
- 2 screens, one above the other:
  - HDMI-A-2: a 1920×1080 monitor at 0,0, scale 1.
  - eDP-1: the laptop screen, 1920×1080 at scale 1.2 (1600×900 logical), at
    145,1080, so it's offset 145px to the right.
  - Each has a 30px floating panel at the top.
- 11 fixed, named virtual desktops (scratch1, scratch2, scratch, reading,
  messages, notes, video calls, code, emacs, all, photos), switched with
  Alt+letter and moved to with Alt+Shift+letter.
- `kde_plasma_config/` holds backups of the KDE config. It's kept locally
  and git-ignored. `backup_kde` and `restore_kde` copy the files to and from
  `~/.config`.
- Tools: `kpackagetool6`, `kwriteconfig6`/`kreadconfig6`, `qdbus6`,
  `busctl`, `kscreen-doctor`, `make`, and Qt 6's
  `/usr/lib/qt6/bin/qmltestrunner`. Node is **not** installed.

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

Open questions at the time:
- What the outline looks like in the live, Plasma-themed session. *Answered
  in phase 3: translucent, but it swallows clicks.*
- Whether the host's shortcuts leak into a *windowed* nested session. *Still
  untested.*

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

### Accordion findings (2026-11-02)

- **The nested KWin is on D-Bus only after its Wayland socket appears.**
  Scripts that wait for the socket and then call D-Bus race it, so
  `make nested-load` now waits until `org.kde.KWin` answers (up to 10s).
- **Retiling on every activation is cheap.** k3 only sets geometry that
  changed, and focus switches outside tabs cause zero geometry changes.
- **New default keys don't reach existing installs.** A script shortcut is
  stored as `k3-x=<key>,none,…`, with no default recorded, so the stored key
  always wins over a changed default in the code. To pick up a new default,
  rebind it in System Settings, or `unregister` the id over D-Bus and reload.
- **Make expands `$(shell …)` before a recipe runs.** A recipe that waits for
  a file another process rewrites has to read it in the shell (`$$(cat …)`).
  Otherwise it keeps polling the old value.

### Phase 4 findings (2026-11-02)

Geometry:
- **A geometry read can match while an older request is still pending.** In
  one step a window moved screen (k3 asked for slot A) and then desktop (k3
  asked for slot B). It still read as being at B, its original spot, so k3
  skipped B, and then A landed. k3 now also remembers what it last
  requested (`lastRect`) and only skips a window that's in place *and*
  wasn't asked to go elsewhere. Idle churn is still zero.

Screens:
- **Focus lingers on a screen you've left** in a bare KWin. When KWin
  switches to an empty screen (`slotSwitchTo*Screen`), the last window stays
  active on the other screen. Activating an already active window does
  nothing, so coming back needs the slot too. *Plasma behaves differently;
  see the real-monitor findings below.*
- **Output names in the nested session:** Virtual-0 and Virtual-1, side by
  side. `kscreen-doctor output.Virtual-1.disable` / `.enable` simulates an
  unplug and replug. KWin moves the windows off and, on replug, back again.
- **Per-screen desktops:** the config is `[Windows] PerOutputVirtualDesktops`
  in kwinrc, and `options.perOutputVirtualDesktops` in scripts. In that mode
  "Switch to Desktop N" only switches the active screen.

Desktops:
- **The nested config used to persist between sessions.** Desktops created
  in one test (including duplicate names like two "Desktop 2"s) were still
  there in the next, which made a test's desktop names misleading.
  `make nested` now empties `.dev/config` on every start. k3 itself keys
  spaces by desktop id, never by name.

Real monitors (the 2 screens under [Environment](#environment-dev-machine)):
- **How it was tested.** Shortcuts were fired over D-Bus. A throwaway,
  read-only KWin script (kept outside the repo) logged each window's
  geometry, output and desktop on a shortcut, and timestamped every geometry,
  output, desktop and activation change. You moved the mouse and clicked
  where only a human could.
- **KWin's active screen follows the pointer.** Moving the pointer onto
  another screen makes it `workspace.activeScreen`, while the focused window
  stays where it is. k3 took "the active window isn't on the active screen"
  to mean "the user went to an empty screen", so focus keys walked from the
  pointer's screen and Alt+H/J/K/L did nothing. **Fixed:** k3 walks from the
  active window's screen, and uses `activeScreen` only when no window is
  active.
- **`slotSwitchTo*Screen` steps from KWin's active screen** (so from the
  pointer's screen) and wraps around at the end. With the pointer on the
  target screen, "focus down" onto an empty laptop screen wrapped back to the
  top monitor. **Fixed:** k3 activates a window on the target screen itself.
  That's the screen's last-focused tiled window, or else what KWin's own
  switching would pick: the topmost floating window, or Plasma's desktop
  window. The slot is only a fallback for a bare KWin, with its direction
  worked out from KWin's own active screen.
- **Plasma focuses an empty screen's desktop window** (`plasmashell`, one per
  screen) when KWin switches to that screen. So focus doesn't linger as it
  does in a bare KWin. k3 tracks lingering focus explicitly
  (`strandedFocus`) for the bare case.
- **No signal for a change in usable area.** Hiding a panel, or a panel
  reserving its space again, emits nothing a script can see: no workspace
  signal, and no signal on the panel's window. Windows stayed 20px under a
  panel that came back. A replug does the same thing. The screen returns
  first and k3 tiles it without a panel; plasmashell creates the panel about
  0.7s later. **Fixed:** k3 checks the visible layouts' areas once a second
  (`QTimer`) and retiles any whose area changed. Idle cost is one
  `clientArea` call per screen and no geometry changes (none in 90 minutes).
- **Unplugging (`kscreen-doctor output.eDP-1.disable`):** KWin moves all of
  the screen's windows, on every desktop, within about 1ms, in stacking
  order. Each one goes in after the focused window, so a laptop layout
  `[K2 | K4 | K3]` arrived on the monitor as `[K1 | K4 | K3 | K2]`.
  plasmashell also recreates the remaining screen's panel. On re-enable,
  KWin restored the position and scale and moved the windows back.
- **Per-screen desktops:** KDE's *Window to Next Screen* sets the target
  screen's desktop itself. Switching desktops on one screen emits one
  `currentDesktopChanged`. `options.perOutputVirtualDesktopsChanged` exists
  for scripts, and k3 doesn't need it.
- **Scaled screen:** at scale 1.2 every geometry is in logical pixels and
  lands exactly where k3 asks. The gaps and the focus-parent outline are
  right. Output objects have no `scale` property in scripts, and k3 doesn't
  need one.
- **A real cable unplug** (HDMI-A-2, with 7 windows on 4 desktops) looked
  like `kscreen-doctor`: everything moved to the laptop within 1ms and was
  tiled there. The laptop's logical position jumped to 0,0. On replug,
  though, KWin moved only 2 of the 7 windows back: Zotero, whose desktop
  was hidden and which hadn't applied any geometry since, and System
  Settings. The other five stayed on the laptop. With `kscreen-doctor`,
  every window had returned. KWin seems to forget a window's home screen
  once the window is re-positioned (unconfirmed). So putting layouts back
  on replug is k3's job (decision (b); built, see below).
- **Obsidian came out of the unplug maximized,** although it was tiled.
  Neither k3 nor the user maximized it, so KWin or the app did. Its geometry
  changed while its desktop was hidden, which suggests it runs under
  XWayland. k3 respects a maximized window, so it stays maximized until
  you restore it.
- **Hidden desktops lag after a reload.** Windows on hidden desktops kept
  their old geometry and maximized state until their desktop was shown.
  That matches the phase 1 finding. Then they took their tiles: Obsidian
  and Zotero un-maximized and tiled within about 0.2s of being shown.
- **Focus onto an empty screen with the pointer on the other screen** works
  with the final build (Alt+J from the top monitor onto the empty laptop,
  and back).
- **Clicking a tab's sliver** activates and raises that tab (checked live).

### Binary tree and screen-move findings (2026-11-02)

Moving windows between screens:
- **`sendClientToScreen` takes effect when the client answers.** On real
  Wayland clients, the window's output changes about 20ms after the call
  (in the nested session, sooner). k3 had placed a moved container and
  retiled it right away, while its windows still counted as on the old
  screen, so they kept KWin's interim placement. **Fixed:** once the screen
  changes are handled (below), k3 retiles the layout of every window whose
  screen changed.
- **k3 handles screen changes after KWin's burst.** On an unplug, KWin
  moves every window off the lost screen within about 1ms, *before*
  `screensChanged`. By the end of that burst the lost screen is gone from
  `workspace.screens`. So k3 handles `outputChanged` from a 0ms single-shot
  `QTimer`. By then it can tell which layouts lost their screen and move
  each one whole (`rehome`), instead of window by window.
- **Retile skips windows in transit.** While a window is on another screen
  than its layout (its change not yet handled), k3 doesn't set its
  geometry. Tiling it would pull it back. This matters on replug: KWin
  returns some windows itself, and a retile of the remaining screen could
  otherwise drag them back.
- **Real replug, take two:** KWin moved 4 of 5 windows back itself this
  time (2 of 7 before), and k3 moved the last one 74ms later. Every window
  ended up in its old place and layout. With `kscreen-doctor`, the
  before and after dumps were identical.
- **A root with a single container child is redundant nesting.** k3 first
  kept a container moved onto an empty screen as the root's only child, so
  the selection would stay valid. The next "move left" then only stepped a
  window out of that wrapper, with no visible change. Now the root takes
  over the container's content (as `normalize` always did), and the
  selection becomes the whole screen's layout. Commands that act on a
  node's parent (split, Toggle Split Direction, Toggle Tabbed, focus parent)
  handle a whole-screen selection, and moving one only moves it to other
  screens.
- **The focus history must follow a moved active window.** Otherwise the
  next window that crossed over went next to the old focused window there.
  `moveSubtree` now marks the active window as its new layout's focused
  one, as `attachClient` does.

Binary tree:
- **Adopting builds a row, then rebuilds it.** At startup k3 adopts windows
  into rows as before, then rebuilds each binary tree layout once
  (`rebuildLayout`). Startup and Alt+Shift+T give the same shape, in
  `windowList()` order.
- **Shapes come from the layout, not from KWin.** Which way a window splits
  is read from the rect k3 computes for it (`nodeRect`), never from its
  lagging `frameGeometry`.
- **Fractional scale:** at scale 1.2, KWin snaps a requested width of 387
  to 386.67 (its device-pixel grid). That's within k3's one-pixel
  tolerance, so it doesn't cause churn.

### References

- KWin scripting API: https://develop.kde.org/docs/plasma/kwin/api/
- Expanded unofficial API docs: https://zeroxoneafour.github.io/kwin-scripting-docs/workspace.html
- i3 user guide: https://i3wm.org/docs/userguide.html
- AeroSpace (accordion layout): https://github.com/nikitabobko/AeroSpace
