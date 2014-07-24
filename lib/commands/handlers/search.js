'use strict';

var async = require('async');

function get_message_date(message) {
    // TODO: fix problem with date parsing (See http://tools.ietf.org/html/rfc2822#page-14)
    var messageDate = message.date || message.internaldate;
    if (Object.prototype.toString.call(messageDate) != '[object Date]') {
        messageDate = new Date(messageDate);//.substr(0, 11));
    }
    return messageDate;
}

// TODO: Make search throw Mongo API
module.exports = function(connection, messageSource, params, callback) {
    var nrCache = {},
        queryParams = {
            'BCC': ['VALUE'],       'BEFORE': ['VALUE'],            'BODY': ['VALUE'],
            'CC': ['VALUE'],        'FROM': ['VALUE'],              'HEADER': ['VALUE', 'VALUE'],
            'KEYWORD': ['VALUE'],   'LARGER': ['VALUE'],            'NOT': ['COMMAND'],
            'ON': ['VALUE'],        'OR': ['COMMAND', 'COMMAND'],   'SENTBEFORE': ['VALUE'],
            'SENTON': ['VALUE'],    'SENTSINCE': ['VALUE'],         'SINCE': ['VALUE'],
            'SMALLER': ['VALUE'],   'SUBJECT': ['VALUE'],           'TEXT': ['VALUE'],
            'TO': ['VALUE'],        'UID': ['VALUE'],               'UNKEYWORD': ['VALUE']
        };

    function composeQuery(params) {
        params = [].concat(params || []);

        var pos = 0,
            param,
            returnParams = [];

        var getParam = function(level) {
            level = level || 0;
            if (pos >= params.length) {
                return undefined;
            }

            var param = params[pos++],
                paramTypes = queryParams[param.toUpperCase()] || [],
                paramCount = paramTypes.length,
                curParams = [param.toUpperCase()];

            if (paramCount) {
                for (var i=0, len = paramCount; i<len; i++) {
                    switch(paramTypes[i]) {
                        case 'VALUE':
                            curParams.push(params[pos++]);
                            break;
                        case 'COMMAND':
                            curParams.push(getParam(level+1));
                            break;
                    }
                }
            }
            return curParams;
        };

        while(typeof (param = getParam()) != 'undefined') {
            returnParams.push(param);
        }

        return returnParams;
    }

    function searchFlags(flag, flagExists) {
        var results = [];
        messageSource.forEach(function(message, i) {
            if ((flagExists && message.flags.indexOf(flag) >= 0)
                    || (!flagExists && message.flags.indexOf(flag) < 0)) {
                nrCache[message.uid] = i + 1;
                results.push(message);
            }
        });
        return results;
    }

    function searchHeaders(key, value, includeEmpty) {
        var results = [];
        key = (key || '').toString().toLowerCase();
        value = (value || '').toString();
        if (!value && !includeEmpty) {
            return [];
        }

        messageSource.forEach(function(message, i) {
            if (typeof message.headers[key] !== 'undefined'
                    && (!value || message.headers[key].toLowerCase().indexOf(value.toLowerCase()) >= 0)) {
                nrCache[message.uid] = i + 1;
                results.push(message);
            }
        });
        return results;
    }

    // See http://www.faqs.org/rfcs/rfc3501.html
    var queryHandlers = {
        '_SEQ': function(cb, sequence) {
            connection.getMessageRange(messageSource, sequence, false, function(range) {
                cb(null, range.map(function(item) {
                    nrCache[item[1].uid] = item[0];
                    return item[1];
                }));
            });
        },
        'ALL': function(cb) {
            cb(null, messageSource.map(function(message, i) {
                nrCache[message.uid] = i + 1;
                return message;
            }));
        },
        'ANSWERED': function(cb) {
            cb(null, searchFlags('\\Answered', true));
        },
        'BCC': function(cb, value) {
            cb(null, searchHeaders('BCC', value));
        },
        'BEFORE': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (new Date(message.internaldate).toISOString().substr(0, 10) < new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'BODY': function(cb, value) {
            var results = [];
            value = (value || '').toString();
            if (value) {
                messageSource.forEach(function(message, i) {
                    if ((message.text || '').toLowerCase().indexOf(value.toLowerCase()) >= 0) {
                        nrCache[message.uid] = i + 1;
                        results.push(message);
                    }
                });
            }
            cb(null, results);
        },
        'CC': function(cb, value) {
            cb(null, searchHeaders('CC', value));
        },
        'DELETED': function(cb) {
            cb(null, searchFlags('\\Deleted', true));
        },
        'DRAFT': function(cb) {
            cb(null, searchFlags('\\Draft', true));
        },
        'FLAGGED': function(cb) {
            cb(null, searchFlags('\\Flagged', true));
        },
        'FROM': function(cb, value) {
            cb(null, searchHeaders('FROM', value));
        },
        'HEADER': function(cb, key, value) {
            cb(null, searchHeaders(key, value, true));
        },
        'KEYWORD': function(cb, flag) {
            cb(null, searchFlags(flag, true));
        },
        'LARGER': function(cb, size) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if ((message.raw || '').length >= Number(size)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'NEW': function(cb) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (message.flags.indexOf('\\Recent') >= 0 && message.flags.indexOf('\\Seen') < 0) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'NOT': function(cb, q) {
            if (!queryHandlers[q[0]] && q[0].match(/^[\d\,\:\*]+$/)) {
                q.unshift('_SEQ');
            } else if (!queryHandlers[q[0]]) {
                cb('NO Invalid query element: ' + q[0] + ' (Failure)');
                return
            }

            var key = q.shift();
            q.unshift(function(err, notResults) {
                if (err) {cb(err); return}

                var results = [];
                messageSource.forEach(function(message, i) {
                    if (notResults.indexOf(message) < 0) {
                        nrCache[message.uid] = i + 1;
                        results.push(message);
                    }
                });
                cb(null, results);
            });
            queryHandlers[key].apply(connection, q);
        },
        'OLD': function(cb) {
            cb(null, searchFlags('\\Recent', false));
        },
        'ON': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (new Date(message.internaldate).toISOString().substr(0, 10) == new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'OR': function(cb, left, right) {

            if (!queryHandlers[left[0]] && left[0].match(/^[\d\,\:\*]+$/)) {
                left.unshift('_SEQ');
            } else if (!queryHandlers[left[0]]) {
                cb('NO Invalid query element: ' + left[0] + ' (Failure)');
                return
            }

            if (!queryHandlers[right[0]] && right[0].match(/^[\d\,\:\*]+$/)) {
                right.unshift('_SEQ');
            } else if (!queryHandlers[right[0]]) {
                cb('NO Invalid query element: ' + right[0] + ' (Failure)');
                return
            }

            var left_key = left.shift();
            left.unshift(function(err, leftResults) {
                if (err) {cb(err); return }

                var right_key = right.shift();
                right.unshift(function(err, rightResults) {
                    if (err) {cb(err); return }

                    var jointResult = leftResults;
                    rightResults.forEach(function(message) {
                        if (jointResult.indexOf(message) < 0) {
                            jointResult.push(message);
                        }
                    });

                    cb(null, jointResult);
                });
                queryHandlers[right_key].apply(connection, right);
            });
            queryHandlers[left_key].apply(connection, left);
        },
        'RECENT': function(cb) {
            cb(null, searchFlags('\\Recent', true));
        },
        'SEEN': function(cb) {
            cb(null, searchFlags('\\Seen', true));
        },
        'SENTBEFORE': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (get_message_date(message).toISOString().substr(0, 10) < new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'SENTON': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (get_message_date(message).toISOString().substr(0, 10) == new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'SENTSINCE': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (get_message_date(message).toISOString().substr(0, 10) >= new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'SINCE': function(cb, date) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if (new Date(message.internaldate).toISOString().substr(0, 10) >= new Date(date).toISOString().substr(0, 10)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'SMALLER': function(cb, size) {
            var results = [];
            messageSource.forEach(function(message, i) {
                if ((message.raw || '').length < Number(size)) {
                    nrCache[message.uid] = i + 1;
                    results.push(message);
                }
            });
            cb(null, results);
        },
        'SUBJECT': function(cb, value) {
            cb(null, searchHeaders('SUBJECT', value));
        },
        'TEXT': function(cb, value) {
            var results = [];
            value = (value || '').toString().toLowerCase();
            if (value) {
                messageSource.forEach(function(message, i) {
                    var is_found = false;
                    // search in text
                    is_found = (message.text || '').toLowerCase().indexOf(value) >= 0;
                    // search in headers
                    for(var name in message.headers) {
                        if (message.headers.hasOwnProperty(name)
                                && message.headers[name].toLowerCase().indexOf(value) >= 0) {
                            is_found = true;
                            break;
                        }
                    }
                    if (is_found) {
                        nrCache[message.uid] = i + 1;
                        results.push(message);
                    }
                });
            }
            cb(null, results);
        },
        'TO': function(cb, value) {
            cb(null, searchHeaders('TO', value));
        },
        'UID': function(cb, sequence) {
            connection.getMessageRange(messageSource, sequence, true, function(range) {
                cb(null, range.map(function(item) {
                    nrCache[item[1].uid] = item[0];
                    return item[1];
                }));
            });
        },
        'UNANSWERED': function(cb) {
            cb(null, searchFlags('\\Answered', false));
        },
        'UNDELETED': function(cb) {
            cb(null, searchFlags('\\Deleted', false));
        },
        'UNDRAFT': function(cb) {
            cb(null, searchFlags('\\Draft', false));
        },
        'UNFLAGGED': function(cb) {
            cb(null, searchFlags('\\Flagged', false));
        },
        'UNKEYWORD': function(cb, flag) {
            cb(null, searchFlags(flag, false));
        },
        'UNSEEN': function(cb) {
            cb(null, searchFlags('\\Seen', false));
        }
    };

    // TODO: Temporary disabled user defined searchHandlers
//    Object.keys(connection.server.searchHandlers).forEach(function(key) {
//
//        // if handler takes more than 3 params (mailbox, message, i), use the remaining as value params
//        if (!(key in queryParams) && connection.server.searchHandlers[key].length > 3) {
//            queryParams[key] = [];
//            for (var i=0, len = connection.server.searchHandlers[key].length - 3; i<len; i++) {
//                queryParams[key].push('VALUE');
//            }
//        }
//
//        queryHandlers[key] = function() {
//            var args = Array.prototype.slice.call(arguments),
//                results = [],
//                cb = args[args.length - 1]; // callback always last of all
//
//            // check all messages against the user defined function
//            messageSource.forEach(function(message, i) {
//                if (connection.server.searchHandlers[key].apply(null, [connection, message, i + 1].concat(args))) {
//                    nrCache[message.uid] = i + 1;
//                    results.push(message);
//                }
//            });
//            cb(null, results);
//        };
//    });

    // FIXME: charset is currently ignored
    var charset;
    if ((params[0] || '').toString().toUpperCase() == 'CHARSET') {
        params.shift(); // keyword 'CHARSET'
        charset = params.shift(); // value
    }

    async.concatSeries(composeQuery(params), function(q, cb) {
        if (!queryHandlers[q[0]] && q[0].match(/^[\d\,\:\*]+$/)) {
            q.unshift('_SEQ');
        } else if (!queryHandlers[q[0]]) {
            cb('NO Invalid query element: ' + q[0] + ' (Failure)');
            return;
        }

        var handler = queryHandlers[q.shift()];
        q.unshift(cb); // Add callback for handler to the first position
        if (handler) {
            handler.apply(connection, q);
        }
    }, function(err, results) {
        callback(err, {list: results, numbers: nrCache});
    });
};
