
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["Rename"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,

    "Rename success": function(test){
        var message = "From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: HELLO!\r\n\r\nWORLD!";
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 RENAME level1/level2 level5/level2",
                "A4 LIST \"\" \"*\"",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf('\r\n* LIST (\\HasNoChildren) "/" "level1"\r\n') >= 0);
            test.ok(resp.indexOf('\r\n* LIST (\\HasNoChildren) "/" "level5/level2/level3/level4"\r\n') >= 0);
            test.done();
        }).bind(this));
    }
};
