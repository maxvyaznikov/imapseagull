
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
                },
                "Subject: hello 1\r\n\r\nWorld 2!"
            ], done);
        });
    },
    tearDown: app_tests.tearDown,

    "COPY": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 COPY 1:* &BCcENQRABD0EPgQyBDgEOgQ4-",
                "A4 SELECT &BCcENQRABD0EPgQyBDgEOgQ4-",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\r\nA3 OK") >= 0);
            test.equal((resp.match(/\* 2 EXISTS/mg) || []).length, 2);
            test.done();
        }).bind(this));
    }
};
