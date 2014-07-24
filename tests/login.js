
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["Normal login"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,

    "Invalid Login": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN wrong pass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" LOGINDISABLED") < 0);
            test.ok(resp.indexOf("\nA2 NO") >= 0);
            test.done();
        }).bind(this));
    },

    "Successful login": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" LOGINDISABLED") < 0);
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    }
};

module.exports["LOGINDISABLED"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,
/*
    "Unencrypted login fail": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" LOGINDISABLED") >= 0);
            test.ok(resp.indexOf("\nA2 BAD") >= 0);
            test.done();
        }).bind(this));
    },
*/
    "Successful TLS login": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 STARTTLS",
                "A3 LOGIN testuser testpass",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" LOGINDISABLED") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "LOGINDISABLED missing after STARTTLS": function(test){
        var cmds = ["A1 STARTTLS",
                "A2 CAPABILITY",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" LOGINDISABLED") < 0);
            test.done();
        }).bind(this));
    }
};
