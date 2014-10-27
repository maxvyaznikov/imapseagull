
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["IMAPServer tests"] = {
    setUp: function(done) {
        app_tests.createSetUp()(function(err) {

            app_tests.addMessages('INBOX', [
                {raw: "Subject: hello 1\r\n\r\nWorld 1!", internaldate: "14-Sep-2013 21:22:28 -0300"},
                {raw: "Subject: hello 2\r\n\r\nWorld 2!", flags: ["\\Seen"]},
                {raw: "Subject: hello 3\r\n\r\nWorld 3!"},
                {raw: "From: sender name <sender@example.com>\r\n"+
                    "To: Receiver name <receiver@example.com>\r\n"+
                    "Subject: hello 4\r\n"+
                    "Message-Id: <abcde>\r\n"+
                    "Date: Fri, 13 Sep 2013 15:01:00 +0300\r\n"+
                    "\r\n"+
                    "World 4!"},
                {raw: "Subject: hello 5\r\n\r\nWorld 5!"},
                {raw: "Subject: hello 6\r\n\r\nWorld 6!"}
            ], done);
        });
    },
    tearDown: app_tests.tearDown,

    "Mark as Seen by fetching a body": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID FETCH 2 BODY[]",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf('FLAGS (\\Seen)' >= 0));
            test.ok(resp.toLowerCase().indexOf('Subject: hello 2'.toLowerCase() >= 0));
            test.ok(resp.indexOf("\nA3 OK") >= 0);

            test.done();
        }).bind(this));
    }
};
