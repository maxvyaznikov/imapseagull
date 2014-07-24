'use strict';

var async = require('async'),
    storeHandlers = require('./handlers/store');

module.exports = function(connection, parsed, data, callback) {
    if (!parsed.attributes ||
        parsed.attributes.length != 3 ||
        !parsed.attributes[0] ||
        ['ATOM', 'SEQUENCE'].indexOf(parsed.attributes[0].type) < 0 ||
        !parsed.attributes[1] ||
        (['ATOM'].indexOf(parsed.attributes[1].type) < 0) ||
        !parsed.attributes[2] ||
        !(['ATOM', 'STRING'].indexOf(parsed.attributes[2].type) >= 0  || Array.isArray(parsed.attributes[2]))
        ) {

        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'UID STORE expects sequence set, item name and item value'}
            ]
        }, 'INVALID COMMAND', parsed, data);
        callback();
        return;
    }

    if (connection.state != 'Selected') {
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Select mailbox first'}
            ]
        }, 'UID STORE FAILED', parsed, data);
        callback();
        return;
    }

    var itemName = (parsed.attributes[1].value || '').toUpperCase(),
        itemValue = [].concat(parsed.attributes[2] || []);

    try {

        itemValue.forEach(function(item, i) {
            if (!item || ['STRING', 'ATOM'].indexOf(item.type) < 0) {
                throw new Error('Invalid item value #' + (i + 1));
            }
        });

        connection.getMessageRange(null, parsed.attributes[0].value, true, function(range) {
            var fn_queue = [];
            range.forEach(function(rangeMessage) {
                for (var i=0, len = connection.server.storeFilters.length; i<len; i++) {
                    if (!connection.server.storeFilters[i](connection, rangeMessage[1], parsed, rangeMessage[0])) {
                        return;
                    }
                }

                var handler = connection.server.storeHandlers[itemName] || storeHandlers[itemName];
                if (!handler) {
                    throw new Error('Invalid STORE argument ' + itemName);
                }

                fn_queue.push(async.apply(function(handler, rangeMessage, callback) {
                    handler(connection, rangeMessage[1], itemValue, rangeMessage[0], parsed, data, function(err) {
                        callback(err, rangeMessage[1]);
                    });
                }, handler, rangeMessage));
            });
            async.series(fn_queue, function(err, messages) {
                if (err) {
                    connection.send({
                        tag: parsed.tag,
                        command: 'BAD',
                        attributes:[
                            {type: 'TEXT', value: err}
                        ]
                    }, 'STORE FAILED', parsed, data);

                    callback(err);
                    return;
                }

                if (itemName.indexOf('SILENT') === -1) {
                    messages.forEach(function(message, i) {
                        connection.send({
                            tag: '*',
                            attributes: [
                                i + 1,
                                {type: 'ATOM', value: 'FETCH'},
                                [
                                    {type: 'ATOM', value: 'FLAGS'},
                                    message.flags.map(function(flag) {
                                        return {type: 'ATOM', value: flag};
                                    }),
                                    {type: 'ATOM', value: 'UID'},
                                    message.uid
                                ]
                            ]
                        }, 'FLAG UPDATE', parsed, data, message);
                    });
                }

                connection.send({
                    tag: parsed.tag,
                    command: 'OK',
                    attributes:[
                        {type: 'TEXT', value: 'STORE completed'}
                    ]
                }, 'UID STORE COMPLETE', parsed, data, messages);

                callback();
            });
        });
    } catch (e) {
        console.error(e.message, e.stack);
        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: e.message}
            ]
        }, 'UID STORE FAILED', parsed, data);
        callback();
    }
};
