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
    gapsInner: Number(readConfig("gapsInner", 4)),
    gapsOuter: Number(readConfig("gapsOuter", 4)),
    floatClasses: readClassList("floatClasses",
        "org.kde.spectacle,org.kde.polkit-kde-authentication-agent-1,pinentry-qt"),
    ignoreClasses: readClassList("ignoreClasses",
        "plasmashell,krunner,ksmserver-logout-greeter,xwaylandvideobridge")
};
