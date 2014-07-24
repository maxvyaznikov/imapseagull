
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["XOAUTH2"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,

    "Invalid argument": function(test){
        var cmds = [
                "A1 AUTHENTICATE XOAUTH2 zzzzz",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA1 NO") >= 0);
            test.done();
        }).bind(this));
    },

    "Unknown user": function(test){
        var cmds = [
                "A1 AUTHENTICATE XOAUTH2 " + new Buffer(["user=unknown", "auth=Bearer zzz", "", ""].join("\x01")).toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA1 NO") >= 0);
            test.done();
        }).bind(this));
    },

    "Known user, invalid token": function(test){
        var cmds = [
                "A1 AUTHENTICATE XOAUTH2 " + new Buffer(["user=testuser", "auth=Bearer zzz", "", ""].join("\x01")).toString("base64"),
                "",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA1 NO") >= 0);
            test.ok(resp.indexOf("\r\n+ eyJzdGF0dXMiOiI0MDAiLCJzY2hlbWVzIjoiQmVhcmVyIiwic2NvcGUiOiJodHRwczovL21haWwuZ29vZ2xlLmNvbS8ifQ==\r\n") >= 0);
            test.done();
        }).bind(this));
    },

    "Login success": function(test){
        var cmds = [
                "A1 AUTHENTICATE XOAUTH2 " + new Buffer(["user=testuser", "auth=Bearer testtoken", "", ""].join("\x01")).toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA1 OK") >= 0);
            test.done();
        }).bind(this));
    }
};
