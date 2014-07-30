
var app_tests = require("../app_tests");
var mockClient = require("../mock-client");

var debug = false;

module.exports["Normal login"] = {
    setUp: app_tests.createSetUp(),
    tearDown: app_tests.tearDown,

    "Append simple": function(test){
        var message = "From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: HELLO!\r\n\r\nWORLD!";
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 SELECT INBOX",
                "A4 APPEND INBOX {" + message.length + "}\r\n"+message,
                "A5 FETCH 1 BODY[HEADER.FIELDS (Subject)]",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, debug, function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("\nA4 OK") >= 0);
            test.ok(resp.indexOf("\nA5 OK") >= 0);
            test.ok(resp.toLowerCase().indexOf("\nsubject: hello!") >= 0);
            test.done();
        });
    },

    "Append flags": function(test){
        var message = "From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: HELLO!\r\n\r\nWORLD!";
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 SELECT INBOX",
                "A4 APPEND INBOX (MyFlag) {" + message.length + "}\r\n"+message,
                "A5 FETCH 1 (FLAGS BODY[HEADER.FIELDS (Subject)])",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, false, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("\nA4 OK") >= 0);
            test.ok(resp.indexOf("\nA5 OK") >= 0);
            test.ok(resp.indexOf("MyFlag") >= 0);
            test.ok(resp.indexOf("\nSubject: HELLO!") >= 0);
            test.done();
        }).bind(this));
    },

    "Append internaldate": function(test){
        var message = "From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: HELLO!\r\n\r\nWORLD!";
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 SELECT INBOX",
                "A4 APPEND INBOX \"15-Sep-2013 04:22:28 +0400\" {" + message.length + "}\r\n"+message,
                "A5 FETCH 1 (INTERNALDATE BODY[HEADER.FIELDS (Subject)])",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, debug, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("\nA4 OK") >= 0);
            test.ok(resp.indexOf("\nA5 OK") >= 0);
            test.ok(resp.indexOf("15-Sep-2013 04:22:28 +0400") >= 0);
            test.ok(resp.toLowerCase().indexOf("\nsubject: hello!") >= 0);
            test.done();
        }).bind(this));
    },

    "Append full": function(test){
        var message = "From: sender <sender@example.com>\r\nTo: receiver@example.com\r\nSubject: HELLO!\r\n\r\nWORLD!";
        var cmds = ["A1 CAPABILITY",
                "A2 LOGIN testuser testpass",
                "A3 SELECT INBOX",
                "A4 APPEND INBOX (MyFlag) \"15-Sep-2013 04:22:28 +0400\" {" + message.length + "}\r\n"+message,
                "A5 FETCH 1 (FLAGS INTERNALDATE BODY[HEADER.FIELDS (Subject)])",
                "ZZ LOGOUT"];

        mockClient(app_tests.port, "localhost", cmds, debug, (function(err, resp){
            resp = resp.toString();
            test.ok(resp.indexOf("\nA2 OK") >= 0);
            test.ok(resp.indexOf("\nA3 OK") >= 0);
            test.ok(resp.indexOf("\nA4 OK") >= 0);
            test.ok(resp.indexOf("\nA5 OK") >= 0);
            test.ok(resp.indexOf("MyFlag") >= 0);
            test.ok(resp.indexOf("15-Sep-2013 04:22:28 +0400") >= 0);
            test.ok(resp.toLowerCase().indexOf("\nsubject: hello!") >= 0);
            test.done();
        }).bind(this));
    }
};
