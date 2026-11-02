// The i3 commands behind k3's shortcuts. They act on the active window, using
// the tree operations from tree.js and the window state from kwin.js.
// See PLAN.md §5.5.

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

function focusDirection(dir) {
    const c = activeTiled();
    const target = c && neighbor(c.leaf, dir);
    if (target) activate(focusedLeaf(target));
}

function moveDirection(dir) {
    const c = activeTiled();
    if (c && moveNode(c.leaf, dir)) retile(spaces.get(c.key));
}

// Splitting changes no geometry until the next window opens.
function split(layout) {
    const c = activeTiled();
    if (c) splitNode(c.leaf, layout);
}

function toggleSplitLayout() {
    const c = activeTiled();
    if (!c) return;
    toggleSplit(c.leaf);
    retile(spaces.get(c.key));
}

function toggleTabbedLayout() {
    const c = activeTiled();
    if (!c) return;
    toggleTabbed(c.leaf);
    retile(spaces.get(c.key));
    // Tabs share one rect: keep the focused one on top.
    workspace.raiseWindow(c.window);
}

// sign: +1 grows, -1 shrinks; axis: "h" for width, "v" for height.
function resize(axis, sign) {
    const c = activeTiled();
    if (c && resizeNode(c.leaf, axis, sign * config.resizeStep / 100))
        retile(spaces.get(c.key));
}

// i3 "floating toggle". A floated window returns to where it was before it
// was tiled and, with floatAbove, stays above the tiled windows as in i3.
function toggleFloating() {
    const c = activeClient();
    if (!c) return;
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
    const area = workspace.clientArea(KWin.MaximizeArea, c.window.output, workspace.currentDesktop);
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
    const output = workspace.activeScreen;
    const desktop = workspace.currentDesktopForScreen(output);
    if (c && c.key) {
        const untiled = workspace.stackingOrder.filter(function (w) {
            const other = clients.get(windowId(w));
            return other && !other.key && !w.minimized && w.output.name === output.name
                && (w.onAllDesktops || w.desktops.some(function (d) { return d.id === desktop.id; }));
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
