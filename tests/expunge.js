
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["IMAPServer tests"] = {
    setUp: function(done) {
        app_tests.setUp(function(err) {

            app_tests.addMessages('INBOX', [
                {
                    raw: "Subject: hello 1\r\n\r\nWorld 1!",
                    internaldate: "14-Sep-2013 21:22:28 -0300",
                    flags: ["\\Deleted"]
                }
            ], done);
        });
    },
    tearDown: app_tests.tearDown,

    "CLOSE and \\Deleted": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 SELECT INBOX",
                "A4 EXPUNGE",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\r\n* 1 EXPUNGE\r\n") >= 0);
            test.ok(resp.indexOf("\r\n* 0 EXISTS\r\n") < 0);
            test.done();
        }).bind(this));
    }
};
