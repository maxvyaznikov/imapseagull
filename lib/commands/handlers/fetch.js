'use strict';

// TODO: Implement missing FETCH handlers

var fetchHandlers = {},
    bodystructure = require('../../bodystructure'),
    envelope = require('../../envelope'),
    mimeParser = require('../../mimeparser'),
    imap_utils = require('../../utils');

module.exports = fetchHandlers;

fetchHandlers.UID = function(connection, message, param, callback) {
    callback(null, message.uid);
};

fetchHandlers.FLAGS = function(connection, message, param, callback) {
    callback(null, message.flags.map(function(flag) {
        return {type: 'ATOM', value: flag};
    }));
};

fetchHandlers.BODYSTRUCTURE = function(connection, message, param, callback) {
    connection.storage.build_raw_msg(message, function(err, raw) {
        var structure = mimeParser(raw);
        callback(null, bodystructure(structure, {upperCaseKeys: true, skipContentLocation: true}));
    });
};

fetchHandlers.ENVELOPE = function(connection, message, param, callback) {
    callback(null, envelope(message.headers));
};

fetchHandlers['BODY.PEEK'] = function(connection, message, query, callback) {
    if (!query.section) {
        callback('BODY.PEEK requires ans argument list');
    } else {
        callback(null, fetchHandlers.BODY(connection, message, query, callback));
    }
};

fetchHandlers.BODY = function(connection, message, query, callback) {
    var partial, start, length;

    if (!query.section) {
        connection.storage.build_raw_msg(message, function(err, raw) {
            var structure = mimeParser(raw);
            callback(null, bodystructure(structure, {upperCaseKeys: true, skipContentLocation: true}));
        });
        return;
    }

    function compile_result_cb(err, raw) {
        if (err) return callback(err);

        if (query.partial) {
            partial = [].concat(query.partial || []);
            start = partial.shift() || 0;
            length = partial.pop();
            raw = raw.substr(start, length ? length : 0);
            if (query.partial.length == 2 && query.partial[1] > raw.length) {
                query.partial.pop();
            }
        }

        return callback(null, {type: 'LITERAL', value: raw});
    }

    if (!query.section.length) {
        connection.storage.build_raw_msg(message, compile_result_cb);
    } else {
        var key, path;

        if (query.section[0].type != 'ATOM') {
            return callback('Invalid BODY[<section>] identifier' + (query.section[0].value ? ' ' + query.section[0].type : ''));
        }

        key = (query.section[0].value || '').replace(/^(\d+\.)*(\d$)?/g, function(pathStr) {
            path = pathStr.replace(/\.$/, '');
            return '';
        }).toUpperCase();

        if (path) {
            connection.storage.build_raw_msg(message, function(err, raw) {
                var structure = mimeParser(raw);
                resolvePath(structure, path, function(err, context) {
                    resolveQuery(context, query, key, compile_result_cb);
                });
            });
        } else {
            resolveQuery(message, query, key, compile_result_cb);
        }
    }
};

fetchHandlers.INTERNALDATE = function(connection, message, param, callback) {
    callback(null, imap_utils.formatInternalDate(new Date(message.internaldate)));
};

fetchHandlers.RFC822 = function(connection, message, param, callback) {
    connection.storage.build_raw_msg(message, function(err, raw) {
        callback(null, {type: 'LITERAL', value: raw});
    })
};

fetchHandlers['RFC822.SIZE'] = function(connection, message, param, callback) {
    connection.storage.build_raw_msg(message, function(err, raw) {
        callback(null, raw.length);
    })
};

fetchHandlers['RFC822.HEADER'] = function(connection, message, param, callback) {
    callback(null, {
        type: 'LITERAL',
        value: mergeHeaders(message.headers)
    });
};

function resolveQuery(context, query, key, callback) {
    var value;

    switch(key) {
        case 'HEADER':
            if (query.section.length > 1) {
                return callback('HEADER does not take any arguments');
            }
            value = mergeHeaders(context.headers);
            break;

        case 'MIME':
            if (query.section.length > 1) {
                return callback('MIME does not take any arguments');
            }
            value = mergeHeaders(context.headers);
            break;

        case 'TEXT':
        case '':
            if (query.section.length > 1) {
                return callback('MIME does not take any arguments');
            }
            value = context.text || context.html || ''; // TODO: check correction: text prior to html or not?
            break;

        case 'HEADER.FIELDS':
            if (query.section.length != 2 && !Array.isArray(query.section[1])) {
                return callback('HEADER.FIELDS expects a list of header fields');
            }
            value = mergeHeaders(context.headers, query.section[1], true);
            break;

        case 'HEADER.FIELDS.NOT':
            if (query.section.length != 2 && !Array.isArray(query.section[1])) {
                return callback('HEADER.FIELDS.NOT expects a list of header fields');
            }
            value = mergeHeaders(context.headers, query.section[1], false);
            break;

        default:
            return callback('Not implemented: ' + query.section[0].value);
    }

    callback(null, value);
}

function resolvePath(structure, path, callback) {
    var pathNumbers = path.split('.'),
        context = structure,
        pathNumber,
        bodystruct = bodystructure(structure, {upperCaseKeys: true});

    while(pathNumber = pathNumbers.shift()) {
        pathNumber = Number(pathNumber);

        // If RFC bodystructure begins with 'MESSAGE' string, the bodystructure
        // for embedded message is in the element with index 8
        if ((bodystruct[0] || '').toString() == 'MESSAGE') {
            bodystruct = bodystruct[8];
        }

        // if this is a multipart list, use the selected one,
        // otherwise it is a single element, do not go any deeper
        if (bodystruct && Array.isArray(bodystruct[0])) {
            bodystruct = bodystruct[pathNumber - 1];
        }

        context = bodystruct.node;
    }

    callback(null, context);
}

function mergeHeaders(headers, query, has_key) {
    var keyList = [];
    if (query != null) {
        query.forEach(function(queryKey) {
            if (['ATOM', 'STRING', 'LITERAL'].indexOf(queryKey.type) < 0) {
                callback('Invalid header field name in list');
                return;
            }
            queryKey.type = 'ATOM'; // ensure that literals are not passed back in the response
            keyList.push(queryKey.value.toUpperCase());
        });
    }
    var headers_str = '';
    for(var name in headers) {
        if (query == null || query != null && (keyList.indexOf(name.toUpperCase().trim()) >= 0) === has_key) {
            headers_str += name + ': ' + headers[name] + '\r\n';
        }
    }
    return headers_str + '\r\n';
}
