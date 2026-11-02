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
// most recently focused first.

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
