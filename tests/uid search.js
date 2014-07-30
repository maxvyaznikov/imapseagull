
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["Search tests"] = {
    setUp: function(done) {
        app_tests.createSetUp()(function(err) {

            app_tests.addMessages('INBOX', [
                {raw: "Subject: hello 1\r\n\r\nWorld 1!", internaldate: "14-Sep-2013 18:22:28 +0300", flags: ["\\Flagged"]},
                {raw: "Subject: hello 2\r\nCC: test\r\n\r\nWorld 2!", flags: ["\\Recent", "\\Seen", "MyFlag"]},
                {raw: "Subject: hello 3\r\nDate: Fri, 13 Sep 2013 15:01:00 +0300\r\nBCC: test\r\n\r\nWorld 3!", flags: ["\\Draft"]},
                {raw: "From: sender name <sender@example.com>\r\n"+
                    "To: Receiver name <receiver@example.com>\r\n"+
                    "Subject: hello 4\r\n"+
                    "Message-Id: <abcde>\r\n"+
                    "Date: Fri, 13 Sep 2013 15:01:00 +0300\r\n"+
                    "\r\n"+
                    "World 4!",
                    internaldate: "13-Sep-2013 18:22:28 +0300"},
                {raw: "Subject: hello 5\r\nfrom: test\r\n\r\nWorld 5!", flags: ["\\Deleted", "\\Recent"]},
                {raw: "Subject: hello 6\r\n\r\nWorld 6!", flags: ["\\Answered"], uid: 66}
            ], done);
        });
    },
    tearDown: app_tests.tearDown,

    "SEARCH ALL": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID SEARCH ALL",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\n* SEARCH 1 2 3 4 5 66\r\n") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "SEARCH OR": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID SEARCH OR KEYWORD \"MyFlag\" 5:6",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\n* SEARCH 2 5 66\r\n") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    }
};
