
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["IMAPServer tests"] = {
    setUp: function(done) {
        app_tests.setUp(function(err) {

            app_tests.addMessages('INBOX', [
                {uid: 31, raw: "Subject: hello 1\r\n\r\nWorld 1!", flags: ["\\Seen"]},
                {uid: 32, raw: "Subject: hello 1\r\n\r\nWorld 1!", flags: ["\\Seen", "\\Deleted"]}
            ], done);
        });
    },
    tearDown: app_tests.tearDown,

    "Add flags": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 31 +FLAGS (\\Deleted)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Seen \\Deleted) UID 31") >= 0);

            test.done();
        }).bind(this));
    },

    "Invalid system flag": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 31 +FLAGS (\\XNotValid)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 BAD") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Seen \\XNotValid)") < 0);

            test.done();
        }).bind(this));
    },

    "Custom flag": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 31 +FLAGS (\"Custom Flag\")",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Seen \"Custom Flag\") UID 31") >= 0);

            test.done();
        }).bind(this));
    },

    "Remove flags": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 32 -FLAGS (\\Seen)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Deleted) UID 32") >= 0);

            test.done();
        }).bind(this));
    },

    "Set flags": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 32 FLAGS (MyFlag $My$Flag)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("(FLAGS (MyFlag $My$Flag) UID 32)") >= 0);

            test.done();
        }).bind(this));
    },

    "Add flags silent": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 31 +FLAGS.SILENT (\\Deleted)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Seen \\Deleted)") < 0);

            test.done();
        }).bind(this));
    },

    "Remove flags silent": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 32 -FLAGS.SILENT (\\Seen)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("FLAGS (\\Deleted)") < 0);

            test.done();
        }).bind(this));
    },

    "Set flags silent": function(test){
        var cmds = ["A1 LOGIN testuser testpass",
                "A2 SELECT INBOX",
                "A3 UID STORE 32 FLAGS.SILENT (MyFlag $My$Flag)",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();

            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("(FLAGS (MyFlag $My$Flag))") < 0);

            test.done();
        }).bind(this));
    }
};
