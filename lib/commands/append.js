'use strict';

var imap_utils = require('../utils');

module.exports = function(connection, parsed, data, callback) {
    var args = [].concat(parsed.attributes || []),
        mailbox, internaldate;

    if (['Authenticated', 'Selected'].indexOf(connection.state) < 0) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Log in first'}
            ]
        }, 'LIST FAILED', parsed, data);
        return callback();
    }

    if (args.length > 4 || args.length < 2) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'APPEND takes 2 - 4 arguments'}
            ]
        }, 'INVALID COMMAND', parsed, data);
        return callback();
    }

    var path = args.shift();
    var raw = args.pop();

    var flags;
    if (Array.isArray(args[0])) {
        flags = args.shift();
    } else {
        flags = [{type:'ATOM', value: '\\Seen'}];
    }
    internaldate = args.shift();

    if (!path || ['STRING', 'ATOM'].indexOf(path.type) < 0 || !(mailbox = connection.getMailbox(path.value))) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Invalid mailbox argument'}
            ]
        }, 'INVALID COMMAND', parsed, data);
        return callback();
    }

    if (!raw || raw.type != 'LITERAL') {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Invalid message source argument'}
            ]
        }, 'INVALID COMMAND', parsed, data);
        return callback();
    }

    if (flags) {
        for (var i=0, len = flags.length; i<len; i++) {
            if (!flags[i] || ['STRING', 'ATOM'].indexOf(flags[i].type) < 0) {
                connection.send({
                    tag: parsed.tag,
                    command: 'BAD',
                    attributes:[
                        {type: 'TEXT', value: 'Invalid flags argument'}
                    ]
                }, 'INVALID COMMAND', parsed, data);
                return callback();
            }
        }
    }

    if (internaldate && (internaldate.type != 'STRING' || !imap_utils.validateInternalDate(internaldate.value))) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Invalid internaldate argument'}
            ]
        }, 'INVALID COMMAND', parsed, data);
        return callback();
    }

    connection.storage.parse_raw_msg(function(mail) {
        var flat_flags = (flags || []).map(function(flag) {
            return flag.value;
        });
        mail.user = connection.user && connection.user._id;
        connection.appendMessage(mailbox, flat_flags, internaldate && internaldate.value, mail, false);

        connection.send({
            tag: parsed.tag,
            command: 'OK',
            attributes:[
                {type: 'TEXT', value: 'APPEND Completed'}
            ]
        }, 'APPEND', parsed, data);
        callback();
    }).end(raw.value);
};
