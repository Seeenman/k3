// KWin side of k3: decides which windows to tile, keeps one tree per
// (output, desktop) in sync with window events, and applies the layout.
// See PLAN.md §5.3-5.4.

// A space keeps the output's name and the desktop's id, not the objects: KWin
// replaces an output's object when the monitor is replugged.
const spaces = new Map();   // spaceKey -> { key, root, outputName, desktopId, area }
const clients = new Map();  // window id -> { window, floating, leaf, key, home, ... }
let adopting = false;       // true while start() adopts existing windows
let holdSync = false;       // true while k3 moves windows whose leaves it already placed

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

// Move the window's leaf to the space it belongs in now. A window that leaves
// on its own also leaves the group it was evacuated with (c.home).
function sync(c) {
    if (holdSync) return;
    const key = wantedKey(c);
    if (key === c.key) return;
    if (c.key) detachClient(c);
    if (key) attachClient(c, key);
    c.home = null;
}

// The space for key, created (in the default layout) if it doesn't exist.
function spaceFor(key, outputName, desktopId) {
    let s = spaces.get(key);
    if (!s) {
        s = { key: key, root: newRoot("splith", config.defaultLayout === "btree"),
              outputName: outputName, desktopId: desktopId, area: null };
        spaces.set(key, s);
    }
    return s;
}

// What placeNode and rebuildLayout need to see the space's window shapes, or
// null while its output is gone.
function spaceGeometry(s) {
    const area = spaceArea(s);
    return area && { area: area, gapsInner: config.gapsInner, gapsOuter: config.gapsOuter,
                     tabPadding: config.tabPadding };
}

// A new window goes next to the focused one: after it (i3), or halving it in
// a binary tree. While adopting, everything goes in a row; start() then
// rebuilds the binary tree spaces.
function attachClient(c, key) {
    const s = spaceFor(key, c.window.output.name, c.window.desktops[0].id);
    placeNode(s.root, c.leaf, adopting ? null : spaceGeometry(s));
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

function outputNamed(name) {
    return workspace.screens.find(function (o) { return o.name === name; }) || null;
}

// The space's usable screen area, or null while its output or desktop is gone
// (its windows are then on their way elsewhere).
function spaceArea(s) {
    const output = outputNamed(s.outputName);
    const desktop = workspace.desktops.find(function (d) { return d.id === s.desktopId; });
    return output && desktop ? workspace.clientArea(KWin.MaximizeArea, output, desktop) : null;
}

// s.area: the area the space was last laid out in (see watchAreas).
function retile(s) {
    const area = spaceArea(s);
    if (adopting || !area) return;
    s.area = copyRect(area);
    layoutRects(s.root, area, config.gapsInner, config.gapsOuter, config.tabPadding).forEach(function (rect, id) {
        const c = clients.get(id);
        const w = c.window;
        // Fullscreen and maximized windows keep their slot; KDE owns their
        // geometry until they're restored.
        if (w.fullScreen || w.maximizeMode !== 0) return;
        // A window KWin has put on another screen is in transit (its sync is
        // pending, see scheduleSync); tiling it here would pull it back.
        if (!w.output || w.output.name !== s.outputName) return;
        // Skip only a window that's in place (KWin reports fractional
        // geometry; within a pixel is in place) and has no other request of
        // k3's pending: geometry lags behind requests, so a window can still
        // read as being at rect while an older request elsewhere is on its way.
        const g = w.frameGeometry;
        const inPlace = Math.abs(g.x - rect.x) < 1 && Math.abs(g.y - rect.y) < 1
            && Math.abs(g.width - rect.width) < 1 && Math.abs(g.height - rect.height) < 1;
        if (inPlace && sameRect(c.lastRect, rect)) return;
        c.lastRect = rect;
        w.frameGeometry = rect;
    });
}

function retileClient(c) {
    if (c.key) retile(spaces.get(c.key));
}

// The spaces on screen right now: one per output at most.
function visibleSpaces() {
    return workspace.screens.map(function (output) {
        return spaces.get(spaceKey(output, workspace.currentDesktopForScreen(output)));
    }).filter(function (s) { return s; });
}

function retileVisible() {
    visibleSpaces().forEach(retile);
}

// KWin has no signal for a change in a screen's usable area: a panel
// appearing (plasmashell creates a replugged screen's panel after the screen,
// and may start after k3), hiding or changing size. So once a second, retile
// each visible space whose area isn't the one it was laid out in.
const areaTimer = new QTimer();
function watchAreas() {
    areaTimer.interval = 1000;
    areaTimer.timeout.connect(guarded(function () {
        visibleSpaces().forEach(function (s) {
            if (!sameRect(spaceArea(s), s.area)) retile(s);
        });
    }));
    areaTimer.start();
}

// --- moving between screens, and hotplug ------------------------------------

// Move node, part of space s, with its windows into the layout of output and
// desktop, next to that layout's focused window (placeNode). k3 places the
// subtree itself and holds sync() off while KWin moves the windows, so they
// aren't re-filed one by one. node may be s.root: its whole content moves.
// anchor: the leaf to place it next to (default: the focused one). Returns
// { space, node }: the target space and the node that moved (a new container
// if node was s.root; detached if an empty target's root took it over).
function moveSubtree(node, s, output, desktop, anchor) {
    const key = spaceKey(output, desktop);
    const moved = node === s.root ? takeContent(s.root) : node;
    const ids = leaves(moved).map(function (l) { return l.id; });
    if (moved === node) removeNode(node);
    if (s.root.children.length === 0) spaces.delete(s.key);
    else retile(s);
    const t = spaceFor(key, output.name, desktop.id);
    placeNode(t.root, moved, spaceGeometry(t), anchor);
    holdSync = true;
    try {
        ids.forEach(function (id) {
            const c = clients.get(id);
            c.key = key;
            c.home = null;
            const w = c.window;
            if (w.output.name !== output.name) workspace.sendClientToScreen(w, output);
            if (w.desktops.length !== 1 || w.desktops[0].id !== desktop.id) w.desktops = [desktop];
        });
    } finally {
        holdSync = false;
    }
    // As in attachClient: the active window is the target's focused one now.
    ids.forEach(function (id) {
        const c = clients.get(id);
        if (c.window.active) focusNode(c.leaf);
    });
    retile(t);
    return { space: t, node: moved };
}

// A window's screen change is handled once KWin's burst of changes is over:
// an unplug or replug moves many windows in one go, before the screen list
// says so, and they're best moved as one layout (rehome).
const pendingSyncs = new Set();
const syncTimer = new QTimer();
function scheduleSync(c) {
    if (c) pendingSyncs.add(c);
    syncTimer.start();
}

function flushSyncs() {
    rehome();
    const pending = Array.from(pendingSyncs);
    pendingSyncs.clear();
    const touched = new Set();
    pending.forEach(function (c) {
        if (clients.get(windowId(c.window)) !== c) return;
        sync(c);
        if (c.key) touched.add(spaces.get(c.key));
    });
    // A window k3 placed before KWin had moved it (sendClientToScreen takes
    // effect when the client answers) was skipped as in transit; tile it now.
    touched.forEach(retile);
}

// Unplug: the layouts of a screen that's gone move as a whole, keeping their
// order and containers, into the layout where KWin put their windows. Each
// window remembers the screen it came from (c.home). Replug: the windows go
// back there as a whole too, whether or not KWin moved them back itself.
function rehome() {
    Array.from(spaces.values()).forEach(function (s) {
        if (spaces.get(s.key) === s && !outputNamed(s.outputName)) evacuate(s);
    });
    restoreHomes();
}

function evacuate(s) {
    const cs = leaves(s.root).map(function (l) { return clients.get(l.id); });
    // Where most of its windows went. Any going elsewhere (or nowhere, e.g.
    // minimized meanwhile) leave the layout first and are synced on their own.
    const counts = new Map();
    cs.forEach(function (c) {
        const k = wantedKey(c);
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    let target = null;
    counts.forEach(function (n, k) {
        if (target === null || n > counts.get(target)) target = k;
    });
    const loners = cs.filter(function (c) { return wantedKey(c) !== target; });
    loners.forEach(function (c) {
        removeNode(c.leaf);
        c.key = null;
    });
    const group = cs.filter(function (c) { return loners.indexOf(c) < 0; });
    if (group.length) {
        const w = group[0].window;
        moveSubtree(s.root, s, w.output, w.desktops[0]);
        group.forEach(function (c) { c.home = s.outputName; });
    } else {
        spaces.delete(s.key);
    }
    loners.forEach(sync);
}

function restoreHomes() {
    // Group the windows whose home screen is back by the space they're in.
    const groups = new Map();
    clients.forEach(function (c) {
        if (!c.home || !c.key) return;
        const s = spaces.get(c.key);
        if (s.outputName === c.home) {
            c.home = null;
            return;
        }
        if (!outputNamed(c.home)) return;
        const k = c.key + "\n" + c.home;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
    });
    groups.forEach(function (group) {
        const s = spaces.get(group[0].key);
        const output = outputNamed(group[0].home);
        const desktop = workspace.desktops.find(function (d) { return d.id === s.desktopId; });
        if (!output || !desktop) return;
        const lca = commonAncestor(group.map(function (c) { return c.leaf; }));
        if (leaves(lca).length === group.length) {
            moveSubtree(lca, s, output, desktop);
        } else {
            // Mixed with other windows by now: move them one by one, in order.
            const mine = group.map(function (c) { return c.leaf; });
            let anchor;
            leaves(s.root).filter(function (l) { return mine.indexOf(l) >= 0; }).forEach(function (l) {
                moveSubtree(l, s, output, desktop, anchor);
                anchor = l;
            });
        }
    });
}

function addWindow(w) {
    const kind = classify(w);
    if (kind === "ignore") return;
    log(kind, w.resourceClass);
    // floatRect: where the window goes if it's floated (its pre-tiling place).
    // keptAbove: k3 set keepAbove when floating it.
    // lastRect: the geometry k3 last requested for it (see retile).
    // home: the screen it was evacuated from on an unplug (see rehome).
    const c = { window: w, floating: kind === "float", leaf: newLeaf(windowId(w)), key: null,
                floatRect: copyRect(w.frameGeometry), keptAbove: false, lastRect: null,
                home: null };
    clients.set(windowId(w), c);
    if (!c.floating) claim(w);
    const onSync = guarded(function () { sync(c); });
    const onRetile = guarded(function () { retileClient(c); });
    w.desktopsChanged.connect(onSync);
    w.outputChanged.connect(guarded(function () { scheduleSync(c); }));
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
    syncTimer.singleShot = true;
    syncTimer.interval = 0;
    syncTimer.timeout.connect(guarded(flushSyncs));
    adopting = true;
    workspace.windowList().forEach(guarded(addWindow));
    adopting = false;
    spaces.forEach(function (s) {
        const geometry = spaceGeometry(s);
        if (s.root.btree && geometry) rebuildLayout(s.root, true, geometry);
        retile(s);
    });

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
    // A replugged screen may get its windows back (rehome).
    workspace.screensChanged.connect(guarded(function () {
        retileVisible();
        scheduleSync(null);
    }));
    workspace.virtualScreenGeometryChanged.connect(guarded(retileVisible));
    watchAreas();
}
