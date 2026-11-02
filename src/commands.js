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
    const area = workspace.clientArea(KWin.MaximizeArea, s.output, s.desktop);
    const r = nodeRect(s.root, selection.node, area, config.gapsInner, config.gapsOuter);
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
        if (node.parent.type === "root") return;
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

function focusDirection(dir) {
    onTarget(function (node) {
        const target = neighbor(node, dir);
        if (target) activate(focusedLeaf(target));
    });
}

function moveDirection(dir) {
    onTarget(function (node, s) {
        if (moveNode(node, dir)) retile(s);
    });
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
