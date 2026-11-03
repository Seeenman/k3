// k3 entry point: shortcut table and startup. Concatenated last by `make
// build`, after config.js, tree.js, kwin.js and commands.js; K3_BUILD is
// prepended by the Makefile.

function log() {
    print("[k3] " + Array.prototype.join.call(arguments, " "));
}

// KWin silently drops exceptions thrown from callbacks; log them instead.
function guarded(fn) {
    return function () {
        try {
            return fn.apply(null, arguments);
        } catch (e) {
            log("error:", e, e.stack);
        }
    };
}

// [id, description, default key, action]. KDE stores the user's bindings
// under the id, so never rename one. See PLAN.md §6.
const shortcuts = [
    ["k3-focus-left", "Focus Left", "Alt+H", function () { focusDirection("left"); }],
    ["k3-focus-down", "Focus Down", "Alt+J", function () { focusDirection("down"); }],
    ["k3-focus-up", "Focus Up", "Alt+K", function () { focusDirection("up"); }],
    ["k3-focus-right", "Focus Right", "Alt+L", function () { focusDirection("right"); }],
    ["k3-move-left", "Move Left", "Alt+Shift+H", function () { moveDirection("left"); }],
    ["k3-move-down", "Move Down", "Alt+Shift+J", function () { moveDirection("down"); }],
    ["k3-move-up", "Move Up", "Alt+Shift+K", function () { moveDirection("up"); }],
    ["k3-move-right", "Move Right", "Alt+Shift+L", function () { moveDirection("right"); }],
    ["k3-resize-shrink-width", "Shrink Width", "Ctrl+Alt+H", function () { resize("h", -1); }],
    ["k3-resize-grow-height", "Grow Height", "Ctrl+Alt+J", function () { resize("v", 1); }],
    ["k3-resize-shrink-height", "Shrink Height", "Ctrl+Alt+K", function () { resize("v", -1); }],
    ["k3-resize-grow-width", "Grow Width", "Ctrl+Alt+L", function () { resize("h", 1); }],
    ["k3-split-h", "Split Horizontal", "Alt+Shift+B", function () { split("splith"); }],
    ["k3-split-v", "Split Vertical", "Alt+Shift+V", function () { split("splitv"); }],
    ["k3-layout-toggle-split", "Toggle Split Direction", "Alt+/", toggleSplitLayout],
    ["k3-layout-tabbed", "Toggle Tabbed", "Alt+,", toggleTabbedLayout],
    ["k3-float-toggle", "Toggle Floating", "Alt+Shift+Space", toggleFloating],
    ["k3-focus-mode-toggle", "Focus Tiled/Floating", "", focusModeToggle],
    ["k3-focus-parent", "Focus Parent", "Alt+Shift+U", focusParent],
    ["k3-focus-child", "Focus Child", "Alt+Shift+D", focusChild],
    ["k3-retile", "Retile", "", retileAll]
];

shortcuts.forEach(function (s) {
    registerShortcut(s[0], "k3: " + s[1], s[2], guarded(s[3]));
});
start();
// A container picked with focus parent stays picked until focus moves, or the
// mouse does: KWin's outline swallows clicks, so reaching for the mouse ends
// the selection and lets the click through.
workspace.windowActivated.connect(guarded(clearSelection));
workspace.windowActivated.connect(guarded(function () { strandedFocus = null; }));
workspace.currentDesktopChanged.connect(guarded(clearSelection));
workspace.cursorPosChanged.connect(guarded(clearSelection));
log("loaded, build", K3_BUILD);
