# Lists every key bound both to a k3 shortcut and to some other action.
# KDE allows such duplicates and which action fires is then undefined.
#
#   awk -f tools/check-keys.awk ~/.config/kglobalshortcutsrc     (make check-keys)
#
# Entries look like  name=active,default,description . Several active keys
# are joined by a literal "\t", a comma inside a key is written "\\,", and
# _launch entries (in [services] groups) hold only the active keys.

/^\[/ { group = $0; next }
group ~ /InverseAction/ || /^_k_friendly_name=/ || !/=/ { next }
{
    name = substr($0, 1, index($0, "=") - 1)
    keys = substr($0, index($0, "=") + 1)
    if (name ~ /^k3-/) registered = 1
    gsub(/\\\\,/, "\034", keys)
    if (name != "_launch") keys = substr(keys, 1, index(keys ",", ",") - 1)
    n = split(keys, list, /\\t/)
    for (i = 1; i <= n; i++) {
        if (list[i] == "none" || list[i] == "") continue
        key = list[i]
        gsub(/\034/, ",", key)
        owners[key] = owners[key] "    " group " " name "\n"
        count[key]++
    }
}
END {
    if (!registered) {
        print "No k3 shortcuts in " FILENAME ": k3 hasn't registered them yet."
        print "Load it first (make reload), then run this again."
        exit 2
    }
    for (key in count)
        if (count[key] > 1 && owners[key] ~ /k3-/) {
            printf "%s\n%s", key, owners[key]
            found = 1
        }
    if (!found) print "No k3 shortcut shares its key with another action."
    exit found
}
