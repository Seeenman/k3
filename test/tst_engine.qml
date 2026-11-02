// Probes which top-level declarations of a plain .js file are reachable through
// a QML import qualifier. src/tree.js is tested this way, so its public API
// must only use the forms that pass here.
import QtQuick
import QtTest
import "fixtures/forms.js" as Forms

TestCase {
    name: "Engine"

    function test_function_declaration() { compare(Forms.fnDecl(), "function") }
    function test_var_declaration() { compare(Forms.varDecl, "var") }
    function test_let_declaration() { compare(Forms.letDecl, "let") }
    function test_const_declaration() { compare(Forms.constDecl, "const") }
    function test_class_declaration() { compare(new Forms.ClassDecl().kind(), "class") }
}
