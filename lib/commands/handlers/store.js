'use strict';

var storeHandlers = {};

module.exports = storeHandlers;

function checkSystemFlags(connection, flag) {
    return flag.charAt(0) == '\\' && connection.server.systemFlags.indexOf(flag) < 0;
}

function setFlags(connection, message, flags, callback) {
    var msg_flags = [],
        err_flags = [];
    [].concat(flags).forEach(function(flag) {
        flag = flag.value || flag;
        if (checkSystemFlags(connection, flag)) {
            err_flags.push(flag);
            return;
        }

        // Ignore if it is not in allowed list and only permanent flags are allowed to use
        if (connection.selectedMailbox.permanentFlags.indexOf(flag) < 0 && !connection.selectedMailbox.allowPermanentFlags) {
            return;
        }

        if (msg_flags.indexOf(flag) < 0) {
            msg_flags.push(flag);
        }
    });

    message.flags = msg_flags;
    connection.storage.msg_update(message, function(err) {
        if (err || err_flags.length == 0) {
            callback(err);
        } else {
            callback('Invalid system flags: '+ err_flags.join(', '));
        }
    });
}

function addFlags(connection, message, flags, callback) {
    var new_flags = [].concat(message.flags),
        err_flags = [];
    [].concat(flags).forEach(function(flag) {
        flag = flag.value || flag;
        if (checkSystemFlags(connection, flag)) {
            err_flags.push(flag);
            return;
        }

        // Ignore if it is not in allowed list and only permament flags are allowed to use
        if (connection.selectedMailbox.permanentFlags.indexOf(flag) < 0 && !connection.selectedMailbox.allowPermanentFlags) {
            return;
        }

        if (new_flags.indexOf(flag) < 0) {
            new_flags.push(flag);
        }
    });

    message.flags = new_flags;
    connection.storage.msg_update(message, function(err) {
        if (err || err_flags.length == 0) {
            callback(err);
        } else {
            callback('Invalid system flags: '+ err_flags.join(', '));
        }
    });
}

function removeFlags(connection, message, flags, callback) {
    var new_flags = [].concat(message.flags);
    [].concat(flags).forEach(function(flag) {
        flag = flag.value || flag;
        checkSystemFlags(connection, flag);

        if (new_flags.indexOf(flag) >= 0) {
            for (var i=0; i<message.flags.length; i++) {
                if (new_flags[i] == flag) {
                    new_flags.splice(i, 1);
                    break;
                }
            }
        }
    });

    message.flags = new_flags;
    connection.storage.msg_update(message, callback);
}

storeHandlers.FLAGS = function(connection, message, flags, index, parsed, data, callback) {
    setFlags(connection, message, flags, function(err) {
        if (err) { callback(err); return }

        callback(null, [
            { type: 'ATOM', value: 'FLAGS' },
            message.flags.map(function(flag) {
                return {type: 'ATOM', value: flag};
            })
        ]);
    });
};

storeHandlers['+FLAGS'] = function(connection, message, flags, index, parsed, data, callback) {
    addFlags(connection, message, flags, function(err) {
        if (err) { callback(err); return }

        callback(null, [
            { type: 'ATOM', value: 'FLAGS' },
            message.flags.map(function(flag) {
                return {type: 'ATOM', value: flag};
            })
        ]);
    });
};

storeHandlers['-FLAGS'] = function(connection, message, flags, index, parsed, data, callback) {
    removeFlags(connection, message, flags, function(err) {
        if (err) { callback(err); return }

        callback(err, [
            { type: 'ATOM', value: 'FLAGS' },
            message.flags.map(function(flag) {
                return {type: 'ATOM', value: flag};
            })
        ]);
    });
};

storeHandlers['FLAGS.SILENT'] = function(connection, message, flags, index, parsed, data, callback) {
    setFlags(connection, message, flags, callback);
};

storeHandlers['+FLAGS.SILENT'] = function(connection, message, flags, index, parsed, data, callback) {
    addFlags(connection, message, flags, callback);
};

storeHandlers['-FLAGS.SILENT'] = function(connection, message, flags, index, parsed, data, callback) {
    removeFlags(connection, message, flags, callback);
};
