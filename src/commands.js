// The i3 commands behind k3's shortcuts. They act on the active window, or
// on the container picked with focus parent, using the tree operations from
// tree.js and the window state from kwin.js. See PLAN.md §5.5.

// The container picked with focus parent, as { node, space }; null when the
// commands act on the active window itself. Any activation clears it.
let selection = null;

// The active window's client, or null if k3 doesn't manage it.
function activeClient() {
    const w = workspace.activeWindow;
    return (w && clients.get(windowId(w))) || null;
}

// The active window's client if it's tiled, else null.
function activeTiled() {
    const c = activeClient();
    return c && c.key ? c : null;
}

function activate(leaf) {
    workspace.activeWindow = clients.get(leaf.id).window;
}

// Set when k3 moved KWin to a screen with nothing to focus while the active
// window stayed behind on another one: { window, from, screen } (output
// names). Only a bare KWin gets there; Plasma has a desktop window on every
// screen. Void once that window changes screens; any activation clears it.
let strandedFocus = null;

// The screen the user is working on: the active window's. KWin's activeScreen
// isn't: it follows the pointer, which may rest on another screen. It's the
// fallback when no window is active.
function userScreen() {
    const w = workspace.activeWindow;
    const f = strandedFocus;
    const stranded = f && f.window === w && w.output.name === f.from && outputNamed(f.screen);
    return stranded || (w && w.output) || workspace.activeScreen;
}

// Whether w shows on output while that screen shows desktop.
function shownOn(w, output, desktop) {
    return !w.minimized && !!w.output && w.output.name === output.name
        && (w.onAllDesktops || w.desktops.some(function (d) { return d.id === desktop.id; }));
}

// Run fn(node, space) on what the commands act on: the selected container,
// or else the active window's leaf. Nothing happens unless the active window
// is tiled. Afterwards the outline follows the selection, which a tree change
// may also have dissolved.
function onTarget(fn) {
    const c = activeTiled();
    if (!c) return;
    const s = spaces.get(c.key);
    if (selection && (selection.space !== s || rootOf(selection.node) !== s.root)) clearSelection();
    fn(selection ? selection.node : c.leaf, s);
    if (!selection) return;
    if (rootOf(selection.node) === s.root) showSelection();
    else clearSelection();
}

// i3 highlights the focused container's border; k3 uses KWin's outline.
function showSelection() {
    const s = selection.space;
    const area = spaceArea(s);
    if (!area) {
        clearSelection();
        return;
    }
    const r = nodeRect(s.root, selection.node, area, config.gapsInner, config.gapsOuter,
                       config.tabPadding);
    workspace.showOutline(r.x, r.y, r.width, r.height);
}

function clearSelection() {
    if (!selection) return;
    selection = null;
    workspace.hideOutline();
}

// i3 "focus parent": select the container around the active window, one level
// further up each time, stopping below the root.
function focusParent() {
    onTarget(function (node, s) {
        if (!node.parent || node.parent.type === "root") return;
        selection = { node: node.parent, space: s };
    });
}

// i3 "focus child": step the selection back down towards the active window.
function focusChild() {
    onTarget(function (node) {
        if (!selection) return;
        if (node.focus[0].type === "leaf") clearSelection();
        else selection.node = node.focus[0];
    });
}

// At the edge of a screen's layout, focus continues onto the next screen.
// On an empty screen (Plasma's desktop window is active there, or focus
// stayed behind elsewhere) it goes straight on to the next one.
function focusDirection(dir) {
    const c = activeClient();
    const screen = userScreen();
    if (c && c.window.output.name === screen.name) {
        // A focused floating window has nothing tiled to walk from.
        if (!c.key) return;
        let done = false;
        onTarget(function (node) {
            const target = neighbor(node, dir);
            if (target) {
                activate(focusedLeaf(target));
                done = true;
            }
        });
        if (done) return;
    }
    focusScreen(screen, dir);
}

// At the edge of a screen's layout, the window or the selected container
// continues onto the next screen.
function moveDirection(dir) {
    let done = false;
    onTarget(function (node, s) {
        if (moveNode(node, dir)) {
            retile(s);
            done = true;
        }
    });
    if (done) return;
    if (selection) moveSelectionToScreen(dir);
    else moveToScreen(dir);
}

// i3 "move container to output": the selected container moves whole, with
// its inner layout, onto the desktop the next screen shows, next to that
// layout's focused window. It stays selected; on an empty screen that's the
// whole screen's layout, which only moves on to other screens.
function moveSelectionToScreen(dir) {
    const s = selection.space;
    const output = outputNamed(s.outputName);
    const next = output && screenInDirection(output, dir);
    if (!next) return;
    const moved = moveSubtree(selection.node, s, next, workspace.currentDesktopForScreen(next));
    // On an empty screen it's the whole layout now (its root took over its
    // content): keep all of it selected, so it can move on as a unit.
    selection = { node: moved.node.parent ? moved.node : moved.space.root, space: moved.space };
    showSelection();
}

// The screen next to output in direction dir, or null.
function screenInDirection(output, dir) {
    const screens = workspace.screens;
    const i = nearestInDirection(output.geometry, screens.map(function (o) { return o.geometry; }), dir);
    return i >= 0 ? screens[i] : null;
}

// The window to focus on entering output: its last focused tiled window, or
// else, as KWin's own screen switching does, the topmost window there that
// k3 knows (a floating one) or Plasma's desktop window. null if none.
function screenFocusTarget(output) {
    const desktop = workspace.currentDesktopForScreen(output);
    const s = spaces.get(spaceKey(output, desktop));
    if (s) return clients.get(focusedLeaf(s.root).id).window;
    const here = workspace.stackingOrder.filter(function (w) {
        return (w.desktopWindow || clients.has(windowId(w))) && shownOn(w, output, desktop);
    });
    return here.length ? here[here.length - 1] : null;
}

const SWITCH_SCREEN = { left: "slotSwitchToLeftScreen", right: "slotSwitchToRightScreen",
                        up: "slotSwitchToAboveScreen", down: "slotSwitchToBelowScreen" };

// Make output KWin's active screen. KWin's slots step from its own active
// screen, which follows the pointer (and wrap around at the end), so the
// step starts from there.
function switchKWinScreen(output) {
    const from = workspace.activeScreen;
    const dir = Object.keys(SWITCH_SCREEN).find(function (d) {
        const o = screenInDirection(from, d);
        return o && o.name === output.name;
    });
    if (dir) workspace[SWITCH_SCREEN[dir]]();
}

// Focus the screen next to output by activating a window there. Only when
// there's none (a bare KWin has no desktop window), or it's already active
// (back from such a screen), move KWin's active screen instead; focus then
// stays behind on the old screen.
function focusScreen(output, dir) {
    const next = screenInDirection(output, dir);
    if (!next) return;
    const target = screenFocusTarget(next);
    if (target && !target.active) {
        workspace.activeWindow = target;
        return;
    }
    const before = workspace.activeWindow;
    switchKWinScreen(next);
    strandedFocus = before && workspace.activeWindow === before && before.output.name !== next.name
        ? { window: before, from: before.output.name, screen: next.name } : null;
}

// Send the active tiled window to the screen next to it, onto the desktop
// that screen shows (they differ with per-screen desktops); sync() then
// tiles it there after that screen's focused window.
function moveToScreen(dir) {
    const c = activeTiled();
    const next = c && screenInDirection(c.window.output, dir);
    if (!next) return;
    workspace.sendClientToScreen(c.window, next);
    const desktop = workspace.currentDesktopForScreen(next);
    if (c.window.desktops[0].id !== desktop.id) c.window.desktops = [desktop];
}

// Splitting changes no geometry until the next window opens.
function split(layout) {
    onTarget(function (node) { splitNode(node, layout); });
}

function toggleSplitLayout() {
    onTarget(function (node, s) {
        toggleSplit(node);
        retile(s);
    });
}

function toggleTabbedLayout() {
    onTarget(function (node, s) {
        toggleTabbed(node);
        retile(s);
        // Tabs share one rect: keep the focused one on top.
        workspace.raiseWindow(workspace.activeWindow);
    });
}

// Switch the active window's screen-and-desktop between a binary tree and
// a single row, rebuilding it from its windows in their current order.
function toggleBinaryTree() {
    const c = activeTiled();
    if (!c) return;
    const s = spaces.get(c.key);
    const geometry = spaceGeometry(s);
    if (!geometry) return;
    clearSelection();
    rebuildLayout(s.root, !s.root.btree, geometry);
    retile(s);
}

// sign: +1 grows, -1 shrinks; axis: "h" for width, "v" for height.
function resize(axis, sign) {
    onTarget(function (node, s) {
        if (resizeNode(node, axis, sign * config.resizeStep / 100)) retile(s);
    });
}

// i3 "floating toggle". A floated window returns to where it was before it
// was tiled and, with floatAbove, stays above the tiled windows as in i3.
function toggleFloating() {
    const c = activeClient();
    if (!c) return;
    clearSelection();
    const w = c.window;
    if (c.floating) {
        c.floating = false;
        if (c.keptAbove) {
            w.keepAbove = false;
            c.keptAbove = false;
        }
        c.floatRect = copyRect(w.frameGeometry);
        claim(w);
        sync(c);
    } else {
        c.floating = true;
        sync(c);
        w.frameGeometry = floatGeometry(c);
        if (config.floatAbove && !w.keepAbove) {
            w.keepAbove = true;
            c.keptAbove = true;
        }
    }
}

// The pre-tiling geometry, unless it nearly fills the screen (apps such as
// konsole reopen at their last, tiled, size): then two thirds of the screen,
// centered.
function floatGeometry(c) {
    const r = c.floatRect;
    const output = c.window.output;
    const area = workspace.clientArea(KWin.MaximizeArea, output, workspace.currentDesktopForScreen(output));
    if (r.width < area.width * 0.9 || r.height < area.height * 0.9) return r;
    const width = Math.round(area.width * 2 / 3);
    const height = Math.round(area.height * 2 / 3);
    return {
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        width: width,
        height: height
    };
}

// i3 "focus mode_toggle": jump between the tiled and the untiled windows of
// the current workspace.
function focusModeToggle() {
    const c = activeClient();
    const output = userScreen();
    const desktop = workspace.currentDesktopForScreen(output);
    if (c && c.key) {
        const untiled = workspace.stackingOrder.filter(function (w) {
            const other = clients.get(windowId(w));
            return other && !other.key && shownOn(w, output, desktop);
        });
        if (untiled.length) workspace.activeWindow = untiled[untiled.length - 1];
    } else {
        const s = spaces.get(spaceKey(output, desktop));
        if (s) activate(focusedLeaf(s.root));
    }
}

// Recovery: re-check every window's place and re-apply the visible layouts.
function retileAll() {
    clients.forEach(sync);
    retileVisible();
}
