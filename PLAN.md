# k3 implementation plan

k3 is an i3-style manual tiling window manager for KDE Plasma 6 on Wayland. It
is built as a single KWin script, and its keybindings live in **System Settings →
Keyboard → Shortcuts → KWin**.

Target: Plasma/KWin 6.8.2, Qt 6.12, Wayland. This is the dev machine; it has one
screen and 11 named virtual desktops.

---

## 1. Guiding principles

1. **Minimal.** k3 does only what KDE can't already do. When KDE has an action
   (fullscreen, close, switch or move to desktop, move to screen, keep on all
   desktops), k3 doesn't duplicate it. It watches for the resulting window
   state change and updates its own state.
2. **i3 semantics where they matter.** k3 keeps a manual container tree,
   explicit `split h` / `split v`, nested containers, focus parent/child, and
   new windows open next to the focused one.
3. **No runtime dependencies and no overlays.** The code is plain JavaScript
   against the KWin scripting API. There is no QML UI, no npm, and no
   TypeScript.
4. **Safe to turn off.** If k3 is disabled or crashes, windows stay where they
   are and KDE behaves normally.

## 2. Decisions (Q&A on 2026-11-02)

| Topic | Decision | Notes |
|---|---|---|
| Positioning engine | k3 keeps its own i3-style tree and sets `window.frameGeometry` | KWin's native Tile API (Meta+T) is not used. k3 clears `window.tile` on any window it manages. |
| Code structure | Several files in `src/`, concatenated by `make` into `package/contents/code/main.js` | KWin JS scripts load one file, so `make` does the concatenation. |
| New windows | i3 default | A new window goes after the focused window in the focused window's container. |
| KDE built-ins | Reuse them | Your existing desktop, close and fullscreen bindings keep working. |
| Mod key / directions | **Alt** + h/j/k/l | Alt is already your mod key for desktops. |
| Decorations | Keep KDE titlebars | The active titlebar color shows which window has focus. k3 never sets `noBorder`. |
| Tabbed / stacked | "Tabbed" means monocle with no tab bar. Stacked is dropped. | Without bars, stacked would look identical to tabbed. |
| v1 scope | Core features, plus multi-monitor and focus parent/child | Scratchpad and mouse-sync go in the backlog (§9). |
| Workspaces | Your existing 11 named KDE desktops, which stay fixed | No dynamic create/remove, because that would fight your named desktops. |
| Unit tests | `qmltestrunner` | It's already installed and uses the same V4 JS engine as KWin. Node is not installed. |

## 3. Feasibility: i3 features on Plasma 6 / Wayland

### Easy: straightforward with the JS API

| i3 feature | How k3 does it |
|---|---|
| Tree tiling (`splith`/`splitv`, nesting) | Own tree → computed rects → `window.frameGeometry` |
| New window next to the focused one | Insert after the focused leaf in its parent |
| `split h`, `split v`, `layout toggle split` | Tree operations |
| `focus`/`move` left/down/up/right (same screen) | Tree walk (§5.5) |
| `floating toggle`; dialogs/transients float automatically | `normalWindow`, `transient`, `dialog`, `modal`, `minSize == maxSize` |
| `for_window [class=…] floating enable` | Config list of window classes that always float |
| Gaps (inner/outer) | Layout math |
| `fullscreen` | KDE's *Make Window Fullscreen*. k3 skips the window while it's fullscreen. |
| `kill` | KDE's *Close Window* |
| `workspace N`, `move container to workspace N` | KDE's *Switch to Desktop N* / *Window to Desktop N*. k3 reacts to `desktopsChanged`. |
| `sticky` | KDE's *Keep Window on All Desktops*. k3 floats any window that is on all desktops. |
| `resize grow/shrink width/height` | Adjusts child weights in the tree, through dedicated shortcuts (no resize mode) |
| `layout tabbed` (monocle) | All children share one rect and the focused child is raised |
| `focus parent` / `focus child` (logic) | A per-workspace "selected node" pointer |
| `focus mode_toggle` | Jump between the last tiled and the last floating window |
| `focus_follows_mouse`, urgency hints | Already in KDE: the focus policy setting, taskbar highlighting, *Activate Window Demanding Attention* |
| `assign [class] → workspace` | Already in KDE: Window Rules |

### Medium: doable, but with edge cases or needs verification

| i3 feature | Difficulty / approach |
|---|---|
| Multi-monitor: tree per screen, focus/move across screens | Find the neighboring output from output geometry. Uses `workspace.sendClientToScreen`, `outputChanged`, and output hotplug. |
| Per-screen workspaces (i3: each workspace lives on one output) | Plasma 6.7+ has an opt-in setting, *Switch desktops independently for each screen* (Wayland only). The set of desktops is still shared across screens. k3 calls `workspace.currentDesktopForScreen(output)`, so it works with the setting on or off. |
| Showing which container is selected (focus parent) | `workspace.showOutline(rect)` / `hideOutline()`. Phase 0: it persists until hidden, but in the nested session it's an **opaque gray fill** that hides window content. Check the live (Plasma-themed) look in phase 3. If it's still opaque, fall back to an OSD hint. |
| Focusing an empty screen | KWin focus is per window, but `workspace.slotSwitchToLeftScreen` / `…Right…` / `…Above…` / `…Below…` exist (confirmed in phase 0), so k3 can move the active screen even when it has no windows |
| Window lifecycle edge cases | Apps that open maximized, min-size limits bigger than their tile, Wayland apps that set `app_id` late, transients that turn into normal windows |
| Dragging a tiled window with the mouse | v1: the window snaps back on `interactiveMoveResizeFinished`. Drop-to-reposition and mouse resize that updates ratios go in the backlog. |
| Feedback for split direction and tab position (i3 shows these with borders) | Optional: Plasma OSD over D-Bus (`org.kde.osdService.showText`, confirmed present on this machine) |
| Scratchpad (backlog) | Hide the window (minimize + skip taskbar) and bring it back floating and centered |

### Hard or not feasible: replace with a KDE-native alternative

| i3 feature | Why | Alternative |
|---|---|---|
| Binding modes (`mode "resize"`, custom modes) | Global shortcuts are static. A script can't grab the keyboard, and the JS API has no `unregisterShortcut`. | Direct shortcuts (Alt+Ctrl+h/j/k/l to resize) |
| Tab/title bars, i3 borders, focus colors | Drawing them needs a QML overlay window, which is out of scope | KDE titlebars plus the monocle tabbed layout |
| `stacking` layout | Without bars it's indistinguishable from tabbed | Dropped |
| i3 config file, `i3-msg`/IPC, command criteria | No IPC surface | KWin script config dialog plus System Settings shortcuts. Shortcuts can be fired over D-Bus (`invokeShortcut`). |
| i3bar | Not a WM concern | Plasma panel with the Pager widget |
| Dynamic numbered workspaces | Possible (`createDesktop`/`removeDesktop`) but clashes with your named desktops | Fixed KDE desktops |
| `move workspace to output` | No API to move a desktop to an output | — |
| `mouse_warping` | `workspace.cursorPos` is read-only | Backlog: invoke KWin's own *MoveMouseToFocus* through kglobalaccel over D-Bus |
| Restoring layouts / restart in place | The JS API has no file I/O and no `writeConfig` | On (re)load, k3 rebuilds trees from the current windows |
| Marks | No way to type a mark name | Skip |

## 4. Repository layout

```
k3/
├── README.md                 user guide and project notes
├── PLAN.md                   this file
├── Makefile                  build / install / reload / test / logs / nested
├── package/                  the KPackage (what kpackagetool6 installs)
│   ├── metadata.json         Id "k3", KPackageStructure "KWin/Script", X-Plasma-API "javascript",
│   │                         X-KDE-ConfigModule "kwin/effects/configs/kcm_kwin4_genericscripted"
│   └── contents/
│       ├── code/main.js      GENERATED by make (git-ignored)
│       ├── config/main.xml   KConfigXT schema for settings      (phase 5)
│       └── ui/config.ui      settings dialog (Qt Designer XML)  (phase 5)
├── src/                      concatenated in this order:
│   ├── config.js             readConfig() wrapper + defaults
│   ├── tree.js               PURE: nodes, insert/remove/normalize, navigation, layout → rects
│   ├── kwin.js               window filtering, signal wiring, applying geometry
│   ├── commands.js           the i3 commands, built from tree.js + kwin.js
│   └── main.js               shortcut table + startup
├── test/
│   ├── tst_engine.qml        guards the JS forms tree.js relies on (phase 0)
│   ├── fixtures/forms.js
│   └── tst_tree.qml          qmltestrunner tests for src/tree.js (phase 1)
└── kde_plasma_config/        your existing KDE config backups (unchanged)
```

The package layout copies `/usr/share/kwin/scripts/videowall`, which is a
stock script with code, config schema and config UI.

**Rule for `tree.js`:** it never touches `workspace`, `KWin`, or `Window`. It works
on window ids and plain `{x, y, width, height}` rects, so it can be tested
without KWin. Tests import it with `import "../src/tree.js" as Tree`. Phase 0
confirmed that `function`, `var`, `let`, `const` and `class` declarations are all
reachable through the qualifier (`test/tst_engine.qml` guards this).

## 5. Design

### 5.1 Data model (`tree.js`)

- **Workspace root**: one per *(output, desktop)*, keyed by
  `output.name + "|" + desktop.id`. This is the equivalent of an i3 workspace.
  Roots are created lazily and dropped when empty.
- **Container**: `{ layout: "splith" | "splitv" | "tabbed", children[], weights[],
  focus[] }`
  - `weights` are fractions along the split axis that sum to 1.
  - `focus` is a most-recent-first stack of children, the same idea as i3's
    focus stack. It decides which child you land on when entering a container,
    and which tab is visible.
  - A `tabbed` container remembers its previous split layout so the toggle can
    switch back.
- **Leaf**: `{ windowId }`. Floating windows are not in the tree; k3 keeps them
  in a separate set.
- **Selection**: each root has a `selected` node. Normally it's the focused leaf;
  focus parent/child moves it.
- Default root layout: `splith`.

**Normalization** (runs after every change):

- Remove empty containers (but never the root).
- A non-root container with a single child is replaced by that child, unless it
  was just created by `split` and is waiting for a second child (the
  `pendingSplit` flag). The flag clears once a second child arrives.
- If the root's only child is a container, the root takes over that
  container's children and layout.
- Inserting n-th child: new weight = 1/n, existing weights scaled by (n-1)/n.
  Removing a child: the others are rescaled to sum to 1.

### 5.2 Layout (`tree.js`, pure)

`layout(root, area, gaps) → Map<windowId, rect>`

- `area` = `workspace.clientArea(KWin.MaximizeArea, output, desktop)` (this
  excludes panels), inset by `gapsOuter`.
- `splith` / `splitv`: divide the rect along the axis by weight, with
  `gapsInner` between children. The last child absorbs rounding so there are
  no 1px seams.
- `tabbed`: every child gets the full rect.
- Excluded leaves (fullscreen, maximized) keep their slot, but k3 doesn't set
  their geometry. Their siblings don't move, which matches i3's fullscreen
  behavior.

### 5.3 Which windows k3 touches (`kwin.js`)

- **Ignored completely**: `specialWindow`, `desktopWindow`, `dock`,
  notifications, OSDs, popups, `appletPopup`, classes such as `plasmashell` and
  `krunner`, and **any window with an empty `resourceClass`**. Phase 0 found
  that KWin's own outline arrives via `windowAdded` as a window with an empty
  class, `normalWindow=true`, and on all desktops; k3 must never tile it.
- **Floated automatically**: anything that isn't a `normalWindow`, transients,
  modals, fixed-size windows (`minSize == maxSize`), windows on all desktops,
  windows on more than one desktop, and classes in the `floatClasses` config.
- **Tiled**: everything else.

### 5.4 Event handling (`kwin.js`)

| Signal | What k3 does |
|---|---|
| startup | Adopt existing windows (`workspace.windowList()`) into one `splith` root per (output, desktop). Retiling is held back until all windows are adopted, then each root is retiled once. |
| `workspace.windowAdded` | Classify the window. If it should be tiled: un-maximize it if it opened maximized, release it from KWin tiling (`w.tile.unmanage(w)`), insert it after the focused leaf in its root, retile. Connect its per-window signals. |
| `workspace.windowRemoved` | Remove the leaf, normalize, retile. KWin has already activated the next window in its most-recently-used order (phase 1 found it does this *before* `windowRemoved`), which matches i3, so k3 adds nothing. |
| `workspace.windowActivated` | Update focus stacks up the tree, reset the selection to the leaf, raise the leaf if it's in a tabbed container (covers Alt+Tab and taskbar clicks) |
| `w.desktopsChanged`, `w.outputChanged`, `w.minimizedChanged` | `sync()`: work out which root the window belongs in now. That's none while it's floating, minimized, or on several or all desktops. If it changed, move the leaf there: remove it from the old root, insert it after the focused leaf of the new one, and retile both. This covers KDE's *Window to Desktop N*, *Window to Next Screen*, *Keep on All Desktops* and output hotplug. |
| `w.tileChanged` | KDE quick-tiled a tiled window (e.g. Meta+arrow): release it and retile, so it snaps back |
| `w.fullScreenChanged`, `w.maximizedChanged` | Exclude or include the leaf, then retile |
| `w.interactiveMoveResizeFinished` | Retile so the window snaps back. Mouse sync is in the backlog. |
| `workspace.currentDesktopChanged`, `screensChanged`, `virtualScreenGeometryChanged` | Retile the visible roots |

**Applying geometry**: k3 only sets `frameGeometry` when it differs from the
current geometry by at least a pixel. k3 doesn't listen to
`frameGeometryChanged` at all, so it can't feed back on its own changes and
needs no re-entrancy guard. On Wayland, resizing is asynchronous
(configure/ack), so k3 never reads geometry back to make layout decisions;
the tree is the source of truth.

Facts confirmed in phase 0 that this design depends on:
- **Geometry lags.** Reading `frameGeometry` right after setting it returns
  the old value. `frameGeometryChanged` fires later, sometimes twice
  (699.99… → 700).
- **Coordinates are fractional** (e.g. `910.9999`). k3 rounds every rect it
  computes to whole pixels.
- **`windowActivated` arrives before `windowAdded`** for a new window. k3
  ignores activations of windows it doesn't know yet; `windowAdded` then
  inserts the window and updates focus.
- **`resourceClass` is set by `windowAdded`** for Wayland apps (konsole,
  ghostty). There's also a `windowClassChanged` signal for late changes.
- **`minSize` can change after `windowAdded`** (ghostty: 360×200 → 150×150),
  so don't use it to decide floating at add time.

### 5.5 Commands (`commands.js`)

All commands act on the **selected node** of the active window's root.

- **focus ⟨dir⟩**: walk up from the selected node until reaching a parent whose
  axis matches the direction (`splith` or `tabbed` for left/right, `splitv` for
  up/down) and that has a sibling in that direction. Then walk down that
  sibling's focus stack to a leaf and activate it. At the root, try the
  neighboring output (phase 4). Otherwise do nothing.
- **move ⟨dir⟩**:
  - If the sibling in that direction (in a parent on the matching axis) is a
    leaf, swap with it.
  - If that sibling is a container, move into it at the edge facing us.
  - If there's no sibling in that direction, move out: go to the nearest
    ancestor on the matching axis and insert beside it.
  - At the root, if the root's axis doesn't match, wrap the root's children in
    a new container and re-orient the root. If it does match, move to the
    neighboring output (phase 4).
- **split h / split v**: if the parent has one child, just change its layout.
  Otherwise wrap the selected node in a new container (`pendingSplit`).
- **layout toggle split**: flip the parent between `splith` and `splitv`.
- **layout tabbed (toggle)**: switch the parent between `tabbed` and its
  previous split layout. Inside a tabbed container, left/right steps through
  the tabs.
- **floating toggle**:
  - Tiled → floating: remove from the tree. Restore the geometry saved when
    the window was first tiled, or else center it at 60% of the area. Set
    `keepAbove` if `floatAbove` is on (i3 keeps floating windows above tiled
    ones).
  - Floating → tiled: insert next to the focused leaf, and undo `keepAbove`
    if k3 set it.
- **focus mode_toggle**: activate the most recent floating window, or the most
  recent tiled one if a floating window has focus.
- **resize ⟨grow|shrink⟩ ⟨width|height⟩**: from the selected node, find the
  nearest ancestor on the matching axis where the node has a sibling. Move
  `resizeStep` (default 5%) of weight between the node and its next sibling, or
  its previous sibling if it's last. Weights are clamped to at least 5%.
- **focus parent / focus child**: move the selection up one level, or down
  along the focus stack. While the selection is a container, show it with
  `workspace.showOutline(rect)`. Hide the outline when the selection returns to
  a leaf, or on any external activation.
- **retile** (recovery): rebuild the visible roots and re-apply geometry.

### 5.6 Configuration (`config.js`)

Values are read with `readConfig(key, default)` from `[Script-k3]` in `kwinrc`.
They're hard-coded defaults until phase 5 adds the settings dialog.

| Key | Default | Meaning |
|---|---|---|
| `gapsInner` | 4 | px between tiles (your KWin tile padding is 4) |
| `gapsOuter` | 4 | px between tiles and the screen edge |
| `floatClasses` | `"spectacle,org.kde.polkit-kde-authentication-agent-1,…"` | comma-separated window classes that always float |
| `ignoreClasses` | `"plasmashell,krunner,ksmserver-logout-greeter,…"` | window classes k3 never touches |
| `resizeStep` | 5 | % of the parent per resize keypress |
| `floatAbove` | true | floating windows get `keepAbove` |
| `osdHints` | false | show a Plasma OSD for split direction / tab position (§3, Medium) |

## 6. Keybindings

k3 registers its actions with
`registerShortcut("k3-focus-left", "k3: Focus Left", "Alt+H", fn)`. They show up
in System Settings under **KWin**, and searching "k3" lists them all.

- **Ids are stable.** Once released, an id like `k3-focus-left` never gets
  renamed, because user rebinds are stored against it in `kglobalshortcutsrc`.
- **A taken default key ends up bound twice.** Phase 0 disproved the
  assumption that KDE would leave the k3 action unbound: kglobalaccel binds it
  anyway, so two actions share one key. Which one fires is undefined. The keys
  under "Conflicts to clear" below **must** be unbound before k3 is enabled.
  Phase 2: at startup, k3 checks each of its keys with
  `callDBus(… "getGlobalShortcutsByKey" …)` and logs a warning for any
  duplicate.
- **Changing a default in code doesn't change existing installs.** Whatever is
  stored in `kglobalshortcutsrc` wins.

### Shortcuts k3 registers (proposed defaults; please review)

Your current Alt bindings leave **Alt+B/D/F/G/I/Q/T/U/V/W/X/Y** free. Those
look like they're reserved on purpose: Emacs M-x/M-w/M-f/M-b/M-d/M-v/M-y, and
browser Alt+D. So the less frequent k3 commands default to **Alt+Shift+letter**.

| Action (id) | i3 command | Default | Watch out |
|---|---|---|---|
| Focus left/down/up/right (`k3-focus-{left,down,up,right}`) | `focus left…` | Alt+H / Alt+J / Alt+K / Alt+L | Replaces your *Walk Through Windows* bindings |
| Move left/down/up/right (`k3-move-…`) | `move left…` | Alt+Shift+H/J/K/L | Replaces your *Quick Tile* bindings |
| Shrink width / grow height / shrink height / grow width (`k3-resize-…`) | `resize …` | Alt+Ctrl+H / J / K / L | Emacs C-M-h / C-M-k |
| Split horizontal (`k3-split-h`) | `split h` | Alt+Shift+B ("beside") | |
| Split vertical (`k3-split-v`) | `split v` | Alt+Shift+V | |
| Toggle split direction (`k3-layout-toggle-split`) | `layout toggle split` | Alt+Shift+T | |
| Toggle tabbed (`k3-layout-tabbed`) | `layout tabbed` | Alt+Shift+W | |
| Toggle floating (`k3-float-toggle`) | `floating toggle` | Alt+Shift+Space | |
| Focus tiled ↔ floating (`k3-focus-mode-toggle`) | `focus mode_toggle` | *(none)* | Alt+Space is KRunner |
| Focus parent (`k3-focus-parent`) | `focus parent` | Alt+Shift+U ("up") | |
| Focus child (`k3-focus-child`) | `focus child` | Alt+Shift+D ("down") | |
| Retile (`k3-retile`) | (`restart`) | *(none)* | recovery only |

### KDE built-ins k3 relies on (your current bindings; unchanged)

| i3 command | KDE action | Your binding |
|---|---|---|
| `workspace N` | Switch to Desktop N | Alt+1, Alt+2, Alt+S, Alt+R, Alt+M, Alt+N, Alt+Z, Alt+C, Alt+E, Alt+A, Alt+P |
| `move container to workspace N` | Window to Desktop N | Alt+Shift+(same letters) / Alt+!, Alt+@, Alt+# |
| `fullscreen toggle` | Make Window Fullscreen | Meta+F |
| `kill` | Close Window | Alt+F4, Meta+Alt+Shift+Q |
| `sticky toggle` | Keep Window on All Desktops | Meta+Alt+Shift+T |
| `focus output next` | Switch to Next Screen | Alt+O |
| `move container to output next` | Window to Next Screen | Alt+Shift+O |
| dmenu | KRunner | Alt+Space |
| `exec terminal` | ghostty launcher | Meta+Return |

### Conflicts to clear before enabling k3

- *Walk Through Windows* (Alt+K), *(Reverse)* (Alt+J), *Alternative* (Alt+L),
  *Alternative (Reverse)* (Alt+H)
- *Quick Tile Window Left/Bottom/Top/Right* (Alt+Shift+H/J/K/L)
- Optional: turn off **Screen Edges → "Tile windows by dragging them to the
  edge"**. Otherwise KWin quick-tiles a window dropped on an edge, and k3 has
  to snap it back.
- Optional: remove the stale Krohnkite entries in `kglobalshortcutsrc`.

After that, run `kde_plasma_config/backup_kde` to snapshot the new shortcut setup.

## 7. Development workflow

`make` targets. All of them were verified in phase 0.

| Target | Does |
|---|---|
| `make build` | Concatenates `src/*.js` (in the order `SRC` lists) into `package/contents/code/main.js`, with a `K3_BUILD` timestamp at the top |
| `make install` | `kpackagetool6 --type=KWin/Script --install package` (falls back to `--upgrade`) |
| `make enable` / `make disable` | `kwriteconfig6 … k3Enabled true\|false` + `qdbus6 org.kde.KWin /KWin reconfigure` (disable really unloads) |
| `make reload` | install, then `Scripting.unloadScript k3` + `Scripting.start`. Loads the new build in the live session without logging out. |
| `make logs` | Follows the `plasma-kwin_wayland` journal, filtered to `[k3]` lines |
| `make test` | Runs `/usr/lib/qt6/bin/qmltestrunner -input test` offscreen. `/usr/bin/qmltestrunner` is the Qt 5 one. |
| `make nested [HEADLESS=1]` | Nested KWin with 2 outputs (1600×900 each), isolated config in `.dev/config`, its own D-Bus session (address in `.dev/bus`), and logs in `.dev/nested.log`. `HEADLESS=1` uses `--virtual`, so no window opens. |
| `make nested-load` | Builds, then loads `main.js` into the nested KWin through D-Bus (no install needed) |
| `make nested-run CMD=konsole` | Launches an app inside the nested session |
| `make nested-key K=k3-hello` | Fires a k3 shortcut through kglobalaccel `invokeShortcut` |
| `make nested-stop` | Stops the nested KWin |
| `make uninstall` | Disables k3 and removes the package |

**Testing loop.** Run `make nested HEADLESS=1`, then `nested-load`, then
`nested-run` a few apps, then `nested-key …`. Results come from `.dev/nested.log`,
plus screenshots taken with `spectacle -b -n -f -o out.png` run inside the
nested session. This needs no keyboard and can't affect the live desktop.
There's no key-injection tool installed (`ydotool` would inject at the kernel
level and hit the live session), so real key presses are tested in the live
session. Whether host shortcuts leak into a *windowed* nested session is
untested.

## 8. Milestones

Each phase ends with README updated (notes plus the user guide for whatever is
finished).

**Phase 0: scaffolding and spikes** ✅ done 2026-11-02 (results in README →
"Phase 0 findings")
- `git init`, `.gitignore`, `Makefile`, `package/metadata.json`, and a
  `src/main.js` hello script that registers `k3-hello` (no key) and logs.
- `test/tst_engine.qml`: regression test for the JS forms tree.js may use.
- Spike outcomes:
  1. **Registration:** works, but a taken default key gets bound twice (§6).
  2. **Reload:** `make reload` works without logging out.
  3. **Nested session:** works headless; the windowed host-shortcut leak is
     untested.
  4. **Tests:** `qmltestrunner` exposes every top-level form.
  5. **Outline:** persists, but looks opaque in the nested session.
  6. **API:** `windowList()` exists and `resourceClass` is ready at
     `windowAdded`.
- **Done when** a hello shortcut fires and `make test` runs a trivial test.
  ✅ Fired through `invokeShortcut`, and from a key bound in System Settings
  in the live session.

**Phase 1: core tiling on one output** ✅ done 2026-11-02 (verified in the
nested session; you also tried it live with `make reload` and `make disable`)
- `tree.js`: model, insert/remove, normalization, layout with gaps.
  `test/tst_tree.qml` has 24 tests for it.
- `config.js`: `gapsInner`, `gapsOuter`, `floatClasses`, `ignoreClasses`.
- `kwin.js`: window filter, startup adoption, the §5.4 signals,
  fullscreen/maximize/minimize, and snap-back after quick tile.
- **Done when** opening and closing 1–6 windows on a desktop tiles them
  side by side with gaps, dialogs float, fullscreen works, switching desktops
  and moving windows between them with your existing keys keeps every
  desktop's layout correct, and nothing flickers or loops.
  ✅ All verified in the headless nested KWin, by firing the same KDE actions
  your keys trigger through `invokeShortcut`. There were zero geometry changes
  while idle.
- Not testable headless: snap-back after a mouse drag. Check it in the live
  session.

**Phase 2: i3 commands**
- focus/move by direction, split h/v, toggle split, tabbed (monocle), floating
  toggle + `floatClasses`, focus mode_toggle, keyboard resize, retile. Register
  the shortcuts from §6.
- Unit tests for the navigation, move and resize algorithms.
- Optional: `osdHints`.
- **Done when** a nested layout (e.g. `[A | [B / C]]`) can be built, rearranged,
  resized and tabbed using only shortcuts, and the README's keybinding table
  matches the code.

**Phase 3: focus parent/child**
- Selection pointer, outline indicator, and move/split/layout/resize acting on
  the selected container.
- **Done when** selecting `[B / C]` and moving it left swaps it as a unit with A.

**Phase 4: multi-monitor**
- Per-output roots, focus/move across outputs at tree edges, KDE's
  *Window to Next Screen*, output hotplug (windows re-homed through
  `outputChanged`), and both per-screen desktop modes (6.7+).
- Tested with `make nested` using two outputs.
- **Done when** focus and move by direction cross monitors naturally, and
  unplugging a monitor leaves every window tiled on the remaining one.

**Phase 5: settings and polish**
- `contents/config/main.xml` and `contents/ui/config.ui` for the §5.6 keys
  (System Settings → Window Management → KWin Scripts → k3 → configure).
- README user guide (install, conflict cleanup, keybindings, settings,
  troubleshooting).
- **Done when** someone else could install k3 from the README alone.

## 9. Backlog (not in v1)

Easiest first:
- `workspace back_and_forth`: k3 tracks the previous desktop; about 10 lines.
- Scratchpad: send to scratchpad / toggle scratchpad.
- Mouse sync: when a tiled window is dropped, re-insert it next to the window
  under the cursor (`workspace.windowAt`). When it's resized with the mouse,
  update the weights from the new size.
- Cursor follows focus across outputs: invoke KWin's `MoveMouseToFocus` via
  kglobalaccel D-Bus.
- Separate trees per KDE Activity: add `currentActivity` to the root key.
- A real tab bar and focus border as a QML overlay. This would mean switching
  to a declarative script; only worth it if monocle tabbed turns out to be too
  opaque.

## 10. Risks / open questions

- **Emacs vs. global Alt shortcuts.** Global shortcuts always win over app
  keys. Check the proposed table against your Emacs muscle memory before
  phase 2.
- **Wayland min-size.** A window whose minimum size is bigger than its tile
  will overlap its neighbors. Possible fix: float such windows automatically
  (decide in phase 1).
- **Script reload loses the layout.** Trees are rebuilt as a flat `splith` row.
  This is acceptable for v1, because the JS API can't persist state.
- **Selection indicator.** If the live outline is as opaque as in the nested
  session, focus parent/child needs a different indicator (phase 3).
- **Stale shortcut entries.** Removing a registered shortcut id (e.g.
  `k3-hello` in phase 1) leaves a stale line in `kglobalshortcutsrc`. Clean it
  up with the `org.kde.KGlobalAccel.unregister("kwin", "<id>")` D-Bus call.

## 11. References

- KWin scripting API: https://develop.kde.org/docs/plasma/kwin/api/
- KWin scripting tutorial: https://develop.kde.org/docs/plasma/kwin/
- Unofficial expanded API docs (by the Polonium author): https://zeroxoneafour.github.io/kwin-scripting-docs/workspace.html
- Per-screen virtual desktops MR: https://invent.kde.org/plasma/kwin/-/merge_requests/8602 ([Phoronix write-up](https://www.phoronix.com/news/KDE-Per-Screen-Virt-Desktops))
- i3 user guide (the semantics we mimic): https://i3wm.org/docs/userguide.html
- Example package with config UI: `/usr/share/kwin/scripts/videowall/`
