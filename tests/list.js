
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

    "Namespace": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 CAPABILITY",
                "A3 NAMESPACE",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.match(/^\* CAPABILITY\b.*?\bNAMESPACE\b/m));
            test.ok(resp.indexOf('\n* NAMESPACE (("INBOX" NIL) ("" "/")) NIL NIL\r\n') >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "LIST separator": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 CAPABILITY",
                "A3 LIST \"\" \"\"",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.equal((resp.match(/^\* LIST\b/mg) || []).length, 1);
            test.ok(resp.indexOf('\n* LIST (\\Noselect) "/" ""\r\n') >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "LIST default namespace": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 CAPABILITY",
                "A3 LIST \"\" \"*\"",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.equal((resp.match(/^\* LIST\b/mg) || []).length, 6);
            test.ok(resp.indexOf('\n* LIST (\\HasNoChildren \\Inbox) NIL "INBOX"\r\n') >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "LSUB all": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 CAPABILITY",
                "A3 LSUB \"\" \"*\"",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.equal((resp.match(/^\* LSUB\b/mg) || []).length, 6);
            test.ok(resp.indexOf('\n* LSUB (\\HasNoChildren \\Inbox) NIL "INBOX"\r\n') >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    }
};
