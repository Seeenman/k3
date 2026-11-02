// KWin side of k3: decides which windows to tile, keeps one tree per
// (output, desktop) in sync with window events, and applies the layout.
// See PLAN.md §5.3-5.4.

const spaces = new Map();   // spaceKey -> { root, output, desktop }
const clients = new Map();  // window id -> { window, floating, leaf, key }
let adopting = false;       // true while start() adopts existing windows

function windowId(w) { return String(w.internalId); }
function spaceKey(output, desktop) { return output.name + "|" + desktop.id; }

function matchesClass(w, list) {
    return list.indexOf(String(w.resourceClass).toLowerCase()) >= 0
        || list.indexOf(String(w.resourceName).toLowerCase()) >= 0;
}

// "ignore": k3 never touches it. "float": tracked, but left where KWin puts
// it. "tile": goes in the tree.
function classify(w) {
    if (w.specialWindow || !(w.normalWindow || w.dialog || w.utility)) return "ignore";
    // KWin's internal windows (e.g. the outline) have no class.
    if (!w.resourceClass || matchesClass(w, config.ignoreClasses)) return "ignore";
    // Fullscreen windows report resizeable=false, so only trust it otherwise.
    if (!w.normalWindow || w.transient || w.modal || w.skipTaskbar
        || (!w.resizeable && !w.fullScreen) || matchesClass(w, config.floatClasses))
        return "float";
    return "tile";
}

// The space a window should be tiled in right now, or null when it shouldn't
// be tiled (floating, minimized, on several or all desktops).
function wantedKey(c) {
    const w = c.window;
    if (c.floating || w.minimized || w.desktops.length !== 1 || !w.output) return null;
    return spaceKey(w.output, w.desktops[0]);
}

// Move the window's leaf to the space it belongs in now.
function sync(c) {
    const key = wantedKey(c);
    if (key === c.key) return;
    if (c.key) detachClient(c);
    if (key) attachClient(c, key);
}

function attachClient(c, key) {
    let s = spaces.get(key);
    if (!s) {
        s = { root: newRoot("splith"), output: c.window.output, desktop: c.window.desktops[0] };
        spaces.set(key, s);
    }
    // i3: a new window goes right after the focused one.
    const target = focusedLeaf(s.root);
    if (target) insertAfter(target, c.leaf);
    else insertChild(s.root, c.leaf);
    if (c.window.active) focusNode(c.leaf);
    c.key = key;
    retile(s);
}

function detachClient(c) {
    const s = spaces.get(c.key);
    removeNode(c.leaf);
    if (s.root.children.length === 0) spaces.delete(c.key);
    else retile(s);
    c.key = null;
}

function retile(s) {
    if (adopting) return;
    const area = workspace.clientArea(KWin.MaximizeArea, s.output, s.desktop);
    layoutRects(s.root, area, config.gapsInner, config.gapsOuter).forEach(function (rect, id) {
        const w = clients.get(id).window;
        // Fullscreen and maximized windows keep their slot; KDE owns their
        // geometry until they're restored.
        if (w.fullScreen || w.maximizeMode !== 0) return;
        // KWin reports fractional geometry; anything within a pixel is done.
        const g = w.frameGeometry;
        if (Math.abs(g.x - rect.x) >= 1 || Math.abs(g.y - rect.y) >= 1
            || Math.abs(g.width - rect.width) >= 1 || Math.abs(g.height - rect.height) >= 1)
            w.frameGeometry = rect;
    });
}

function retileClient(c) {
    if (c.key) retile(spaces.get(c.key));
}

function retileVisible() {
    workspace.screens.forEach(function (output) {
        const s = spaces.get(spaceKey(output, workspace.currentDesktopForScreen(output)));
        if (s) retile(s);
    });
}

function addWindow(w) {
    const kind = classify(w);
    if (kind === "ignore") return;
    log(kind, w.resourceClass);
    const c = { window: w, floating: kind === "float", leaf: newLeaf(windowId(w)), key: null };
    clients.set(windowId(w), c);
    if (!c.floating) {
        // Some apps restore a maximized state on launch; tiled windows aren't.
        if (w.maximizeMode !== 0) w.setMaximize(false, false);
        if (w.tile) w.tile.unmanage(w);
    }
    w.desktopsChanged.connect(function () { sync(c); });
    w.outputChanged.connect(function () { sync(c); });
    w.minimizedChanged.connect(function () { sync(c); });
    w.fullScreenChanged.connect(function () { retileClient(c); });
    w.maximizedChanged.connect(function () { retileClient(c); });
    // A tiled window dragged or resized with the mouse snaps back.
    w.interactiveMoveResizeFinished.connect(function () { retileClient(c); });
    // So does one quick-tiled by KDE (e.g. Meta+arrow).
    w.tileChanged.connect(function () {
        if (c.key && w.tile) {
            w.tile.unmanage(w);
            retileClient(c);
        }
    });
    sync(c);
}

function removeWindow(w) {
    const c = clients.get(windowId(w));
    if (!c) return;
    if (c.key) detachClient(c);
    clients.delete(windowId(w));
}

function start() {
    adopting = true;
    workspace.windowList().forEach(addWindow);
    adopting = false;
    spaces.forEach(retile);

    // windowActivated arrives before windowAdded for a new window; that
    // window isn't known yet, and attachClient focuses it instead.
    workspace.windowActivated.connect(function (w) {
        const c = w && clients.get(windowId(w));
        if (c && c.key) focusNode(c.leaf);
    });
    workspace.windowAdded.connect(addWindow);
    workspace.windowRemoved.connect(removeWindow);
    workspace.currentDesktopChanged.connect(retileVisible);
    workspace.screensChanged.connect(retileVisible);
    workspace.virtualScreenGeometryChanged.connect(retileVisible);
}
