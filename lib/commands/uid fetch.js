'use strict';

var async= require('async'),
    fetchHandlers = require('./handlers/fetch'),
    flatten = require('array_flatten');

module.exports = function(connection, parsed, data, callback) {

    if (!parsed.attributes ||
        parsed.attributes.length != 2 ||
        !parsed.attributes[0] ||
        ['ATOM', 'SEQUENCE'].indexOf(parsed.attributes[0].type) < 0 ||
        !parsed.attributes[1] ||
        (['ATOM'].indexOf(parsed.attributes[1].type) < 0 && !Array.isArray(parsed.attributes[1]))
        ) {

        connection.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'FETCH expects sequence set and message item names'}
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
        }, 'UID FETCH FAILED', parsed, data);
        callback();
        return;
    }

    var params = [].concat(parsed.attributes[1] || []),
        macros = {
            'ALL': ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE'],
            'FAST': ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE'],
            'FULL': ['FLAGS', 'INTERNALDATE', 'RFC822.SIZE', 'ENVELOPE', 'BODY']
        };

    if (parsed.attributes[1].type == 'ATOM' && macros.hasOwnProperty(parsed.attributes[1].value.toUpperCase())) {
        params = macros[parsed.attributes[1].value.toUpperCase()];
    }

    try {
        var uidExist = false, flagsExist = false, forceSeen = false;

        params.forEach(function(param, i) {
            if (!param || (typeof param != 'string' && param.type != 'ATOM')) {
                throw new Error('Invalid FETCH argument #'+(i+1));
            }

            if (typeof param == 'string') {
                param = params[i] = {type:'ATOM', value: param};
            }

            if (param.value.toUpperCase() == 'FLAGS') {
                flagsExist = true;
            }

            if (param.value.toUpperCase() == 'UID') {
                uidExist = true;
            }

            if (!connection.readOnly) {
                if (param.value.toUpperCase() == 'BODY' && param.section) {
                    forceSeen = true;
                } else if (['RFC822', 'RFC822.HEADER'].indexOf(param.value.toUpperCase()) >= 0) {
                    forceSeen = true;
                }
            }
        });

        if (forceSeen && !flagsExist) {
            params.unshift({type: 'ATOM', value: 'FLAGS'});
        }

        if (!uidExist) {
            params.unshift({type: 'ATOM', value: 'UID'});
        }

        connection.getMessageRange(null, parsed.attributes[0].value, true, function(range) {
            var fetch_fn_queue = [];
            async.eachSeries(range, function(rangeMessage, range_callback) {
                var flags_changed = false;

                if (!rangeMessage[1].flags) {
                    rangeMessage[1].flags = [];
                }
                if (rangeMessage[1].flags.indexOf('\\Recent') >= 0) {
                    rangeMessage[1].flags.splice(rangeMessage[1].flags.indexOf('\\Recent'), 1);
                    flags_changed = true;
                }
                if (forceSeen && rangeMessage[1].flags.indexOf('\\Seen') < 0) {
                    rangeMessage[1].flags.push('\\Seen');
                    flags_changed = true;
                }
                if (flags_changed) {
                    rangeMessage[1].flags = rangeMessage[1].flags.concat('\\Seen');
                    connection.storage.msg_update(rangeMessage[1], function() {
                        // TODO: process err
                    });
                }

                var fn_queue = [];
                for (var i=0, param; param = params[i]; i++) {
                    var key = (params[i].value || '').toUpperCase();

                    var handler = connection.server.fetchHandlers[key] || fetchHandlers[key];
                    if (!handler) {
                        throw new Error('Invalid FETCH argument ' + (key ? ' ' + key : '#' + (i + 1)));
                    }

                    fn_queue.push(async.apply(function(handler, param, key, callback) {
                        handler(connection, rangeMessage[1], param, function(err, value) {
                            if (err) return callback(err);

                            var name = (typeof param == 'string' ? {type: 'ATOM', value: key} : param);
                            name.value = name.value.replace(/\.PEEK\b/i, '');

                            return callback(null, [name, value]);
                        });
                    }, handler, param, key));
                }

                async.series(fn_queue, function(err, results) {
                    if (err) console.log(err);

                    fetch_fn_queue.push(async.apply(function(response, callback) {
                        connection.send({
                            tag: '*',
                            attributes: [rangeMessage[0], {type: 'ATOM', value: 'FETCH'}, response]
                        }, 'UID FETCH', parsed, data);

                        callback(null);
                    }, flatten(results, 1)));

                    range_callback(err);
                });
            }, function(err) {
                async.series(fetch_fn_queue, function(err) {
                    connection.send({
                        tag: parsed.tag,
                        command: 'OK',
                        attributes:[
                            {type: 'TEXT', value: 'UID FETCH Completed'}
                        ]
                    }, 'UID FETCH', parsed, data);

                    callback();
                });
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
        }, 'UID FETCH FAILED', parsed, data);

        return callback();
    }
};
