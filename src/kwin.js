// KWin side of k3: decides which windows to tile, keeps one tree per
// (output, desktop) in sync with window events, and applies the layout.
// See PLAN.md §5.3-5.4.

// A space keeps the output's name and the desktop's id, not the objects: KWin
// replaces an output's object when the monitor is replugged.
const spaces = new Map();   // spaceKey -> { root, outputName, desktopId }
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
        s = { root: newRoot("splith"), outputName: c.window.output.name,
              desktopId: c.window.desktops[0].id };
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

// The space's usable screen area, or null while its output or desktop is gone
// (its windows are then on their way elsewhere).
function spaceArea(s) {
    const output = workspace.screens.find(function (o) { return o.name === s.outputName; });
    const desktop = workspace.desktops.find(function (d) { return d.id === s.desktopId; });
    return output && desktop ? workspace.clientArea(KWin.MaximizeArea, output, desktop) : null;
}

function retile(s) {
    const area = spaceArea(s);
    if (adopting || !area) return;
    layoutRects(s.root, area, config.gapsInner, config.gapsOuter, config.tabPadding).forEach(function (rect, id) {
        const c = clients.get(id);
        const w = c.window;
        // Fullscreen and maximized windows keep their slot; KDE owns their
        // geometry until they're restored.
        if (w.fullScreen || w.maximizeMode !== 0) return;
        // Skip only a window that's in place (KWin reports fractional
        // geometry; within a pixel is in place) and has no other request of
        // k3's pending: geometry lags behind requests, so a window can still
        // read as being at rect while an older request elsewhere is on its way.
        const g = w.frameGeometry;
        const inPlace = Math.abs(g.x - rect.x) < 1 && Math.abs(g.y - rect.y) < 1
            && Math.abs(g.width - rect.width) < 1 && Math.abs(g.height - rect.height) < 1;
        const requested = c.lastRect && c.lastRect.x === rect.x && c.lastRect.y === rect.y
            && c.lastRect.width === rect.width && c.lastRect.height === rect.height;
        if (inPlace && requested) return;
        c.lastRect = rect;
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
    // floatRect: where the window goes if it's floated (its pre-tiling place).
    // keptAbove: k3 set keepAbove when floating it.
    // lastRect: the geometry k3 last requested for it (see retile).
    const c = { window: w, floating: kind === "float", leaf: newLeaf(windowId(w)), key: null,
                floatRect: copyRect(w.frameGeometry), keptAbove: false, lastRect: null };
    clients.set(windowId(w), c);
    if (!c.floating) claim(w);
    const onSync = guarded(function () { sync(c); });
    const onRetile = guarded(function () { retileClient(c); });
    w.desktopsChanged.connect(onSync);
    w.outputChanged.connect(onSync);
    w.minimizedChanged.connect(onSync);
    w.fullScreenChanged.connect(onRetile);
    w.maximizedChanged.connect(onRetile);
    // A tiled window dragged or resized with the mouse snaps back.
    w.interactiveMoveResizeFinished.connect(onRetile);
    // So does one quick-tiled by KDE (e.g. Meta+arrow).
    w.tileChanged.connect(guarded(function () {
        if (c.key && w.tile) {
            w.tile.unmanage(w);
            retileClient(c);
        }
    }));
    sync(c);
}

// Undo KDE states that conflict with tiling: some apps restore a maximized
// state on launch, and KWin may have quick-tiled the window.
function claim(w) {
    if (w.maximizeMode !== 0) w.setMaximize(false, false);
    if (w.tile) w.tile.unmanage(w);
}

function copyRect(r) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function removeWindow(w) {
    const c = clients.get(windowId(w));
    if (!c) return;
    if (c.key) detachClient(c);
    clients.delete(windowId(w));
}

function start() {
    adopting = true;
    workspace.windowList().forEach(guarded(addWindow));
    adopting = false;
    spaces.forEach(retile);

    // windowActivated arrives before windowAdded for a new window; that
    // window isn't known yet, and attachClient focuses it instead.
    workspace.windowActivated.connect(guarded(function (w) {
        const c = w && clients.get(windowId(w));
        if (!c || !c.key) return;
        focusNode(c.leaf);
        // A tabbed layout depends on which tab is focused.
        retile(spaces.get(c.key));
    }));
    workspace.windowAdded.connect(guarded(addWindow));
    workspace.windowRemoved.connect(guarded(removeWindow));
    workspace.currentDesktopChanged.connect(guarded(retileVisible));
    workspace.screensChanged.connect(guarded(retileVisible));
    workspace.virtualScreenGeometryChanged.connect(guarded(retileVisible));
}
