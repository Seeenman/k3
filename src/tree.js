// k3 container tree: the i3-style model of one workspace (output x desktop)
// and the layout math that turns it into window rects. PURE: no KWin API in
// here, so test/tst_tree.qml can exercise it directly. See PLAN.md §5.1-5.2.
//
// Nodes are plain objects:
//   root       { type: "root", layout, children, weights, focus, parent: null, btree }
//   container  { type: "con",  layout, children, weights, focus, parent, pendingSplit }
//   leaf       { type: "leaf", id, parent }
// layout is "splith", "splitv" or "tabbed". weights[i] is children[i]'s share
// of the split axis; they sum to 1. focus holds the same nodes as children,
// most recently focused first. A tabbed container remembers the split layout
// it came from in splitLayout. A root with btree set is a binary tree
// workspace: a new window halves the focused one (placeNode).

const MIN_WEIGHT = 0.05;   // no child is resized below 5% of its parent

function newRoot(layout, btree) {
    return { type: "root", layout: layout, children: [], weights: [], focus: [], parent: null,
             btree: !!btree };
}

function newContainer(layout) {
    return { type: "con", layout: layout, children: [], weights: [], focus: [], parent: null,
             pendingSplit: false };
}

function newLeaf(id) {
    return { type: "leaf", id: id, parent: null };
}

// Insert node as parent's child at index (default: last). The newcomer gets
// 1/n of the space and the others shrink proportionally.
function insertChild(parent, node, index) {
    const n = parent.children.length + 1;
    if (index === undefined) index = n - 1;
    parent.weights = parent.weights.map(function (w) { return w * (n - 1) / n; });
    parent.weights.splice(index, 0, 1 / n);
    parent.children.splice(index, 0, node);
    parent.focus.push(node);
    node.parent = parent;
    if (parent.pendingSplit && n > 1) parent.pendingSplit = false;
}

function insertAfter(sibling, node) {
    insertChild(sibling.parent, node, sibling.parent.children.indexOf(sibling) + 1);
}

// Detach node from the tree, then tidy up the containers it leaves behind.
function removeNode(node) {
    const parent = node.parent;
    detach(node);
    normalize(parent);
}

function detach(node) {
    const parent = node.parent;
    const i = parent.children.indexOf(node);
    parent.children.splice(i, 1);
    parent.weights.splice(i, 1);
    parent.focus.splice(parent.focus.indexOf(node), 1);
    const sum = parent.weights.reduce(function (a, b) { return a + b; }, 0);
    parent.weights = parent.weights.map(function (w) {
        return sum > 0 ? w / sum : 1 / parent.weights.length;
    });
    node.parent = null;
}

// Empty containers disappear; a container left with one child is replaced by
// that child (unless split just created it and it awaits a second child); a
// root whose only child is a container takes that container's place.
function normalize(con) {
    if (con.type === "root") {
        const only = con.children.length === 1 ? con.children[0] : null;
        if (only && only.type === "con") {
            con.layout = only.layout;
            con.splitLayout = only.splitLayout;
            con.children = only.children;
            con.weights = only.weights;
            con.focus = only.focus;
            con.children.forEach(function (c) { c.parent = con; });
            only.parent = null;
        }
        return;
    }
    const parent = con.parent;
    if (con.children.length === 0) {
        detach(con);
        normalize(parent);
    } else if (con.children.length === 1 && !con.pendingSplit) {
        const child = con.children[0];
        const i = parent.children.indexOf(con);
        parent.children[i] = child;
        parent.focus[parent.focus.indexOf(con)] = child;
        child.parent = parent;
        normalize(parent);
    }
}

// Mark node as the most recently focused child at every level above it.
function focusNode(node) {
    for (let n = node; n.parent; n = n.parent) {
        const stack = n.parent.focus;
        stack.splice(stack.indexOf(n), 1);
        stack.unshift(n);
    }
}

// The leaf you land on when entering node: follow the focus stacks down.
function focusedLeaf(node) {
    while (node && node.type !== "leaf")
        node = node.focus[0];
    return node || null;
}

function leaves(node) {
    if (node.type === "leaf") return [node];
    return node.children.reduce(function (acc, c) { return acc.concat(leaves(c)); }, []);
}

function rootOf(node) {
    while (node.parent) node = node.parent;
    return node;
}

// --- i3 commands ------------------------------------------------------------
// Directions are "left", "right", "up", "down".

// splith is "h" and splitv "v". A tabbed container's tabs run across its
// parent's axis, so the parent's own direction keys still move between its
// parts (AeroSpace's rule, unlike i3); a tabbed root runs horizontally.
function axisOf(con) {
    if (con.layout === "tabbed") return con.parent && axisOf(con.parent) === "h" ? "v" : "h";
    return con.layout === "splitv" ? "v" : "h";
}
function dirAxis(dir) { return dir === "left" || dir === "right" ? "h" : "v"; }
function isForward(dir) { return dir === "right" || dir === "down"; }
function splitFor(dir) { return dirAxis(dir) === "h" ? "splith" : "splitv"; }

// The subtree next to node in direction dir: the sibling on that side under
// the nearest ancestor split along dir's axis. null at the workspace edge.
function neighbor(node, dir) {
    for (let n = node; n.parent; n = n.parent) {
        if (axisOf(n.parent) !== dirAxis(dir)) continue;
        const sibling = n.parent.children[n.parent.children.indexOf(n) + (isForward(dir) ? 1 : -1)];
        if (sibling) return sibling;
    }
    return null;
}

// i3 "move <dir>": swap with the neighbouring window, enter the neighbouring
// container, or step out of the current one; past the last tab, pop out of
// the tabs. Returns false when node is already at the edge of the workspace.
function moveNode(node, dir) {
    // A whole workspace (a selection that became one) is at every edge.
    if (!node.parent) return false;
    const parent = node.parent;
    const root = rootOf(node);
    const forward = isForward(dir);
    if (axisOf(parent) === dirAxis(dir)) {
        const i = parent.children.indexOf(node);
        const j = i + (forward ? 1 : -1);
        const sibling = parent.children[j];
        if (sibling && sibling.type === "leaf") {
            parent.children[i] = sibling;
            parent.children[j] = node;
            const w = parent.weights[i];
            parent.weights[i] = parent.weights[j];
            parent.weights[j] = w;
            return true;
        }
        if (sibling) {
            relocate(node, descendToward(sibling, dir), !forward);
            focusNode(node);
            return true;
        }
        // Past the last tab: split the tabs' place along dir's axis and put
        // node on that side. The remaining tabs now run the other way, or a
        // lone remaining tab becomes a plain window (AeroSpace).
        if (parent.layout === "tabbed" && parent.children.length > 1) {
            detach(node);
            const outer = wrap(parent, splitFor(dir));
            insertChild(outer, node, forward ? 1 : 0);
            normalize(outer.children[forward ? 0 : 1]);
            focusNode(node);
            return true;
        }
    }
    // Step out: land next to the nearest enclosing container whose parent is
    // split along dir's axis.
    let n = parent;
    while (n.parent && axisOf(n.parent) !== dirAxis(dir)) n = n.parent;
    if (n.parent) {
        relocate(node, n, forward);
        focusNode(node);
        return true;
    }
    if (axisOf(root) === dirAxis(dir) || root.children.length < 2) return false;
    // Nothing encloses node along dir's axis: re-orient the root to that axis,
    // with everything else wrapped up on the far side. (Removing node may
    // leave the root absorbing a container that already has that axis; a
    // tabbed one still gets wrapped, or node would become a tab.)
    detach(node);
    normalize(parent);
    let content = null;
    if (axisOf(root) !== dirAxis(dir) || root.layout === "tabbed") {
        content = wrap(root, splitFor(dir)).children[0];
    }
    insertChild(root, node, forward ? root.children.length : 0);
    if (content) normalize(content);
    focusNode(node);
    return true;
}

// Push con's content one level down: a new container with layout takes con's
// place and holds con as its only child. The root can't move, so it becomes
// that outer container itself and its content moves into a new child.
// Returns the outer container.
function wrap(con, layout) {
    if (con.type === "root") {
        const inner = newContainer(con.layout);
        inner.splitLayout = con.splitLayout;
        inner.children = con.children;
        inner.weights = con.weights;
        inner.focus = con.focus;
        inner.children.forEach(function (c) { c.parent = inner; });
        con.layout = layout;
        con.children = [];
        con.weights = [];
        con.focus = [];
        insertChild(con, inner);
        return con;
    }
    const parent = con.parent;
    const outer = newContainer(layout);
    parent.children[parent.children.indexOf(con)] = outer;
    parent.focus[parent.focus.indexOf(con)] = outer;
    outer.parent = parent;
    con.parent = null;
    insertChild(outer, con);
    return outer;
}

// The leaf inside node nearest to where we enter from: along dir's axis the
// near edge, across it the focused child (as i3 does).
function descendToward(node, dir) {
    while (node.type !== "leaf") {
        node = axisOf(node) === dirAxis(dir)
            ? node.children[isForward(dir) ? 0 : node.children.length - 1]
            : node.focus[0];
    }
    return node;
}

// Take node out of its container and put it next to ref.
function relocate(node, ref, after) {
    const oldParent = node.parent;
    detach(node);
    insertChild(ref.parent, node, ref.parent.children.indexOf(ref) + (after ? 1 : 0));
    normalize(oldParent);
}

// i3 "split h|v": the next window opened next to node goes in this direction.
// A lone child just re-orients its parent; otherwise node is wrapped in a new
// container that waits for a second child.
function splitNode(node, layout) {
    const parent = node.parent;
    if (!parent) return;
    if (parent.children.length === 1) {
        parent.layout = layout;
        return;
    }
    wrap(node, layout).pendingSplit = true;
}

// i3 "layout toggle split" on node's container (on node itself if it's a
// root). A tabbed container goes back to its split layout.
function toggleSplit(node) {
    const con = node.parent || node;
    if (con.layout === "tabbed") con.layout = con.splitLayout || "splith";
    else con.layout = con.layout === "splith" ? "splitv" : "splith";
}

// i3 "layout tabbed", as a toggle on node's container (on node itself if
// it's a root).
function toggleTabbed(node) {
    const con = node.parent || node;
    if (con.layout === "tabbed") {
        con.layout = con.splitLayout || "splith";
    } else {
        con.splitLayout = con.layout;
        con.layout = "tabbed";
    }
}

// i3 "resize grow|shrink width|height": move delta (a fraction of the parent,
// negative to shrink) between node and its next sibling (the previous one for
// a last child), in the nearest ancestor split along axis ("h" for width, "v"
// for height). Returns false when no such ancestor exists.
function resizeNode(node, axis, delta) {
    let n = node;
    while (n.parent && (n.parent.layout === "tabbed" || axisOf(n.parent) !== axis
                        || n.parent.children.length < 2))
        n = n.parent;
    if (!n.parent) return false;
    const i = n.parent.children.indexOf(n);
    tradeWeight(n.parent, i, i + 1 < n.parent.children.length ? i + 1 : i - 1, delta);
    return true;
}

// Move delta of parent's weight from child j to child i (negative: from i to
// j), keeping both at MIN_WEIGHT or more.
function tradeWeight(parent, i, j, delta) {
    const w = parent.weights;
    const d = Math.max(MIN_WEIGHT - w[i], Math.min(delta, w[j] - MIN_WEIGHT));
    w[i] += d;
    w[j] -= d;
}

// Mouse resize of one edge: move node's edge on side dir out by px pixels (in
// for a negative px). The room comes from the neighbor on that side, under
// the nearest ancestor split along dir's axis. As with resizeNode, whatever
// shares that ancestor's child with node grows too, and a tabbed container
// grows as a whole. Returns false at the workspace edge.
function resizeEdge(root, node, dir, px, geometry) {
    const step = isForward(dir) ? 1 : -1;
    let n = node;
    while (n.parent && (n.parent.layout === "tabbed" || axisOf(n.parent) !== dirAxis(dir)
                        || !n.parent.children[n.parent.children.indexOf(n) + step]))
        n = n.parent;
    if (!n.parent) return false;
    const parent = n.parent;
    const g = geometry;
    const r = nodeRect(root, parent, g.area, g.gapsInner, g.gapsOuter, g.tabPadding);
    const free = (dirAxis(dir) === "h" ? r.width : r.height) - g.gapsInner * (parent.children.length - 1);
    const i = parent.children.indexOf(n);
    tradeWeight(parent, i, i + step, px / free);
    return true;
}

// A mouse resize, given the window's rect when it began (from) and at its end
// (to): each edge the user dragged moves node's edge by as much (resizeEdge).
// A resize drags one edge per axis, the one that moved further; an axis whose
// size didn't change wasn't resized, so a plain move does nothing.
function dragResize(root, node, from, to, geometry) {
    [{ near: "left", far: "right", pos: "x", size: "width" },
     { near: "up", far: "down", pos: "y", size: "height" }].forEach(function (a) {
        if (Math.abs(to[a.size] - from[a.size]) < 1) return;
        const near = from[a.pos] - to[a.pos];
        const far = to[a.pos] + to[a.size] - (from[a.pos] + from[a.size]);
        if (Math.abs(near) > Math.abs(far)) resizeEdge(root, node, a.near, near, geometry);
        else resizeEdge(root, node, a.far, far, geometry);
    });
}

// --- stacking tabs ----------------------------------------------------------
// Tabs share one rect, so the stacking order decides what shows.

// The tab leaf shows in: the visible child of its outermost tabbed ancestor
// (after focusNode(leaf)), or null when no tabbed container holds it.
function shownTab(leaf) {
    let tab = null;
    for (let n = leaf; n.parent; n = n.parent)
        if (n.parent.layout === "tabbed") tab = n;
    return tab;
}

// node's leaves in the order to raise them so the right ones end up on top:
// in each tabbed container the hidden tabs first, then the visible one.
function raiseOrder(node) {
    if (node.type === "leaf") return [node];
    const kids = node.layout !== "tabbed" ? node.children
        : node.children.filter(function (c) { return c !== node.focus[0]; }).concat([node.focus[0]]);
    return kids.reduce(function (acc, c) { return acc.concat(raiseOrder(c)); }, []);
}

// --- placing new nodes ------------------------------------------------------
// geometry is { area, gapsInner, gapsOuter, tabPadding }: what layoutRects
// needs to know a window's current shape.

// Put node (a new window, or a subtree moved in) into root next to anchor
// (default: root's focused leaf). i3 puts it after anchor in anchor's
// container. A binary tree root halves anchor's place instead, unless the
// user split anchor's container for the next window or it holds tabs: those
// get a plain insert, as in i3. Without geometry, a binary tree falls back to
// i3 placement too. Into an empty root, a container's content becomes the
// root's (normalize); the container is then detached (parent null).
function placeNode(root, node, geometry, anchor) {
    if (anchor === undefined) anchor = focusedLeaf(root);
    if (!anchor) {
        insertChild(root, node);
        normalize(root);
        return;
    }
    const con = anchor.parent;
    if (root.btree && geometry && con.layout !== "tabbed" && !con.pendingSplit) splitBeside(root, anchor, node, geometry);
    else insertAfter(anchor, node);
}

// Binary tree step: node takes the second half of target's place, beside it
// if target is wider than tall, else below it. A lone child just turns its
// parent the right way.
function splitBeside(root, target, node, geometry) {
    const g = geometry;
    const r = nodeRect(root, target, g.area, g.gapsInner, g.gapsOuter, g.tabPadding);
    const split = r.width >= r.height ? "splith" : "splitv";
    if (target.parent.children.length === 1) {
        target.parent.layout = split;
        insertAfter(target, node);
        return;
    }
    insertChild(wrap(target, split), node);
}

// Rebuild root from its windows, in their current order: as a binary tree
// (each window halving the one before, along its longer side) or as a single
// row. Containers and tabs are dropped; the focused window stays focused.
function rebuildLayout(root, btree, geometry) {
    const all = leaves(root);
    const focused = focusedLeaf(root);
    root.layout = "splith";
    root.splitLayout = undefined;
    root.children = [];
    root.weights = [];
    root.focus = [];
    root.btree = btree;
    all.forEach(function (leaf, i) {
        leaf.parent = null;
        if (i > 0 && btree) splitBeside(root, all[i - 1], leaf, geometry);
        else insertChild(root, leaf);
    });
    if (focused) focusNode(focused);
}

// Empty root into one node: its only child, or a new container with root's
// layout and children. The root keeps its btree mode.
function takeContent(root) {
    let node;
    if (root.children.length === 1) {
        node = root.children[0];
    } else {
        node = newContainer(root.layout);
        node.splitLayout = root.splitLayout;
        node.children = root.children;
        node.weights = root.weights;
        node.focus = root.focus;
        node.children.forEach(function (c) { c.parent = node; });
    }
    root.children = [];
    root.weights = [];
    root.focus = [];
    node.parent = null;
    return node;
}

// The lowest node that contains all of nodes (in one tree), or null.
function commonAncestor(nodes) {
    const paths = nodes.map(function (n) {
        const path = [];
        for (; n; n = n.parent) path.unshift(n);
        return path;
    });
    let lca = null;
    for (let i = 0; paths.length && paths.every(function (p) { return p[i] && p[i] === paths[0][i]; }); i++)
        lca = paths[0][i];
    return lca;
}

// --- screens ----------------------------------------------------------------

// Index of the rect in candidates nearest to from in direction dir: wholly on
// that side and overlapping it across dir's axis (screens side by side, not
// diagonal). -1 if there is none.
function nearestInDirection(from, candidates, dir) {
    let best = -1;
    let bestGap = Infinity;
    candidates.forEach(function (r, i) {
        const gap = dir === "left" ? from.x - (r.x + r.width)
                  : dir === "right" ? r.x - (from.x + from.width)
                  : dir === "up" ? from.y - (r.y + r.height)
                  : r.y - (from.y + from.height);
        const overlaps = dirAxis(dir) === "h"
            ? r.y < from.y + from.height && from.y < r.y + r.height
            : r.x < from.x + from.width && from.x < r.x + r.width;
        if (gap >= 0 && overlaps && gap < bestGap) {
            best = i;
            bestGap = gap;
        }
    });
    return best;
}

// --- layout -----------------------------------------------------------------

// Whether a and b are the same rect. A missing rect (null/undefined) never
// matches, so "no rect yet" always counts as a change.
function sameRect(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Map of leaf id -> integer rect {x, y, width, height} for every leaf under
// root, inside area shrunk by gapsOuter, with gapsInner between siblings and
// tabPadding (default 0) for the slivers of tabs behind the visible one.
function layoutRects(root, area, gapsInner, gapsOuter, tabPadding) {
    const x = Math.round(area.x + gapsOuter);
    const y = Math.round(area.y + gapsOuter);
    const rect = {
        x: x,
        y: y,
        width: Math.round(area.x + area.width - gapsOuter) - x,
        height: Math.round(area.y + area.height - gapsOuter) - y
    };
    const rects = new Map();
    place(root, rect, gapsInner, tabPadding || 0, rects);
    return rects;
}

// The rect node covers in root's layout: the union of its leaves' rects.
function nodeRect(root, node, area, gapsInner, gapsOuter, tabPadding) {
    const rects = layoutRects(root, area, gapsInner, gapsOuter, tabPadding);
    return leaves(node).map(function (l) { return rects.get(l.id); }).reduce(function (a, b) {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        return {
            x: x,
            y: y,
            width: Math.max(a.x + a.width, b.x + b.width) - x,
            height: Math.max(a.y + a.height, b.y + b.height) - y
        };
    });
}

function place(node, rect, gap, pad, rects) {
    if (node.type === "leaf") {
        rects.set(node.id, rect);
        return;
    }
    if (node.layout === "tabbed") {
        // Accordion (AeroSpace): the visible tab is inset by pad on each side
        // that has tabs, and those tabs sit pad further out behind it, so a
        // sliver of them shows. All tabs keep one size: switching only moves.
        const horizontal = axisOf(node) === "h";
        const shown = node.children.indexOf(node.focus[0]);
        const before = shown > 0 ? pad : 0;
        const after = shown < node.children.length - 1 ? pad : 0;
        const size = (horizontal ? rect.width : rect.height) - before - after;
        node.children.forEach(function (child, i) {
            const offset = i < shown ? 0 : i === shown ? before : before + after;
            place(child, horizontal
                ? { x: rect.x + offset, y: rect.y, width: size, height: rect.height }
                : { x: rect.x, y: rect.y + offset, width: rect.width, height: size }, gap, pad, rects);
        });
        return;
    }
    // Edges come from the running weight total, so rounding never accumulates
    // and the last child ends exactly on the far edge.
    const horizontal = node.layout === "splith";
    const start = horizontal ? rect.x : rect.y;
    const free = (horizontal ? rect.width : rect.height) - gap * (node.children.length - 1);
    let total = 0;
    node.children.forEach(function (child, i) {
        const a = start + Math.round(total * free) + i * gap;
        total += node.weights[i];
        const b = start + Math.round(total * free) + i * gap;
        place(child, horizontal
            ? { x: a, y: rect.y, width: b - a, height: rect.height }
            : { x: rect.x, y: a, width: rect.width, height: b - a }, gap, pad, rects);
    });
}
