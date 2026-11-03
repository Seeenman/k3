# k3 implementation plan

k3 is an i3-style manual tiling window manager for KDE Plasma 6 on Wayland. It
is built as a single KWin script, and its keybindings live in **System Settings →
Keyboard → Shortcuts → KWin**.

Target: Plasma/KWin 6.8.2, Qt 6.12, Wayland. This is the dev machine. It has
two screens (a monitor above a laptop screen scaled to 120%) and 11 named
virtual desktops.

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
| New windows | Binary tree by default (revised 2026-11-02; was i3's) | A new window halves the focused one along its longer side, as in bspwm. With `defaultLayout=split`, or after Alt+Shift+T, it goes after the focused window in its container (i3). See §5.5. |
| KDE built-ins | Reuse them | Your existing desktop, close and fullscreen bindings keep working. |
| Mod key / directions | **Alt** + h/j/k/l | Alt is already your mod key for desktops. |
| Decorations | Keep KDE titlebars | The active titlebar color shows which window has focus. k3 never sets `noBorder`. |
| Tabbed / stacked | One "tabbed" layout with no tab bar, drawn as an AeroSpace-style accordion: 30px slivers of the hidden tabs show beside the visible one. Its direction comes from where it sits (left/right at the root, across its parent's direction when nested), so i3's separate "stacked" isn't needed. | Revised 2026-11-02 at your request: originally a plain monocle; see §5.5 |
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
| Showing which container is selected (focus parent) | `workspace.showOutline(x, y, w, h)` / `hideOutline()`. It persists until hidden and animates when given a new rect. Phase 0 saw an opaque gray fill. In phase 3 it drew as KWin's translucent quick-tile preview (Plasma's `widgets/translucentbackground`), washing over the selected container. Live it looks fine, but it **swallows mouse clicks**. So any pointer movement (`workspace.cursorPosChanged`) ends the selection and hides the outline, and the click goes through. |
| Focusing an empty screen | KWin focus is per window. In Plasma every screen has a desktop window, and k3 activates that. `workspace.slotSwitchToLeftScreen` / `…Right…` / `…Above…` / `…Below…` (confirmed in phase 0) step from KWin's active screen, which follows the pointer, so k3 only uses them in a bare KWin (phase 4, real monitors) |
| Window lifecycle edge cases | Apps that open maximized, min-size limits bigger than their tile, Wayland apps that set `app_id` late, transients that turn into normal windows |
| Dragging a tiled window with the mouse | v1: the window snaps back on `interactiveMoveResizeFinished`. Drop-to-reposition and mouse resize that updates ratios go in the backlog. |
| Feedback for split direction and tab position (i3 shows these with borders) | Optional: Plasma OSD over D-Bus (`org.kde.osdService.showText`, confirmed present on this machine) |
| Scratchpad (backlog) | Hide the window (minimize + skip taskbar) and bring it back floating and centered |

### Hard or not feasible: replace with a KDE-native alternative

| i3 feature | Why | Alternative |
|---|---|---|
| Binding modes (`mode "resize"`, custom modes) | Global shortcuts are static. A script can't grab the keyboard, and the JS API has no `unregisterShortcut`. | Direct shortcuts (Alt+Ctrl+h/j/k/l to resize) |
| Tab/title bars, i3 borders, focus colors | Drawing them needs a QML overlay window, which is out of scope | KDE titlebars plus the monocle tabbed layout |
| `stacking` layout | Without bars it's indistinguishable from tabbed | Covered by tabbed's automatic up/down direction |
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
  Roots are created lazily (in `defaultLayout`) and dropped when empty. A
  root's `btree` flag makes it a binary tree workspace: a new window halves
  the focused one (`placeNode`).
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
- **Home screen**: a window evacuated from an unplugged screen remembers its
  name (`client.home`), so k3 can put it back on replug (§5.4).
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
| startup | Adopt existing windows (`workspace.windowList()`) into one `splith` root per (output, desktop). Retiling is held back until all windows are adopted. Then each binary tree root is rebuilt once (`rebuildLayout`), and each root is retiled once. |
| `workspace.windowAdded` | Classify the window. If it should be tiled: un-maximize it if it opened maximized, release it from KWin tiling (`w.tile.unmanage(w)`), insert it after the focused leaf in its root, retile. Connect its per-window signals. |
| `workspace.windowRemoved` | Remove the leaf, normalize, retile. KWin has already activated the next window in its most-recently-used order (phase 1 found it does this *before* `windowRemoved`), which matches i3, so k3 adds nothing. |
| `workspace.windowActivated` | Update focus stacks up the tree, reset the selection to the leaf, raise the leaf if it's in a tabbed container (covers Alt+Tab and taskbar clicks) |
| `w.desktopsChanged`, `w.minimizedChanged` | `sync()`: work out which root the window belongs in now. That's none while it's floating, minimized, or on several or all desktops. If it changed, move the leaf there: remove it from the old root, place it next to the focused leaf of the new one (`placeNode`), and retile both. This covers KDE's *Window to Desktop N* and *Keep on All Desktops*. |
| `w.outputChanged` | The same `sync()`, but from a 0ms single-shot `QTimer`, after KWin's burst of changes (`flushSyncs`). First `rehome()`. **Unplug:** each layout whose screen is gone moves whole (`moveSubtree`) next to the focused window where KWin put its windows, which remember that screen (`home`). **Replug:** windows whose home is back are moved there by k3, as the smallest subtree that holds just them. KWin returns only some itself. Then the syncs, then a retile of every layout a window entered: `sendClientToScreen` takes effect only when the client answers. This covers KDE's *Window to Next Screen* and hotplug. |
| `w.tileChanged` | KDE quick-tiled a tiled window (e.g. Meta+arrow): release it and retile, so it snaps back |
| `w.fullScreenChanged`, `w.maximizedChanged` | Exclude or include the leaf, then retile |
| `w.interactiveMoveResizeFinished` | Retile so the window snaps back. Mouse sync is in the backlog. |
| `workspace.currentDesktopChanged`, `screensChanged`, `virtualScreenGeometryChanged` | Retile the visible roots. `screensChanged` also runs `flushSyncs`, so a replugged screen gets its windows back even if KWin returned none. Retile skips any window that's on another screen than its root: it's in transit, and tiling it would pull it back. |
| every second (`QTimer`) | Retile each visible root whose usable area (`clientArea`) differs from the one it was last laid out in. KWin has no signal for a panel appearing, hiding or changing size (phase 4, real monitors). |

**Applying geometry**: k3 skips a window only if it's within a pixel of its
target *and* the target is what k3 last requested for it (`lastRect`).
Otherwise it sets `frameGeometry`. Reads lag behind requests, so a window can
read as being at its new target while an older request is still on its way;
that request would then win. Phase 4 hit this when a window moved screen and
desktop in one step. k3 doesn't listen to
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

All commands act on the **active window's leaf**. Phase 3 switches them to
the root's **selected node**, which can be a container. If the active window
isn't tiled (floating, or no window), the tree commands do nothing. The pure
tree operations are `neighbor`, `moveNode`, `splitNode`, `toggleSplit`,
`toggleTabbed` and `resizeNode` in `tree.js`; `test/tst_tree.qml` covers
them.

- **focus ⟨dir⟩**: walk up from the selected node until reaching a parent whose
  axis matches the direction (`splith` or `tabbed` for left/right, `splitv` for
  up/down) and that has a sibling in that direction. Then walk down that
  sibling's focus stack to a leaf and activate it.
  - **Which screen the user is on:** the active window's (`userScreen`), not
    `workspace.activeScreen`, which follows the pointer. That's only the
    fallback when no window is active.
  - **Edge of the screen's layout:** go to the screen next to it in that
    direction (`nearestInDirection` on the screen geometries) and activate
    its last-focused tiled window.
  - **Empty target screen:** activate what KWin's own screen switching
    would: the topmost floating window there, or Plasma's desktop window.
  - **Nothing to activate** (a bare KWin has no desktop window), or the
    target is already active: move KWin's active screen with
    `slotSwitchTo{Left,Right,Above,Below}Screen`. The direction is worked
    out from KWin's own active screen, since that's where the slot steps
    from. The window left active elsewhere is remembered (`strandedFocus`),
    and focus keys walk on from the empty screen.
  - **The user is on an empty screen** (Plasma's desktop window is active,
    or focus was stranded): go straight on to the next screen.
  - **A floating window is focused:** do nothing.
- **move ⟨dir⟩**:
  - If the sibling in that direction (in a parent on the matching axis) is a
    leaf, swap with it.
  - If that sibling is a container, move into it, next to the leaf found by
    walking down: on the move's axis take the near edge, across it take the
    focused child. That's i3's `con_descend_direction`. Moving *down* into a
    horizontal container therefore joins its row, next to its focused window.
  - If there's no sibling in that direction, move out: go to the nearest
    ancestor on the matching axis and insert beside it.
  - At the root, if the root's axis doesn't match, wrap the root's children in
    a new container and re-orient the root.
  - If it does match (or it's the only window), send the window to the screen
    next to it (`sendClientToScreen`). Then put it on the desktop that screen
    shows, since that can differ with per-screen desktops. `sync()` inserts
    it after that screen's focused window.
  - A selected container crosses screens too, whole (`moveSubtree`): k3
    places the subtree, then KWin moves its windows while `sync()` is held
    off (`holdSync`). On an empty screen the root takes over its content, and
    the selection becomes that root. A whole-root selection only moves on to
    other screens: `moveNode` treats it as being at every edge, and split,
    the layout toggles and focus parent act on the root itself or do
    nothing.
- **Placing a new window** (or a subtree moved in), `placeNode`:
  - In a binary tree root, it halves the focused leaf: it goes second in a
    new two-way split, beside the leaf if the leaf's rect is wider than
    tall, else below it. A lone child just re-orients its parent.
  - In a split root (i3), or when the focused leaf's container is tabbed or
    was just split by the user (`pendingSplit`), it goes after the focused
    leaf.
  - Into an empty root, a container's content becomes the root's.
- **toggle binary tree** (Alt+Shift+T): rebuild the root from its leaves in
  their current order (`rebuildLayout`), either as a binary tree (each leaf
  halving the one before it) or as one row. Containers and tabs are dropped,
  and the focused leaf stays focused.
- **split h / split v**: if the parent has one child, just change its layout.
  Otherwise wrap the selected node in a new container (`pendingSplit`).
- **layout toggle split**: flip the parent between `splith` and `splitv`.
- **layout tabbed (toggle)**: switch the parent between `tabbed` and its
  previous split layout.
- **Tabbed containers (accordion, after AeroSpace; deviates from i3):**
  - **Direction:** a tabbed root runs left/right. A nested tabbed container
    runs across its parent's direction, so the parent's keys keep moving
    between its parts (`axisOf`). In `[A | tabs]`, Alt+H/L go between A and
    the tabs, and Alt+J/K step through the tabs.
  - **Slivers:** the visible tab (the container's `focus[0]`) is inset by
    `tabPadding` on each side that has tabs. Earlier and later tabs sit
    `tabPadding` further out behind it, so a sliver of them shows. All tabs
    keep one size. k3 retiles on every activation so the slivers follow
    focus.
  - **Move along the direction:** reorders tabs. Past the first or last tab,
    the tab *pops out*: the tabs' place is split along the move direction
    (`wrap`) with the tab on that side. The remaining tabs then run the other
    way, and a lone remaining tab becomes a plain window.
  - **Move sideways:** steps the tab out as usual (e.g. below the tabs).
  - **Merge back:** moving a window into a tabbed container puts it next to
    the visible tab.
- **floating toggle**:
  - Tiled → floating: remove from the tree and restore the geometry the
    window had when k3 first saw it. If that nearly fills the screen (≥90% in
    both dimensions), center it at two thirds of the screen instead. Apps
    like konsole reopen at their last *tiled* size, so the saved geometry is
    often useless. Set `keepAbove` if `floatAbove` is on (i3 keeps floating
    windows above tiled ones).
  - Floating → tiled: remember the current geometry for next time, insert
    next to the focused leaf, and undo `keepAbove` if k3 set it.
- **focus mode_toggle**: from a tiled window, activate the topmost untiled
  window (floating, sticky) on the same screen and desktop. From anything
  else, activate the workspace's focused leaf.
- **resize ⟨grow|shrink⟩ ⟨width|height⟩**: from the selected node, find the
  nearest ancestor on the matching axis where the node has a sibling. Move
  `resizeStep` (default 5%) of weight between the node and its next sibling, or
  its previous sibling if it's last. Weights are clamped to at least 5%.
- **focus parent / focus child**: move the selection up one level (stopping
  below the root), or back down along the focus stack. Down to a leaf means
  no selection. There is one global `selection` ({ node, space }). Any window
  activation clears it (k3's own focus moves, clicks, Alt+Tab), and so do a
  desktop switch and any mouse movement (the outline swallows clicks, so
  reaching for the mouse ends the selection). While it's set:
  - move, split, layout toggles, resize and directional focus act on the
    selected container;
  - KWin's outline covers it (`nodeRect`: the union of its leaves' rects), and
    it's re-shown after every command so it follows the container.

  A command that dissolves the container clears the selection.
- **retile** (recovery): re-run `sync()` for every window, then re-apply the
  visible layouts.

Every shortcut and signal handler is wrapped in `guarded()`, which logs
`[k3] error: …` with a stack trace. KWin itself silently drops exceptions
thrown from callbacks (phase 2 finding).

### 5.6 Configuration (`config.js`)

Values are read with `readConfig(key, default)` from `[Script-k3]` in `kwinrc`.
They're hard-coded defaults until phase 5 adds the settings dialog.

| Key | Default | Meaning |
|---|---|---|
| `defaultLayout` | `"btree"` | how a root starts: `btree` (binary tree) or `split` (i3 placement) |
| `gapsInner` | 10 | px between tiles |
| `gapsOuter` | 10 | px between tiles and the screen edge |
| `floatClasses` | `"spectacle,org.kde.polkit-kde-authentication-agent-1,…"` | comma-separated window classes that always float |
| `ignoreClasses` | `"plasmashell,krunner,ksmserver-logout-greeter,…"` | window classes k3 never touches |
| `resizeStep` | 5 | % of the parent per resize keypress |
| `floatAbove` | true | windows k3 floats get `keepAbove` |
| `tabPadding` | 30 | px of each hidden tab left showing beside the visible one (0 = plain monocle) |

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
  `make check-keys` (`tools/check-keys.awk`) lists every key a k3 shortcut
  shares with another action, and exits non-zero if there's any. This
  replaces the planned startup check over `callDBus`: a make target is
  simpler and adds no code to the script.
- **Changing a default in code doesn't change existing installs.** Whatever is
  stored in `kglobalshortcutsrc` wins.

### Shortcuts k3 registers (defaults; registered since phase 2, except parent/child in phase 3)

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
| Toggle split direction (`k3-layout-toggle-split`) | `layout toggle split` | Alt+/ (AeroSpace's `alt-slash`; was Alt+Shift+T) | Emacs M-/ |
| Toggle tabbed (`k3-layout-tabbed`) | `layout tabbed` | Alt+, (AeroSpace's `alt-comma`; was Alt+Shift+W) | Emacs M-, |
| Toggle binary tree (`k3-layout-btree`) | (bspwm-style tiling) | Alt+Shift+T ("tree"; freed when toggle split moved to Alt+/) | |
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
- Snap-back after a mouse drag can't be tested headless. ✅ Confirmed by you
  in the live session (phase 2 build).

**Phase 2: i3 commands** ✅ done 2026-11-02 (verified in the nested session,
then loaded live by you)
- `src/commands.js`: focus/move by direction, split h/v, toggle split, tabbed
  (monocle), floating toggle, focus mode_toggle, keyboard resize, retile.
- `src/main.js`: the §6 shortcut table, plus `guarded()`.
- `tree.js` command operations, with 25 more unit tests (49 tree tests).
- `make check-keys` for duplicate key bindings.
- `osdHints` was not built; it's in the backlog.
- **Done when** a nested layout (e.g. `[A | [B / C]]`) can be built, rearranged,
  resized and tabbed using only shortcuts, and the README's keybinding table
  matches the code. ✅ Verified in the nested KWin through `invokeShortcut`:
  building `[A | [B / C]]`, every focus direction, five kinds of move, resize,
  tabbed on/off, float/unfloat, and focus mode toggle.

**Phase 3: focus parent/child** ✅ done 2026-11-02 (verified in the nested
session and live by you)
- `commands.js`: the global selection, `onTarget()` (every tree command acts on
  the selection or the active leaf), outline indicator, `focusParent` and
  `focusChild` on Alt+Shift+U / Alt+Shift+D.
- `tree.js`: `nodeRect`, plus 5 tests for container targets (54 tree tests).
- **Done when** selecting `[B / C]` and moving it left swaps it as a unit with A.
  ✅ Also verified:
  - focus child hides the outline;
  - focus up from the container is a no-op and focus right leaves it;
  - toggle split and grow height act on the container;
  - a desktop switch clears the selection;
  - no errors were logged.
- Live check by you: the outline looks fine but swallowed clicks. Fixed: mouse
  movement now ends the selection. (You chose this over flashing the outline
  or dimming the other windows.)

**Accordion tabbed (added before phase 4, at your request)** ✅ 2026-11-02
(verified in the nested session and live by you)
- `tree.js`: `axisOf` derives a tabbed container's direction, the layout draws
  the slivers, `moveNode` pops tabs out, and `wrap` is shared with
  `splitNode` and root re-orientation. 12 new tests, 2 updated (66 tree tests).
- `config.js`: `tabPadding`. `kwin.js` retiles on activation.
- Verified with 4 tabs: slivers, reorder, pop out (the rest turn to up/down),
  Alt+J/K inside the group and Alt+H/L between the window and the group, and
  merge back. With 2 tabs, pop-out leaves a plain split. Focus changes cause
  no geometry churn.

**Phase 4: multi-monitor** ✅ built 2026-11-02, verified on the nested
session's two virtual screens, then on real monitors the same day
- Per-output roots (since phase 1), now with focus/move across screens at the
  layout's edges, KDE's *Window to Next Screen*, hotplug, and both
  per-screen desktop modes.
- Spaces store the output's name and the desktop's id and look the objects up
  when needed (`spaceArea`), since KWin replaces output objects on replug.
- `nearestInDirection` (2 new tests, 68 tree tests in all) and the
  `lastRect` fix in `retile`.
- **Done when** focus and move by direction cross monitors naturally, and
  unplugging a monitor leaves every window tiled on the remaining one.
  ✅ Verified on virtual screens:
  - focus across screens, both onto an empty screen and back from one;
  - moving across screens in both directions;
  - KDE's *Window to Next Screen*;
  - disabling and re-enabling a screen with `kscreen-doctor` (its windows
    re-tile on the other screen and then return);
  - per-screen desktops: a moved window lands on the desktop the target
    screen shows.
- **Real monitors** (README → "Phase 4 findings"): a 1920×1080 monitor
  above a laptop screen at scale 1.2 (1600×900 logical, offset 145px), each
  with a top panel.
  - ✅ Verified:
    - focus across screens both ways, onto an empty screen and back, with
      each screen's last-focused window remembered; the side edges (no
      screen there) do nothing;
    - move to the next screen after its focused window; a selected
      container stops at the edge;
    - KDE's *Window to Next Screen* both ways;
    - gaps and usable areas on both screens; nothing overlaps a panel,
      including after a panel hides and returns;
    - unplug and replug with `kscreen-doctor output.eDP-1.disable` /
      `.enable`;
    - per-screen desktops on and off;
    - on the scaled screen: accordion slivers, reorder and pop-out; the
      focus-parent outline (exact, and the mouse ends it); floating; focus
      tiled/floating; fullscreen; maximize;
    - zero geometry changes while idle;
    - clicking a tab's sliver switches to it.
  - Offset-stacked and diagonal arrangements were also tested on the nested
    session's screens (moved with `kscreen-doctor … position`). 2 new tests
    (70 tree tests in all).
  - **Fixed** (none of these show on virtual screens: no pointer, no
    panels):
    - focus keys walked from KWin's active screen, which follows the
      pointer, so they stopped working when the mouse rested on the other
      monitor;
    - focusing an empty screen used `slotSwitchTo*Screen`, which steps from
      the pointer's screen and wraps around;
    - k3 didn't notice usable-area changes, so windows stayed under a panel
      that came back (also after every replug). Now checked once a second.
    - Smaller fix: floating geometry and *Focus Tiled/Floating* used the
      global current desktop or active screen instead of the window's own.
- **Follow-up tests:**
  - ✅ With the final build, Alt+J onto an empty screen and back, with the
    pointer on the other screen.
  - ✅ Windows on a hidden desktop take their tiles once it's shown after a
    reload, including un-maximizing.
  - ⚠️ A real HDMI cable unplug: every window was tiled on the laptop. On
    replug, KWin moved only 2 of 7 windows back, while `kscreen-doctor` had
    returned all. Feeds decision (b) below.
- **Not tested yet:**
  - a side-by-side arrangement on real monitors;
  - turning per-screen desktops off while the screens show different
    desktops.
- **Still open** (decisions):
  - Should a selected container be able to move to another screen (i3
    allows it)? It stops at the edge now.
  - On unplug, should windows keep their left-to-right order? KWin hands
    them over in stacking order, and each goes right after the focused
    window, so they end up in reverse stacking order, whatever their layout
    was: `[K2 | K4 | K3]` became `[K1 | K4 | K3 | K2]`. Containers are lost
    both ways, and after a real replug KWin doesn't return every window.

  You decided yes to both (2026-11-02). Both are built: see the next
  milestone.

**Binary tree layout and moving between screens (added after phase 4, at
your request)** ✅ 2026-11-02 (verified in the nested session, then live on
both screens, including a real cable unplug)
- `tree.js`:
  - `placeNode`, the binary tree split (`splitBeside`) and `rebuildLayout`;
  - `takeContent` and `commonAncestor`;
  - guards for a whole-root node.

  8 new tests (78 tree tests in all).
- `kwin.js`:
  - `spaceFor` (roots start in `defaultLayout`);
  - `moveSubtree`;
  - deferred screen changes (`scheduleSync` / `flushSyncs`);
  - `rehome` (`evacuate`, `restoreHomes`);
  - the in-transit guard in `retile`.
- `commands.js`: `moveSelectionToScreen` and `toggleBinaryTree`.
  `main.js`: Alt+Shift+T. `config.js`: `defaultLayout`.
- ✅ Verified live:
  - new windows halve the focused one (on the scaled screen too), and
    Alt+Shift+T rebuilds both ways;
  - a selected container crosses screens and back with every window tiled
    (this found the "takes effect when the client answers" bug);
  - `kscreen-doctor output.eDP-1.disable` / `.enable` with a nested layout:
    the laptop's layout sat beside the monitor's focused window as one unit,
    then everything returned exactly (identical dumps);
  - a real HDMI cable unplug: each layout moved as a unit. On replug, KWin
    returned 4 of 5 windows and k3 the fifth; everything ended up where it
    was;
  - no errors, no idle churn, and `make check-keys` clean.
- In the nested session also: a selection onto an empty screen and back
  (found the redundant-wrapper problem), and the focus history after a
  move (found and fixed).
- **Not tested:** restoring a group that got mixed with other windows
  meanwhile (k3 then moves them one by one, in order); per-screen desktops
  combined with hotplug.

**Phase 5: settings and polish**
- `contents/config/main.xml` and `contents/ui/config.ui` for the §5.6 keys
  (System Settings → Window Management → KWin Scripts → k3 → configure).
- README user guide (install, conflict cleanup, keybindings, settings,
  troubleshooting).
- **Done when** someone else could install k3 from the README alone.

## 9. Backlog (not in v1)

Easiest first:
- `workspace back_and_forth`: k3 tracks the previous desktop; about 10 lines.
- `osdHints`: a Plasma OSD (`org.kde.osdService.showText` over `callDBus`)
  after split / layout commands. Without it nothing shows the split direction
  or tab position, because k3 keeps KDE titlebars and draws no borders.
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
- **Selection vs. touchpad.** Since any pointer movement ends a selection, a
  stray touchpad touch while selecting with the keyboard ends it too.
  Fallbacks if that's annoying: flash the outline with a `QTimer` (available
  in KWin scripts), or dim the windows outside the selection (`window.opacity`
  is writable).
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
