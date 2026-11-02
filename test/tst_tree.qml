import QtQuick
import QtTest
import "../src/tree.js" as Tree

TestCase {
    name: "Tree"

    // Build a root from a nested spec: "a" is a leaf, ["splitv", "b", "c"] a container.
    function build(layout, specs) {
        const root = Tree.newRoot(layout)
        specs.forEach(s => Tree.insertChild(root, node(s)))
        return root
    }
    function node(spec) {
        if (typeof spec === "string") return Tree.newLeaf(spec)
        const con = Tree.newContainer(spec[0])
        spec.slice(1).forEach(s => Tree.insertChild(con, node(s)))
        return con
    }
    function ids(n) { return Tree.leaves(n).map(l => l.id) }
    function find(root, id) { return Tree.leaves(root).find(l => l.id === id) }
    function shape(n) {
        return n.type === "leaf" ? n.id : n.layout + "(" + n.children.map(shape).join(",") + ")"
    }
    function fuzzyWeights(actual, expected) {
        compare(actual.length, expected.length)
        actual.forEach((w, i) => fuzzyCompare(w, expected[i], 1e-9))
    }
    function rect(x, y, width, height) { return { x: x, y: y, width: width, height: height } }

    // --- insert ---------------------------------------------------------------

    function test_insert_into_empty_root() {
        const root = build("splith", ["a"])
        compare(ids(root), ["a"])
        fuzzyWeights(root.weights, [1])
        compare(root.children[0].parent, root)
    }

    function test_insert_shares_space_equally() {
        const root = build("splith", ["a", "b", "c"])
        fuzzyWeights(root.weights, [1/3, 1/3, 1/3])
    }

    function test_insert_scales_existing_weights() {
        const root = build("splith", ["a", "b"])
        root.weights = [0.75, 0.25]
        Tree.insertChild(root, Tree.newLeaf("c"))
        fuzzyWeights(root.weights, [0.5, 1/6, 1/3])
    }

    function test_insert_after_sibling() {
        const root = build("splith", ["a", "b"])
        Tree.insertAfter(find(root, "a"), Tree.newLeaf("c"))
        compare(ids(root), ["a", "c", "b"])
    }

    function test_insert_after_inside_container() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.insertAfter(find(root, "b"), Tree.newLeaf("d"))
        compare(shape(root), "splith(a,splitv(b,d,c))")
    }

    function test_second_child_clears_pending_split() {
        const root = build("splith", ["a"])
        const con = Tree.newContainer("splitv")
        con.pendingSplit = true
        Tree.insertChild(root, con)
        Tree.insertChild(con, Tree.newLeaf("b"))
        verify(con.pendingSplit)
        Tree.insertChild(con, Tree.newLeaf("c"))
        verify(!con.pendingSplit)
    }

    // --- remove and normalize ----------------------------------------------

    function test_remove_renormalizes_weights() {
        const root = build("splith", ["a", "b", "c"])
        root.weights = [0.5, 0.25, 0.25]
        Tree.removeNode(find(root, "a"))
        compare(ids(root), ["b", "c"])
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_remove_last_leaf_leaves_empty_root() {
        const root = build("splith", ["a"])
        const a = find(root, "a")
        Tree.removeNode(a)
        compare(root.children.length, 0)
        compare(a.parent, null)
        compare(Tree.focusedLeaf(root), null)
    }

    function test_container_with_one_child_collapses() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        root.weights = [0.3, 0.7]
        Tree.removeNode(find(root, "c"))
        compare(shape(root), "splith(a,b)")
        fuzzyWeights(root.weights, [0.3, 0.7])
        compare(find(root, "b").parent, root)
    }

    function test_pending_split_container_survives_with_one_child() {
        const root = build("splith", ["a", "b"])
        const con = Tree.newContainer("splitv")
        con.pendingSplit = true
        Tree.insertChild(root, con)
        Tree.insertChild(con, Tree.newLeaf("c"))
        Tree.removeNode(find(root, "b"))
        compare(shape(root), "splith(a,splitv(c))")
    }

    function test_emptied_container_is_removed() {
        const root = build("splith", ["a", "b"])
        const con = Tree.newContainer("splitv")
        con.pendingSplit = true
        Tree.insertChild(root, con)
        Tree.insertChild(con, Tree.newLeaf("c"))
        Tree.removeNode(find(root, "c"))
        compare(shape(root), "splith(a,b)")
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_root_absorbs_only_child_container() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.removeNode(find(root, "a"))
        compare(shape(root), "splitv(b,c)")
        compare(root.type, "root")
        compare(find(root, "b").parent, root)
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_collapse_cascades_to_root() {
        const root = build("splith", ["a", ["splitv", "b", ["splith", "c", "d"]]])
        Tree.removeNode(find(root, "a"))
        Tree.removeNode(find(root, "b"))
        compare(shape(root), "splith(c,d)")
    }

    // --- focus ----------------------------------------------------------------

    function test_focused_leaf_defaults_to_first_inserted() {
        const root = build("splith", ["a", "b"])
        compare(Tree.focusedLeaf(root).id, "a")
    }

    function test_focus_node_updates_every_level() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.focusNode(find(root, "c"))
        compare(Tree.focusedLeaf(root).id, "c")
        Tree.focusNode(find(root, "a"))
        compare(Tree.focusedLeaf(root).id, "a")
        // Entering the container again lands on the window focused there last.
        compare(Tree.focusedLeaf(root.children[1]).id, "c")
    }

    function test_removing_focused_leaf_falls_back_to_previous() {
        const root = build("splith", ["a", "b", "c"])
        Tree.focusNode(find(root, "b"))
        Tree.focusNode(find(root, "c"))
        Tree.removeNode(find(root, "c"))
        compare(Tree.focusedLeaf(root).id, "b")
    }

    function test_focus_survives_collapse() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.focusNode(find(root, "b"))
        Tree.removeNode(find(root, "c"))
        compare(Tree.focusedLeaf(root).id, "b")
    }

    // --- layout ---------------------------------------------------------------

    function test_layout_single_window_fills_area_minus_outer_gap() {
        const rects = Tree.layoutRects(build("splith", ["a"]), rect(0, 0, 1600, 900), 4, 8)
        compare(rects.get("a"), rect(8, 8, 1584, 884))
    }

    function test_layout_splith_with_inner_gap() {
        const rects = Tree.layoutRects(build("splith", ["a", "b"]), rect(0, 0, 1000, 500), 10, 0)
        compare(rects.get("a"), rect(0, 0, 495, 500))
        compare(rects.get("b"), rect(505, 0, 495, 500))
    }

    function test_layout_splitv() {
        const rects = Tree.layoutRects(build("splitv", ["a", "b"]), rect(0, 100, 800, 600), 0, 0)
        compare(rects.get("a"), rect(0, 100, 800, 300))
        compare(rects.get("b"), rect(0, 400, 800, 300))
    }

    function test_layout_respects_weights() {
        const root = build("splith", ["a", "b"])
        root.weights = [0.25, 0.75]
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 500), 0, 0)
        compare(rects.get("a").width, 250)
        compare(rects.get("b"), rect(250, 0, 750, 500))
    }

    function test_layout_nested() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 600), 0, 0)
        compare(rects.get("a"), rect(0, 0, 500, 600))
        compare(rects.get("b"), rect(500, 0, 500, 300))
        compare(rects.get("c"), rect(500, 300, 500, 300))
    }

    function test_layout_tabbed_children_share_rect() {
        const root = build("splith", ["a", ["tabbed", "b", "c"]])
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 600), 0, 0)
        compare(rects.get("b"), rect(500, 0, 500, 600))
        compare(rects.get("c"), rect(500, 0, 500, 600))
    }

    function test_layout_rounds_and_covers_area_exactly() {
        // Three windows over an odd width and a fractional area (KWin reports
        // fractional geometry): integer rects, gaps intact, no seam at the end.
        const root = build("splith", ["a", "b", "c"])
        const rects = Tree.layoutRects(root, rect(0.4, 0, 1001.3, 500), 4, 4)
        const a = rects.get("a"), b = rects.get("b"), c = rects.get("c")
        ;[a, b, c].forEach(r => {
            verify(Number.isInteger(r.x) && Number.isInteger(r.width), JSON.stringify(r))
        })
        compare(a.x, 4)
        compare(b.x, a.x + a.width + 4)
        compare(c.x, b.x + b.width + 4)
        compare(c.x + c.width, Math.round(0.4 + 1001.3 - 4))
        verify(Math.max(a.width, b.width, c.width) - Math.min(a.width, b.width, c.width) <= 1)
    }
}
