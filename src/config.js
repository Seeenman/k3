// k3 settings, read from [Script-k3] in kwinrc. Phase 5 adds a settings
// dialog; until then set them with kwriteconfig6 and `make reload`.
// See PLAN.md §5.6.

// Comma-separated window classes, matched case-insensitively against a
// window's resourceClass or resourceName.
function readClassList(key, fallback) {
    return String(readConfig(key, fallback)).split(",")
        .map(function (s) { return s.trim().toLowerCase(); })
        .filter(function (s) { return s.length > 0; });
}

const config = {
    // How a screen-and-desktop's layout starts: "btree" (a new window halves
    // the focused one) or "split" (i3: new windows go in a row).
    defaultLayout: String(readConfig("defaultLayout", "btree")).trim().toLowerCase(),
    gapsInner: Number(readConfig("gapsInner", 10)),
    gapsOuter: Number(readConfig("gapsOuter", 10)),
    tabPadding: Number(readConfig("tabPadding", 30)),         // px of hidden tabs left showing
    resizeStep: Number(readConfig("resizeStep", 5)),          // % of the parent per keypress
    floatAbove: String(readConfig("floatAbove", true)) !== "false",
    floatClasses: readClassList("floatClasses",
        "org.kde.spectacle,org.kde.polkit-kde-authentication-agent-1,pinentry-qt"),
    ignoreClasses: readClassList("ignoreClasses",
        "plasmashell,krunner,ksmserver-logout-greeter,xwaylandvideobridge")
};
