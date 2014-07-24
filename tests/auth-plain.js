
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

module.exports["Auth Plain"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,

    "Invalid Login": function(test){
        var cmds = [
                "A1 CAPABILITY",
                "A2 AUTHENTICATE PLAIN",
                new Buffer("\x00wrong\x00pass", "utf-8").toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" AUTH=PLAIN") >= 0);
            test.ok(resp.indexOf("\nA2 NO") >= 0);
            test.done();
        }).bind(this));
    },

    "Login Success": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 AUTHENTICATE PLAIN",
                new Buffer("\x00testuser\x00testpass", "utf-8").toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    }
};

module.exports["Auth Plain with SASL-IR"] = {
    setUp: app_tests.setUp,
    tearDown: app_tests.tearDown,

    "Invalid Login": function(test){
        var cmds = [
                "A1 CAPABILITY",
                "A2 AUTHENTICATE PLAIN " + new Buffer("\x00wrong\x00pass", "utf-8").toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.match(/^\* CAPABILITY\b.*?\bSASL\-IR\b/m));
            test.ok(resp.indexOf(" AUTH=PLAIN") >= 0);
            test.ok(resp.indexOf("\nA2 NO") >= 0);
            test.done();
        }).bind(this));
    },

    "Login Success": function(test){
        var cmds = ["A1 CAPABILITY",
                "A2 AUTHENTICATE PLAIN",
                new Buffer("\x00testuser\x00testpass", "utf-8").toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.match(/^\* CAPABILITY\b.*?\bSASL\-IR\b/m));
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    },

    "Successful SASL-IR Login": function(test){
        var cmds = [
                "A1 CAPABILITY",
                "A2 AUTHENTICATE PLAIN " + new Buffer("\x00testuser\x00testpass", "utf-8").toString("base64"),
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf(" AUTH=PLAIN") >= 0);
            test.ok(resp.match(/^\* CAPABILITY\b.*?\bSASL\-IR\b/m));
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.done();
        }).bind(this));
    }
};
