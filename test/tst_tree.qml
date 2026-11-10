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

    // --- neighbor (focus <dir>) -------------------------------------------------

    function test_neighbor_siblings() {
        const root = build("splith", ["a", "b", "c"])
        compare(Tree.neighbor(find(root, "b"), "left").id, "a")
        compare(Tree.neighbor(find(root, "b"), "right").id, "c")
        compare(Tree.neighbor(find(root, "b"), "up"), null)
        compare(Tree.neighbor(find(root, "a"), "left"), null)
    }

    function test_neighbor_climbs_to_matching_axis() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        compare(Tree.neighbor(find(root, "c"), "left").id, "a")
        compare(Tree.neighbor(find(root, "c"), "up").id, "b")
        compare(Tree.neighbor(find(root, "b"), "up"), null)
        compare(Tree.neighbor(find(root, "a"), "right"), root.children[1])
    }

    function test_focus_into_container_lands_on_its_focused_window() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.focusNode(find(root, "c"))
        Tree.focusNode(find(root, "a"))
        compare(Tree.focusedLeaf(Tree.neighbor(find(root, "a"), "right")).id, "c")
    }

    function test_neighbor_in_tabbed_steps_through_tabs() {
        // Inside a left/right split the tabs run up/down, so left/right still
        // moves between the split's parts.
        const root = build("splith", ["a", ["tabbed", "b", "c"]])
        compare(Tree.neighbor(find(root, "b"), "down").id, "c")
        compare(Tree.neighbor(find(root, "c"), "down"), null)
        compare(Tree.neighbor(find(root, "c"), "left").id, "a")
        compare(Tree.neighbor(find(root, "b"), "right"), null)
    }

    // --- moveNode (move <dir>) --------------------------------------------------

    function test_move_toward_window_joins_it_as_tabs() {
        const root = build("splith", ["a", "b", "c"])
        root.weights = [0.5, 0.25, 0.25]
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "splith(tabbed(a,b),c)")
        // a's share spreads over the row in proportion: b and c had equal shares.
        fuzzyWeights(root.weights, [0.5, 0.5])
        compare(Tree.focusedLeaf(root).id, "a")
        compare(root.children[0].splitLayout, "splith")
    }

    function test_move_toward_window_inside_container_joins_it() {
        // The column is left with only the tabs and collapses; they run up/down as it did.
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        verify(Tree.moveNode(find(root, "c"), "up"))
        compare(shape(root), "splith(a,tabbed(b,c))")
        compare(Tree.axisOf(root.children[1]), "v")
    }

    function test_moving_on_from_joined_tabs_swaps_and_back_undoes() {
        const row = build("splith", ["x", "a", "b"])
        Tree.moveNode(find(row, "a"), "right")
        verify(Tree.moveNode(find(row, "a"), "right"))
        compare(shape(row), "splith(x,b,a)")
        fuzzyWeights(row.weights, [1/3, 1/3, 1/3])
        const back = build("splith", ["x", "a", "b"])
        Tree.moveNode(find(back, "a"), "right")
        verify(Tree.moveNode(find(back, "a"), "left"))
        compare(shape(back), "splith(x,a,b)")
        fuzzyWeights(back.weights, [1/3, 1/3, 1/3])
        // Two windows: the root becomes the tabs, which run along the move.
        const two = build("splith", ["a", "b"])
        Tree.moveNode(find(two, "a"), "right")
        compare(shape(two), "tabbed(a,b)")
        verify(Tree.moveNode(find(two, "a"), "right"))
        compare(shape(two), "tabbed(b,a)")
        verify(Tree.moveNode(find(two, "a"), "right"))
        compare(shape(two), "splith(b,a)")
        const twoBack = build("splith", ["a", "b"])
        Tree.moveNode(find(twoBack, "a"), "right")
        verify(Tree.moveNode(find(twoBack, "a"), "left"))
        compare(shape(twoBack), "splith(a,b)")
    }

    function test_moves_keep_side_by_side_tab_groups_equal() {
        // A window carried from one group to the other: out, then in.
        const groups = build("splith", [["tabbed", "a", "b", "c"], ["tabbed", "d", "e"]])
        verify(Tree.moveNode(find(groups, "c"), "right"))
        compare(shape(groups), "splith(tabbed(a,b),c,tabbed(d,e))")
        fuzzyWeights(groups.weights, [1/3, 1/3, 1/3])
        verify(Tree.moveNode(find(groups, "c"), "right"))
        compare(shape(groups), "splith(tabbed(a,b),tabbed(c,d,e))")
        fuzzyWeights(groups.weights, [0.5, 0.5])
        // A window joining its neighbor beside a tab group.
        const beside = build("splith", [["tabbed", "x", "y"], "a", "b"])
        verify(Tree.moveNode(find(beside, "a"), "right"))
        compare(shape(beside), "splith(tabbed(x,y),tabbed(a,b))")
        fuzzyWeights(beside.weights, [0.5, 0.5])
    }

    function test_toggle_tabbed_turns_joined_tabs_back_into_their_split() {
        const root = build("splitv", ["x", "a", "b"])
        Tree.moveNode(find(root, "b"), "up")
        compare(shape(root), "splitv(x,tabbed(a,b))")
        Tree.toggleTabbed(find(root, "b"))
        compare(shape(root), "splitv(x,splitv(a,b))")
    }

    function test_move_into_container_next_to_its_focused_window() {
        const root = build("splith", ["a", ["splitv", "b", "c"], "d"])
        Tree.focusNode(find(root, "c"))
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "splith(splitv(b,a,c),d)")
        compare(Tree.focusedLeaf(root).id, "a")
    }

    function test_move_into_container_across_its_axis_joins_its_layout() {
        const root = build("splitv", ["a", ["splith", "b", ["splitv", "c", "d"]]])
        verify(Tree.moveNode(find(root, "a"), "down"))
        // Across splith we take its focused child (b) and a joins splith in
        // front of it, as in i3; the root then absorbs the lone splith.
        compare(shape(root), "splith(a,b,splitv(c,d))")
    }

    function test_move_into_container_along_its_axis_enters_at_near_edge() {
        const root = build("splith", ["a", ["splith", "b", "c"]])
        Tree.focusNode(find(root, "c"))
        verify(Tree.moveNode(find(root, "a"), "right"))
        // Near edge (b), not the focused child (c).
        compare(shape(root), "splith(a,b,c)")
    }

    function test_move_into_tabbed_makes_a_tab_next_to_the_visible_one() {
        const root = build("splith", ["a", ["tabbed", "b", "c"], "d"])
        verify(Tree.moveNode(find(root, "d"), "left"))
        compare(shape(root), "splith(a,tabbed(b,d,c))")
    }

    // --- tabbed (accordion) -----------------------------------------------------

    function test_tab_direction_follows_parent() {
        compare(Tree.axisOf(build("tabbed", ["a", "b"])), "h")
        compare(Tree.axisOf(build("splith", ["a", ["tabbed", "b", "c"]]).children[1]), "v")
        compare(Tree.axisOf(build("splitv", ["a", ["tabbed", "b", "c"]]).children[1]), "h")
    }

    function test_move_reorders_tabs() {
        const root = build("tabbed", ["a", "b", "c"])
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "tabbed(b,a,c)")
    }

    function test_move_past_first_tab_pops_out_and_turns_the_rest() {
        const root = build("tabbed", ["a", "b", "c"])
        verify(Tree.moveNode(find(root, "a"), "left"))
        compare(shape(root), "splith(a,tabbed(b,c))")
        compare(Tree.neighbor(find(root, "b"), "down").id, "c")
        compare(Tree.neighbor(find(root, "b"), "left").id, "a")
        compare(Tree.focusedLeaf(root).id, "a")
    }

    function test_move_past_last_tab_pops_out_to_the_right() {
        const root = build("tabbed", ["a", "b", "c"])
        verify(Tree.moveNode(find(root, "c"), "right"))
        compare(shape(root), "splith(tabbed(a,b),c)")
    }

    function test_pop_out_of_two_tabs_leaves_a_split() {
        const root = build("tabbed", ["a", "b"])
        verify(Tree.moveNode(find(root, "a"), "left"))
        compare(shape(root), "splith(a,b)")
        const other = build("tabbed", ["a", "b"])
        verify(Tree.moveNode(find(other, "b"), "down"))
        compare(shape(other), "splitv(a,b)")
    }

    function test_pop_out_sideways_keeps_tab_direction() {
        const root = build("tabbed", ["a", "b", "c"])
        verify(Tree.moveNode(find(root, "b"), "down"))
        compare(shape(root), "splitv(tabbed(a,c),b)")
        compare(Tree.neighbor(find(root, "a"), "right").id, "c")
    }

    function test_pop_out_of_nested_tabs_splits_their_place() {
        const root = build("splitv", ["x", ["tabbed", "a", "b", "c"]])
        verify(Tree.moveNode(find(root, "a"), "left"))
        compare(shape(root), "splitv(x,splith(a,tabbed(b,c)))")
        compare(Tree.neighbor(find(root, "b"), "down").id, "c")
    }

    function test_popped_tab_merges_back() {
        const root = build("tabbed", ["a", "b", "c"])
        Tree.moveNode(find(root, "a"), "left")
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "tabbed(a,b,c)")
        compare(Tree.axisOf(root), "h")
    }

    function test_moving_beside_tabs_does_not_join_them() {
        // Removing a leaves the root holding only the tabs; a must still end
        // up beside them, not inside.
        const root = build("splitv", ["a", ["tabbed", "b", "c"]])
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "splith(tabbed(b,c),a)")
    }

    function test_accordion_shows_slivers_of_other_tabs() {
        const root = build("tabbed", ["a", "b", "c"])
        Tree.focusNode(find(root, "b"))
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 500), 0, 0, 30)
        compare(rects.get("a"), rect(0, 0, 940, 500))
        compare(rects.get("b"), rect(30, 0, 940, 500))
        compare(rects.get("c"), rect(60, 0, 940, 500))
    }

    function test_accordion_first_tab_has_sliver_on_one_side_only() {
        const root = build("tabbed", ["a", "b", "c"])
        Tree.focusNode(find(root, "a"))
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 500), 0, 0, 30)
        compare(rects.get("a"), rect(0, 0, 970, 500))
        compare(rects.get("b"), rect(30, 0, 970, 500))
        compare(rects.get("c"), rect(30, 0, 970, 500))
    }

    function test_accordion_slivers_follow_tab_direction() {
        const root = build("splith", ["x", ["tabbed", "a", "b"]])
        Tree.focusNode(find(root, "a"))
        const rects = Tree.layoutRects(root, rect(0, 0, 1000, 600), 0, 0, 30)
        compare(rects.get("a"), rect(500, 0, 500, 570))
        compare(rects.get("b"), rect(500, 30, 500, 570))
    }

    function test_move_steps_out_of_container() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        verify(Tree.moveNode(find(root, "c"), "right"))
        compare(shape(root), "splith(a,b,c)")
        compare(Tree.focusedLeaf(root).id, "c")
    }

    function test_move_steps_out_to_the_left() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        verify(Tree.moveNode(find(root, "b"), "left"))
        compare(shape(root), "splith(a,b,c)")
    }

    function test_move_at_workspace_edge_does_nothing() {
        const root = build("splith", ["a", "b"])
        verify(!Tree.moveNode(find(root, "a"), "left"))
        compare(shape(root), "splith(a,b)")
        const single = build("splith", ["a"])
        verify(!Tree.moveNode(find(single, "a"), "up"))
    }

    function test_move_across_root_axis_reorients_root() {
        const root = build("splitv", ["a", "b"])
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "splith(b,a)")
        compare(root.type, "root")
    }

    function test_move_across_root_axis_wraps_the_rest() {
        const root = build("splitv", ["a", "b", "c"])
        verify(Tree.moveNode(find(root, "a"), "left"))
        compare(shape(root), "splith(a,splitv(b,c))")
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_move_across_root_axis_after_root_absorbs() {
        // Removing a leaves the root holding only splith(b,c), which it
        // absorbs; a then simply goes on the right.
        const root = build("splitv", ["a", ["splith", "b", "c"]])
        verify(Tree.moveNode(find(root, "a"), "right"))
        compare(shape(root), "splith(b,c,a)")
    }

    // --- splitNode / toggles ----------------------------------------------------

    function test_split_lone_child_reorients_parent() {
        const root = build("splith", ["a"])
        Tree.splitNode(find(root, "a"), "splitv")
        compare(shape(root), "splitv(a)")
    }

    function test_split_wraps_window_and_next_window_joins_it() {
        const root = build("splith", ["a", "b"])
        root.weights = [0.3, 0.7]
        Tree.focusNode(find(root, "b"))
        Tree.splitNode(find(root, "b"), "splitv")
        compare(shape(root), "splith(a,splitv(b))")
        fuzzyWeights(root.weights, [0.3, 0.7])
        compare(Tree.focusedLeaf(root).id, "b")
        Tree.insertAfter(find(root, "b"), Tree.newLeaf("c"))
        compare(shape(root), "splith(a,splitv(b,c))")
    }

    function test_toggle_split_flips_orientation() {
        const root = build("splith", ["a", "b"])
        Tree.toggleSplit(find(root, "a"))
        compare(root.layout, "splitv")
        Tree.toggleSplit(find(root, "a"))
        compare(root.layout, "splith")
    }

    function test_toggle_tabbed_remembers_split_layout() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const con = root.children[1]
        Tree.toggleTabbed(find(root, "b"))
        compare(con.layout, "tabbed")
        Tree.toggleTabbed(find(root, "b"))
        compare(con.layout, "splitv")
        Tree.toggleTabbed(find(root, "b"))
        Tree.toggleSplit(find(root, "b"))
        compare(con.layout, "splitv")
    }

    // --- resizeNode -------------------------------------------------------------

    function test_resize_grows_into_next_sibling() {
        const root = build("splith", ["a", "b", "c"])
        verify(Tree.resizeNode(find(root, "a"), "h", 0.1))
        fuzzyWeights(root.weights, [1/3 + 0.1, 1/3 - 0.1, 1/3])
    }

    function test_resize_last_child_trades_with_previous() {
        const root = build("splith", ["a", "b"])
        verify(Tree.resizeNode(find(root, "b"), "h", -0.1))
        fuzzyWeights(root.weights, [0.6, 0.4])
    }

    function test_resize_clamps_at_minimum() {
        const root = build("splith", ["a", "b"])
        Tree.resizeNode(find(root, "a"), "h", 0.9)
        fuzzyWeights(root.weights, [0.95, 0.05])
        Tree.resizeNode(find(root, "a"), "h", -2)
        fuzzyWeights(root.weights, [0.05, 0.95])
    }

    function test_resize_climbs_to_ancestor_on_axis() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        verify(Tree.resizeNode(find(root, "c"), "h", 0.1))
        fuzzyWeights(root.weights, [0.4, 0.6])
        verify(Tree.resizeNode(find(root, "c"), "v", 0.1))
        fuzzyWeights(root.children[1].weights, [0.4, 0.6])
    }

    // --- dragResize (mouse resize) -------------------------------------------
    // geometry() is 1600x900 without gaps: in [a | [b / c]], b is 800,0 800x450.

    function test_drag_edge_moves_by_the_dragged_pixels() {
        const root = build("splith", ["a", "b"])
        const g = { area: rect(0, 0, 1000, 500), gapsInner: 10, gapsOuter: 0, tabPadding: 0 }
        Tree.dragResize(root, find(root, "a"), rect(0, 0, 495, 500), rect(0, 0, 595, 500), g)
        const rects = Tree.layoutRects(root, g.area, 10, 0)
        compare(rects.get("a"), rect(0, 0, 595, 500))
        compare(rects.get("b"), rect(605, 0, 395, 500))
    }

    function test_drag_left_edge_trades_with_left_neighbor() {
        const root = build("splith", ["a", "b", "c"])
        const g = { area: rect(0, 0, 1200, 600), gapsInner: 0, gapsOuter: 0, tabPadding: 0 }
        Tree.dragResize(root, find(root, "b"), rect(400, 0, 400, 600), rect(340, 0, 460, 600), g)
        fuzzyWeights(root.weights, [1/3 - 0.05, 1/3 + 0.05, 1/3])
    }

    function test_drag_grows_the_windows_in_a_container_together() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.dragResize(root, find(root, "b"), rect(800, 0, 800, 450), rect(640, 0, 960, 450), geometry())
        fuzzyWeights(root.weights, [0.4, 0.6])
        fuzzyWeights(root.children[1].weights, [0.5, 0.5])
        compare(Tree.layoutRects(root, geometry().area, 0, 0).get("c"), rect(640, 450, 960, 450))
    }

    function test_drag_corner_resizes_both_axes() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        Tree.dragResize(root, find(root, "b"), rect(800, 0, 800, 450), rect(640, 0, 960, 540), geometry())
        fuzzyWeights(root.weights, [0.4, 0.6])
        fuzzyWeights(root.children[1].weights, [0.6, 0.4])
    }

    function test_drag_move_or_workspace_edge_changes_nothing() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const b = find(root, "b")
        Tree.dragResize(root, b, rect(800, 0, 800, 450), rect(700, 30, 800, 450), geometry())   // a move
        Tree.dragResize(root, b, rect(800, 0, 800, 450), rect(800, 0, 900, 450), geometry())    // right edge
        Tree.dragResize(root, b, rect(800, 0, 800, 450), rect(800, -50, 800, 500), geometry())  // top edge
        fuzzyWeights(root.weights, [0.5, 0.5])
        fuzzyWeights(root.children[1].weights, [0.5, 0.5])
        verify(!Tree.resizeEdge(root, find(root, "a"), "left", 100, geometry()))
    }

    function test_drag_clamps_at_minimum() {
        const root = build("splith", ["a", "b"])
        Tree.dragResize(root, find(root, "a"), rect(0, 0, 800, 900), rect(0, 0, 3000, 900), geometry())
        fuzzyWeights(root.weights, [0.95, 0.05])
    }

    // --- dropNode (mouse drop) ------------------------------------------------
    // geometry() is 1600x900 without gaps: in [a | [b / c]], b is 800,0 800x450.

    function test_drop_onto_window_joins_it_as_tabs() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        verify(Tree.dropNode(root, find(root, "a"), { x: 1000, y: 700 }, geometry()))
        // a left the root, which absorbed the column; c's place holds the tabs.
        compare(shape(root), "splitv(b,tabbed(a,c))")
        compare(Tree.focusedLeaf(root).id, "a")
    }

    function test_drop_onto_tab_adds_a_tab_after_it() {
        const root = build("splith", ["x", ["tabbed", "a", "b", "c"]])
        Tree.focusNode(find(root, "b"))
        const g = { area: rect(0, 0, 1600, 900), gapsInner: 0, gapsOuter: 0, tabPadding: 30 }
        verify(Tree.dropNode(root, find(root, "x"), { x: 1200, y: 450 }, g))   // over b, on top
        compare(shape(root), "tabbed(a,b,x,c)")
        const sliver = build("splith", ["x", ["tabbed", "a", "b", "c"]])
        Tree.focusNode(find(sliver, "b"))
        verify(Tree.dropNode(sliver, find(sliver, "x"), { x: 1200, y: 10 }, g)) // a's sliver
        compare(shape(sliver), "tabbed(a,x,b,c)")
    }

    function test_drop_on_a_gap_or_itself_does_nothing() {
        const root = build("splith", ["a", "b"])
        const g = { area: rect(0, 0, 1000, 500), gapsInner: 10, gapsOuter: 10, tabPadding: 0 }
        verify(!Tree.dropNode(root, find(root, "a"), { x: 500, y: 250 }, g))   // between them
        verify(!Tree.dropNode(root, find(root, "a"), { x: 100, y: 250 }, g))   // its own place
        verify(!Tree.dropNode(root, find(root, "a"), { x: 2000, y: 250 }, g))  // off this screen
        compare(shape(root), "splith(a,b)")
        compare(Tree.leafAt(root, { x: 700, y: 250 }, g).id, "b")
    }

    function test_drag_edge_skips_tabs_and_climbs_past_container_edges() {
        const tabs = build("splith", ["a", ["tabbed", "b", "c"]])
        verify(Tree.resizeEdge(tabs, find(tabs, "c"), "left", 160, geometry()))
        fuzzyWeights(tabs.weights, [0.4, 0.6])
        // b is on the right edge of [a | b]: the room comes from x, and a grows too.
        const nested = build("splith", [["splith", "a", "b"], "x"])
        verify(Tree.resizeEdge(nested, find(nested, "b"), "right", 160, geometry()))
        fuzzyWeights(nested.weights, [0.6, 0.4])
        fuzzyWeights(nested.children[0].weights, [0.5, 0.5])
    }

    // --- containers as targets (focus parent) ---------------------------------

    function test_move_container_joins_window_as_a_unit() {
        const root = build("splith", ["x", "a", ["splitv", "b", "c"]])
        verify(Tree.moveNode(root.children[2], "left"))
        compare(shape(root), "splith(x,tabbed(a,splitv(b,c)))")
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_move_container_across_root_axis() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const con = root.children[1]
        verify(Tree.moveNode(con, "up"))
        compare(shape(root), "splitv(splitv(b,c),a)")
        compare(con.parent, root)
    }

    function test_neighbor_of_container_uses_its_level() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const con = root.children[1]
        compare(Tree.neighbor(con, "left").id, "a")
        compare(Tree.neighbor(con, "up"), null)
    }

    function test_split_and_resize_container() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const con = root.children[1]
        verify(Tree.resizeNode(con, "h", 0.1))
        fuzzyWeights(root.weights, [0.4, 0.6])
        Tree.splitNode(con, "splitv")
        compare(shape(root), "splith(a,splitv(splitv(b,c)))")
    }

    function test_node_rect_is_union_of_leaves() {
        const root = build("splith", ["a", ["splitv", "b", "c"]])
        const area = rect(0, 0, 1000, 600)
        compare(Tree.nodeRect(root, root.children[1], area, 10, 0), rect(505, 0, 495, 600))
        compare(Tree.nodeRect(root, find(root, "b"), area, 10, 0), rect(505, 0, 495, 295))
    }

    // --- screens ----------------------------------------------------------------

    function test_nearest_screen_side_by_side() {
        const screens = [rect(0, 0, 1600, 900), rect(1600, 0, 1600, 900)]
        compare(Tree.nearestInDirection(screens[0], screens, "right"), 1)
        compare(Tree.nearestInDirection(screens[1], screens, "left"), 0)
        compare(Tree.nearestInDirection(screens[0], screens, "left"), -1)
        compare(Tree.nearestInDirection(screens[0], screens, "down"), -1)
    }

    function test_nearest_screen_picks_closest_and_ignores_diagonal() {
        // A laptop below the left half of two side-by-side monitors, plus one
        // monitor off to the far right with a gap and different height.
        const screens = [rect(0, 0, 1920, 1080), rect(1920, 0, 1920, 1080),
                         rect(400, 1080, 1280, 800), rect(5000, 200, 1280, 1024)]
        compare(Tree.nearestInDirection(screens[0], screens, "down"), 2)
        compare(Tree.nearestInDirection(screens[1], screens, "down"), -1)
        compare(Tree.nearestInDirection(screens[2], screens, "up"), 0)
        compare(Tree.nearestInDirection(screens[0], screens, "right"), 1)
        compare(Tree.nearestInDirection(screens[1], screens, "right"), 3)
    }

    function test_nearest_screen_stacked_and_offset() {
        // The dev machine: a 1920x1080 monitor above a laptop at scale 1.2
        // (1600x900 logical), shifted 145px right. They only have each other
        // up and down.
        const screens = [rect(0, 0, 1920, 1080), rect(145, 1080, 1600, 900)]
        compare(Tree.nearestInDirection(screens[0], screens, "down"), 1)
        compare(Tree.nearestInDirection(screens[1], screens, "up"), 0)
        compare(Tree.nearestInDirection(screens[0], screens, "up"), -1)
        compare(Tree.nearestInDirection(screens[1], screens, "down"), -1)
        compare(Tree.nearestInDirection(screens[1], screens, "left"), -1)
        compare(Tree.nearestInDirection(screens[1], screens, "right"), -1)
    }

    // --- stacking tabs ---------------------------------------------------------

    function test_shown_tab_is_the_outermost_tabs_visible_child() {
        const root = build("splith", ["x", ["tabbed", "a", ["splitv", "b", ["tabbed", "c", "d"]]]])
        Tree.focusNode(find(root, "d"))
        compare(shape(Tree.shownTab(find(root, "d"))), "splitv(b,tabbed(c,d))")
        compare(shape(Tree.shownTab(find(root, "b"))), "splitv(b,tabbed(c,d))")
        compare(Tree.shownTab(find(root, "x")), null)
        Tree.focusNode(find(root, "a"))
        compare(Tree.shownTab(find(root, "a")).id, "a")
    }

    function test_raise_order_puts_hidden_tabs_first() {
        // [A | [B / C]] turned into tabs, with [B / C] shown: both B and C go
        // on top of A.
        const tabs = build("tabbed", ["a", ["splitv", "b", "c"]])
        Tree.focusNode(find(tabs, "b"))
        compare(Tree.raiseOrder(Tree.shownTab(find(tabs, "b"))).map(l => l.id), ["b", "c"])
        // Nested tabs: c is hidden behind d, so it goes before d.
        const root = build("splith", ["x", ["tabbed", "a", ["splitv", "b", ["tabbed", "c", "d"]], "e"]])
        Tree.focusNode(find(root, "d"))
        compare(Tree.raiseOrder(Tree.shownTab(find(root, "d"))).map(l => l.id), ["b", "c", "d"])
        compare(Tree.raiseOrder(root).map(l => l.id), ["x", "a", "e", "b", "c", "d"])
    }

    // --- binary tree and moving subtrees --------------------------------------

    function geometry() { return { area: rect(0, 0, 1600, 900), gapsInner: 0, gapsOuter: 0, tabPadding: 0 } }
    function btreeRoot(specs) {
        const root = build("splith", specs)
        root.btree = true
        return root
    }

    function test_place_i3_goes_after_focused() {
        const root = build("splith", ["a", "b", "c"])
        Tree.focusNode(find(root, "b"))
        Tree.placeNode(root, Tree.newLeaf("d"), geometry())
        compare(shape(root), "splith(a,b,d,c)")
    }

    function test_place_btree_halves_focused_along_longer_side() {
        const root = btreeRoot(["a"])
        Tree.placeNode(root, Tree.newLeaf("b"), geometry())        // a is wide: beside
        compare(shape(root), "splith(a,b)")
        Tree.focusNode(find(root, "b"))
        Tree.placeNode(root, Tree.newLeaf("c"), geometry())        // b is 800x900: below
        compare(shape(root), "splith(a,splitv(b,c))")
        Tree.focusNode(find(root, "c"))
        Tree.placeNode(root, Tree.newLeaf("d"), geometry())        // c is 800x450: beside
        compare(shape(root), "splith(a,splitv(b,splith(c,d)))")
        Tree.focusNode(find(root, "a"))
        Tree.placeNode(root, Tree.newLeaf("e"), geometry())        // the focused one, not the newest
        compare(shape(root), "splith(splitv(a,e),splitv(b,splith(c,d)))")
        fuzzyWeights(root.weights, [0.5, 0.5])
    }

    function test_place_btree_respects_tabs_and_explicit_split() {
        const root = btreeRoot(["a", ["tabbed", "b", "c"]])
        Tree.focusNode(find(root, "c"))
        Tree.placeNode(root, Tree.newLeaf("d"), geometry())        // a new tab
        compare(shape(root), "splith(a,tabbed(b,c,d))")
        Tree.focusNode(find(root, "a"))
        Tree.splitNode(find(root, "a"), "splith")                  // a is tall, but the user said beside
        Tree.placeNode(root, Tree.newLeaf("e"), geometry())
        compare(shape(root), "splith(splith(a,e),tabbed(b,c,d))")
        // Without geometry, a binary tree places like i3.
        const other = btreeRoot(["x", "y"])
        Tree.placeNode(other, Tree.newLeaf("z"), null)
        compare(shape(other), "splith(x,z,y)")
    }

    function test_place_into_empty_root_hands_over_the_content() {
        const root = Tree.newRoot("splith", true)
        const moved = node(["tabbed", "a", "b"])
        Tree.placeNode(root, moved, geometry())
        compare(shape(root), "tabbed(a,b)")
        compare(root.btree, true)
        compare(find(root, "a").parent, root)
        compare(moved.parent, null)
    }

    function test_commands_on_a_whole_workspace() {
        // A selection can become a whole root (moved onto an empty screen).
        const root = build("splith", ["a", "b"])
        verify(!Tree.moveNode(root, "left"))
        verify(!Tree.moveNode(root, "down"))
        compare(Tree.neighbor(root, "right"), null)
        Tree.toggleSplit(root)
        compare(shape(root), "splitv(a,b)")
        Tree.toggleTabbed(root)
        compare(shape(root), "tabbed(a,b)")
        Tree.splitNode(root, "splitv")
        compare(shape(root), "tabbed(a,b)")
        verify(!Tree.resizeNode(root, "h", 0.1))
    }

    function test_rebuild_as_binary_tree_and_back_keeps_order_and_focus() {
        const root = build("splith", ["a", ["tabbed", "b", "c"], "d"])
        Tree.focusNode(find(root, "c"))
        Tree.rebuildLayout(root, true, geometry())
        compare(shape(root), "splith(a,splitv(b,splith(c,d)))")
        compare(ids(root), ["a", "b", "c", "d"])
        compare(root.btree, true)
        compare(Tree.focusedLeaf(root).id, "c")
        Tree.rebuildLayout(root, false, geometry())
        compare(shape(root), "splith(a,b,c,d)")
        fuzzyWeights(root.weights, [0.25, 0.25, 0.25, 0.25])
        compare(root.btree, false)
        compare(Tree.focusedLeaf(root).id, "c")
    }

    function test_take_content_empties_root() {
        const root = build("splitv", ["a", ["splith", "b", "c"]])
        root.btree = true
        Tree.focusNode(find(root, "b"))
        const content = Tree.takeContent(root)
        compare(shape(content), "splitv(a,splith(b,c))")
        compare(content.parent, null)
        compare(find(content, "a").parent, content)
        compare(Tree.focusedLeaf(content).id, "b")
        compare(root.children.length, 0)
        compare(root.btree, true)
        const single = build("splith", ["x"])
        compare(Tree.takeContent(single).id, "x")
        compare(single.children.length, 0)
    }

    function test_common_ancestor() {
        const root = build("splith", ["a", ["splitv", "b", ["splith", "c", "d"]]])
        compare(shape(Tree.commonAncestor([find(root, "c"), find(root, "d")])), "splith(c,d)")
        compare(shape(Tree.commonAncestor([find(root, "b"), find(root, "d")])), "splitv(b,splith(c,d))")
        compare(Tree.commonAncestor([find(root, "a"), find(root, "d")]), root)
        compare(Tree.commonAncestor([find(root, "b")]).id, "b")
    }

    function test_same_rect_needs_two_equal_rects() {
        verify(Tree.sameRect(rect(145, 1110, 1600, 870), rect(145, 1110, 1600, 870)))
        // A panel hidden: the area grows by its 30px.
        verify(!Tree.sameRect(rect(145, 1080, 1600, 900), rect(145, 1110, 1600, 870)))
        verify(!Tree.sameRect(rect(0, 0, 10, 10), rect(0, 0, 10, 11)))
        // Nothing laid out yet, or the output is gone: never the same.
        verify(!Tree.sameRect(null, rect(0, 0, 10, 10)))
        verify(!Tree.sameRect(rect(0, 0, 10, 10), undefined))
        verify(!Tree.sameRect(null, null))
    }

    function test_resize_skips_tabbed_and_reports_missing_axis() {
        const root = build("splith", ["a", ["tabbed", "b", "c"]])
        verify(Tree.resizeNode(find(root, "b"), "h", 0.1))
        fuzzyWeights(root.weights, [0.4, 0.6])
        verify(!Tree.resizeNode(find(root, "a"), "v", 0.1))
    }
}
