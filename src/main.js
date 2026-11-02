// k3 entry point: registers shortcuts and starts the window manager.
// Concatenated after the other src/ files by `make build`; K3_BUILD is
// prepended by the Makefile.

function log() {
    print("[k3] " + Array.prototype.join.call(arguments, " "));
}

// Phase 0 smoke test: proves the script loads, the shortcut shows up in
// System Settings, and the callback fires. Removed in phase 1.
registerShortcut("k3-hello", "k3: Hello (phase 0 test)", "", function () {
    log("hello, build", K3_BUILD,
        "| windows:", workspace.windowList().length,
        "| desktops:", workspace.desktops.length,
        "| screens:", workspace.screens.length);
});

log("loaded, build", K3_BUILD);
