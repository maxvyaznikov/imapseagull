
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["Literalplus enabled"] = {
    setUp: app_tests.createSetUp(),
    tearDown: app_tests.tearDown,

    "Login success regular": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN {8}\r\ntestuser {8}\r\ntestpass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\r\n+") >= 0);
            test.ok(resp.indexOf(" LITERAL+") >= 0);
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "Login success literalplus": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN {8+}\r\ntestuser {8+}\r\ntestpass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\r\n+") < 0);
            test.ok(resp.indexOf(" LITERAL+") >= 0);
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    }
};
