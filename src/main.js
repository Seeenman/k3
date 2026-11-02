// k3 entry point. Concatenated last by `make build`, after config.js,
// tree.js and kwin.js; K3_BUILD is prepended by the Makefile.

function log() {
    print("[k3] " + Array.prototype.join.call(arguments, " "));
}

start();
log("loaded, build", K3_BUILD);
