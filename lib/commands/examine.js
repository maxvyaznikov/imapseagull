'use strict';

module.exports = function(connection, parsed, data, callback) {

    if (!parsed.attributes ||
        parsed.attributes.length != 1 ||
        !parsed.attributes[0] ||
        ['STRING', 'LITERAL', 'ATOM'].indexOf(parsed.attributes[0].type) < 0
        ) {

        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'EXAMINE expects 1 mailbox argument'}
            ]
        }, 'INVALID COMMAND', parsed, data);

        callback(); return;
    }

    if (['Authenticated', 'Selected'].indexOf(connection.state) < 0) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Log in first'}
            ]
        }, 'EXAMINE FAILED', parsed, data);

        callback(); return;
    }

    var path = parsed.attributes[0].value,
        mailbox = connection.getMailbox(path);

    if (!mailbox || mailbox.flags.indexOf('\\Noselect') >= 0) {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Invalid mailbox name'}
            ]
        }, 'EXAMINE FAILED', parsed, data);

        callback(); return;
    }

    connection.state = 'Selected';
    connection.selectedMailbox = mailbox;
    connection.readOnly = true;

    connection.notificationQueue = [];

    connection.getStatus(mailbox, (function(err, status) {
        var permanentFlags = status.permanentFlags.map(function(flag) {
            return {type:'ATOM', value: flag};
        });

        connection.send({
            tag: '*',
            command: 'FLAGS',
            attributes:[permanentFlags]
        }, 'EXAMINE FLAGS', parsed, data);

        if (mailbox.allowPermanentFlags) {
            permanentFlags.push({type:'TEXT', value:'\\*'});
        }

        connection.send({
            tag: '*',
            command: 'OK',
            attributes:[{
                type: 'SECTION',
                section:[
                    {type: 'ATOM', value: 'PERMANENTFLAGS'},
                    permanentFlags
                ]
            }]
        }, 'EXAMINE PERMANENTFLAGS', parsed, data);

        connection.send({
            tag: '*',
            attributes:[
                status.flags['\\Recent'] || 0,
                {type: 'ATOM', value: 'RECENT'}
            ]
        }, 'EXAMINE RECENT', parsed, data);

        connection.send({
            tag: '*',
            command: 'OK',
            attributes:[{
                type: 'SECTION',
                section:[
                    {type: 'ATOM', value: 'UIDVALIDITY'},
                    mailbox.uidvalidity
                ]
            }]
        }, 'EXAMINE UIDVALIDITY', parsed, data);

        connection.send({
            tag: '*',
            command: 'OK',
            attributes:[{
                type: 'SECTION',
                section:[
                    {type: 'ATOM', value: 'UIDNEXT'},
                    mailbox.uidnext
                ]
            }]
        }, 'EXAMINE UIDNEXT', parsed, data);

        connection.send({
            tag: parsed.tag,
            command: 'OK',
            attributes:[
                {type:'SECTION', section:[{type:'ATOM', value: 'READ-ONLY'}]},
                {type: 'TEXT', value: 'Completed'}
            ]
        }, 'EXAMINE', parsed, data);


        connection.storage.msgs_count(connection.user, mailbox, function(err, count) {
            connection.send({
                tag: '*',
                attributes:[
                    count,
                    {type: 'ATOM', value: 'EXISTS'}
                ]
            }, 'EXAMINE EXISTS', parsed, data);

            callback();
        }.bind(this));
    }.bind(this)));
};
