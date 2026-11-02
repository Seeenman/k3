// k3 container tree: the i3-style model of one workspace (output x desktop)
// and the layout math that turns it into window rects. PURE: no KWin API in
// here, so test/tst_tree.qml can exercise it directly. See PLAN.md §5.1-5.2.
//
// Nodes are plain objects:
//   root       { type: "root", layout, children, weights, focus, parent: null }
//   container  { type: "con",  layout, children, weights, focus, parent, pendingSplit }
//   leaf       { type: "leaf", id, parent }
// layout is "splith", "splitv" or "tabbed". weights[i] is children[i]'s share
// of the split axis; they sum to 1. focus holds the same nodes as children,
// most recently focused first. A tabbed container remembers the split layout
// it came from in splitLayout.

const MIN_WEIGHT = 0.05;   // no child is resized below 5% of its parent

function newRoot(layout) {
    return { type: "root", layout: layout, children: [], weights: [], focus: [], parent: null };
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
// Directions are "left", "right", "up", "down". Tabbed containers count as
// horizontal, as in i3: left/right moves between tabs.

function axisOf(con) { return con.layout === "splitv" ? "v" : "h"; }
function dirAxis(dir) { return dir === "left" || dir === "right" ? "h" : "v"; }
function isForward(dir) { return dir === "right" || dir === "down"; }

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
// container, or step out of the current one. Returns false when node is
// already at the edge of the workspace.
function moveNode(node, dir) {
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
    // with everything else wrapped up on the far side.
    detach(node);
    normalize(parent);
    let wrapper = null;
    if (axisOf(root) !== dirAxis(dir)) {
        wrapper = newContainer(root.layout);
        wrapper.splitLayout = root.splitLayout;
        wrapper.children = root.children;
        wrapper.weights = root.weights;
        wrapper.focus = root.focus;
        wrapper.children.forEach(function (c) { c.parent = wrapper; });
        root.layout = dirAxis(dir) === "h" ? "splith" : "splitv";
        root.children = [];
        root.weights = [];
        root.focus = [];
        insertChild(root, wrapper);
    }
    insertChild(root, node, forward ? root.children.length : 0);
    if (wrapper) normalize(wrapper);
    focusNode(node);
    return true;
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
    if (parent.children.length === 1) {
        parent.layout = layout;
        return;
    }
    const con = newContainer(layout);
    con.pendingSplit = true;
    parent.children[parent.children.indexOf(node)] = con;
    parent.focus[parent.focus.indexOf(node)] = con;
    con.parent = parent;
    node.parent = null;
    insertChild(con, node);
}

// i3 "layout toggle split" on node's container. A tabbed container goes back
// to its split layout.
function toggleSplit(node) {
    const con = node.parent;
    if (con.layout === "tabbed") con.layout = con.splitLayout || "splith";
    else con.layout = con.layout === "splith" ? "splitv" : "splith";
}

// i3 "layout tabbed", as a toggle on node's container.
function toggleTabbed(node) {
    const con = node.parent;
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
    const w = n.parent.weights;
    const i = n.parent.children.indexOf(n);
    const j = i + 1 < w.length ? i + 1 : i - 1;
    const d = Math.max(MIN_WEIGHT - w[i], Math.min(delta, w[j] - MIN_WEIGHT));
    w[i] += d;
    w[j] -= d;
    return true;
}

// Map of leaf id -> integer rect {x, y, width, height} for every leaf under
// root, inside area shrunk by gapsOuter, with gapsInner between siblings.
function layoutRects(root, area, gapsInner, gapsOuter) {
    const x = Math.round(area.x + gapsOuter);
    const y = Math.round(area.y + gapsOuter);
    const rect = {
        x: x,
        y: y,
        width: Math.round(area.x + area.width - gapsOuter) - x,
        height: Math.round(area.y + area.height - gapsOuter) - y
    };
    const rects = new Map();
    place(root, rect, gapsInner, rects);
    return rects;
}

function place(node, rect, gap, rects) {
    if (node.type === "leaf") {
        rects.set(node.id, rect);
        return;
    }
    if (node.layout === "tabbed") {
        node.children.forEach(function (c) { place(c, rect, gap, rects); });
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
            : { x: rect.x, y: a, width: rect.width, height: b - a }, gap, rects);
    });
}
