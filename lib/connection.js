
var imapHandler = require('imap-handler'),
    extend = require('xtend',
    starttls = require('./starttls'),
    imap_utils = require('./utils'));

function IMAPConnection(server, socket) {
    this.server = server;
    this.socket = socket;
    this.options = this.server.options;

    this.state = 'Not Authenticated';

    this.storage = server.storage;

    this.secureConnection = !!this.options.secureConnection;
    this._ignoreData = false;

    this._remainder = '';
    this._command = '';
    this._literalRemaining = 0;

    this.inputHandler = false;

    this._commandQueue = [];
    this._processing = false;

    this.uidnextCache = {}; // keep nextuid values if mailbox gets deleted
    this.folderCache = {};

    if (this.options.debug) {
        this.socket.pipe(process.stdout);
    }

    this.socket.on('data', this.onData.bind(this));
    this.socket.on('close', this.onClose.bind(this));
    this.socket.on('error', this.onError.bind(this));

    this.directNotifications = false;
    this._notificationCallback = this.onNotify.bind(this);
    this.notificationQueue = [];
    this.server.on('notify', this._notificationCallback);

    this.indexFolders(function() {
        this.socket.write('* OK server ready to fun\r\n');
    }.bind(this));
}

/**
 * Returns some useful information about a mailbox that can be used with STATUS, SELECT and EXAMINE
 *
 * @param {Object|String} mailbox Mailbox object or path
 */
IMAPConnection.prototype.getStatus = function(mailbox, callback) {
    if (typeof mailbox == 'string') {
        mailbox = this.getMailbox(mailbox);
    }
    if (!mailbox) {callback('No such mailbox'); return}

    var flags = {},
        total = 0,
        seen = 0,
        unseen = 0,
        permanentFlags = [].concat(mailbox.permanentFlags || []);

    this.storage.msgs_find(this.user, mailbox, null, null, function(err, messages) {
        if (err) {callback(err); return}

        messages.forEach((function(message) {
            if (message.flags.indexOf('\\Seen') < 0) {
                unseen++;
            } else {
                seen++;
            }

            message.flags.forEach((function(flag) {
                if (!flags[flag]) {
                    flags[flag] = 1;
                } else {
                    flags[flag]++;
                }

                if (permanentFlags.indexOf(flag) < 0) {
                    permanentFlags.push(flag);
                }
            }.bind(this)));

            total++;
        }.bind(this)));

        callback(null, {
            total: total,
            flags: flags,
            seen: seen,
            unseen: unseen,
            permanentFlags: permanentFlags
        });
    }.bind(this));
};

IMAPConnection.prototype.matchFolders = function(reference, match) {
    var includeINBOX = false;

    if (reference === '' && this.referenceNamespace !== false) {
        reference = this.referenceNamespace;
        includeINBOX = true;
    }

    if (!this.folders[reference]) {
        return [];
    }

    var namespace = this.folders[reference],
        lookup = (reference || '') + match,
        result = [];

    var query = new RegExp(
        '^' + lookup // escape regex symbols
                .replace(/([\\^$+?!.():=\[\]|,\-])/g, '\\$1')
                .replace(/[*]/g, '.*')
                .replace(/[%]/g, '[^' + (namespace.separator.replace(/([\\^$+*?!.():=\[\]|,\-])/g, '\\$1'))+ ']*') + '$',
    '');

    if (includeINBOX && ((reference ? reference + namespace.separator : '') + 'INBOX').match(query)) {
        result.push(this.folderCache.INBOX);
    }

    if (reference === '' && this.referenceNamespace !== false) {
        reference = this.referenceNamespace;
    }

    Object.keys(this.folderCache).forEach((function(path) {
        if (path.match(query) &&
                (this.folderCache[path].flags.indexOf('\\NonExistent') < 0 || this.folderCache[path].path == match) &&
                this.folderCache[path].namespace == reference) {
            result.push(this.folderCache[path]);
        }
    }.bind(this)));

    return result;
};

/**
 * Retrieves an array of messages that fit in the specified range criteria
 *
 * @param {Array} messages
 * @param {String} range Message range (eg. '*:4,5,7:9')
 * @param {Boolean} isUid If true, use UID values, not sequence indexes for comparison
 * @param {Function} callback
 * @return {Array} An array of messages in the form of [[seqIndex, message]]
 */
IMAPConnection.prototype.getMessageRange = function(messages, range, isUid, callback) {
    range = (range || '').toString();

    var process_cb = function(err, messages) {
        if (err) throw err;

        var result = [],
            rangeParts = range.split(','),
            uid,
            totalMessages = messages.length,
            maxUid = 0,
            inRange = function(nr, ranges, total) {
                var range, from, to;
                for (var i=0, len = ranges.length; i<len; i++) {
                    range = ranges[i];
                    to = range.split(':');
                    from = to.shift();
                    if (from == '*') {
                        from = total;
                    }
                    from = Number(from) || 1;
                    to = to.pop() || from;
                    to = Number(to=='*' && total || to) || from;

                    if (nr >= Math.min(from, to) && nr <= Math.max(from, to)) {
                        return true;
                    }
                }
                return false;
            };

        messages.forEach(function(message) {
            if (message.uid > maxUid) {
                maxUid = message.uid;
            }
        });

        for (var i=0, len = messages.length; i<len; i++) {
            uid = messages[i].uid || 1;
            if (inRange(isUid ? uid : i+1, rangeParts, isUid ? maxUid : totalMessages)) {
                result.push([i+1, messages[i]]);
            }
        }

        callback(result);
    };

    if (messages == null) {
        this.storage.msgs_find(this.user, this.selectedMailbox, null, null, process_cb.bind(this));
    } else {
        process_cb(null, messages);
    }
};

/**
 * INBOX has its own namespace
 */
IMAPConnection.prototype.indexFolders = function(callback) {
    var me = this;
    me.folders = extend({}, this.options.folders);
    me.folderCache = {};
    var walk_tree_count = 0;
    function walk_tree(path, separator, branch, namespace, cb) {
        Object.keys(branch).forEach(function(key) {
            var curBranch = branch[key],
                curPath = (path ? path + (path.substr(-1) != separator ? separator : '') : '') + key;

            walk_tree_count++;

            me.folderCache[curPath] = curBranch;
            me.processMailbox(curPath, curBranch, namespace, function() {
                if (namespace != 'INBOX' && curBranch.folders && Object.keys(curBranch.folders).length) {
                    walk_tree(curPath, separator, curBranch.folders, namespace, cb);
                }
                walk_tree_count--;
                if (walk_tree_count === 0 && cb) {
                    cb();
                }
            }.bind(this));
        });
    }

    function alter_walk_tree() {
        if (!me.referenceNamespace) {
            me.folders[''] = me.folders[''] || {};
            me.folders[''].folders = me.folders[''].folders || {};
            me.folders[''].separator = me.folders[''].separator || '/';
            me.folders[''].type = 'personal';
            me.referenceNamespace = '';
        }
        callback();
    }

    Object.keys(me.folders).forEach(function(key) {
        if (key == 'INBOX') {
            walk_tree('', '/', me.folders, 'INBOX', alter_walk_tree);
        } else {
            me.folders[key].folders = me.folders[key].folders || {};
            me.folders[key].separator = me.folders[key].separator || key.substr(-1) || '/';
            me.folders[key].type = me.folders[key].type || 'personal';
            me.folders[key].flags = me.folders[key].flags || [];

            if (me.folders[key].type == 'personal' && me.referenceNamespace === false) {
                me.referenceNamespace = key;
            }
            var flag_index = me.folders[key].folders && Object.keys(me.folders[key].folders).length ? 0 : 1;
            imap_utils.toggleFlags(me.folders[key].flags, ['\\HasChildren', '\\HasNoChildren'], flag_index);

            walk_tree(key, me.folders[key].separator, me.folders[key].folders, key, alter_walk_tree);
        }
    });
};

/**
 * Returns a mailbox object from folderCache
 *
 * @param {String} path Pathname for the mailbox
 * @return {Object} mailbox object or undefined
 */
IMAPConnection.prototype.getMailbox = function(path) {
    if (path.toUpperCase() == 'INBOX') {
        return this.folderCache.INBOX;
    }
    return this.folderCache[path];
};

IMAPConnection.prototype.onClose = function() {
    this.socket.removeAllListeners();
    try {
        this.socket.end();
    } catch (e) {}
    this.socket = null;
    this.server.removeListener('notify', this._notificationCallback);
};

IMAPConnection.prototype.close = function() {
    try {
        this.socket.end();
    } catch(e) {}
};

IMAPConnection.prototype.onError = function(err) {
    console.error('IMAPConnection onError handler:', new Date(), err);
    if (err.errno != 'ECONNABORTED' && err.errno != 'ECONNRESET') {
        try {
            this.socket.end();
        } catch (e) {
            console.error(e.message, e.stack);
        }
    }
};

IMAPConnection.prototype.onData = function(chunk) {
    var match, str;

    if (this._ignoreData) {
        // If TLS upgrade is initiated do not process current buffer
        this._remainder = '';
        this._command = '';
        return;
    }

    str = (chunk || '').toString('binary');

    if (this._literalRemaining) {
        if (this._literalRemaining > str.length) {
            this._literalRemaining -= str.length;
            this._command += str;
            return;
        }
        this._command += str.substr(0, this._literalRemaining);
        str = str.substr(this._literalRemaining);
        this._literalRemaining = 0;
    }

    this._remainder = str = this._remainder + str;
    while((match = str.match(/(\{(\d+)(\+)?\})?\r?\n/))) {
        if (!match[2]) {

            if (this.inputHandler) {
                this.inputHandler(this._command + str.substr(0, match.index));
            } else {
                this.scheduleCommand(this._command + str.substr(0, match.index));
            }

            this._remainder = str = str.substr(match.index + match[0].length);
            this._command = '';
            continue;
        }

        if (match[3] != '+') {
            if (this.socket && !this.socket.destroyed) {
                this.socket.write('+ Go ahead\r\n');
            }
        }

        this._remainder = '';
        this._command += str.substr(0, match.index + match[0].length);
        this._literalRemaining = Number(match[2]);

        str = str.substr(match.index + match[0].length);

        if (this._literalRemaining > str.length) {
            this._command += str;
            this._literalRemaining -= str.length;
            return;
        } else {
            this._command += str.substr(0, this._literalRemaining);
            this._remainder = str = str.substr(this._literalRemaining);
            this._literalRemaining = 0;
        }
    }
};

IMAPConnection.prototype.onNotify = function(notification) {
    if (notification.ignoreConnection == this) {
        return;
    }
    if (!notification.mailbox ||
        (this.selectedMailbox &&
            this.selectedMailbox == (
                typeof notification.mailbox == 'string' &&
                    this.getMailbox(notification.mailbox) || notification.mailbox))) {
        this.notificationQueue.push(notification.command);
        if (this.directNotifications) {
            this.processNotifications();
        }
    }
};

IMAPConnection.prototype.upgradeConnection = function(callback) {
    this._ignoreData = true;
    var pair = starttls(this.socket, this.options.credentials, (function(socket) {
        this._ignoreData = false;
        this._remainder = '';

        this.socket = socket;
        this.socket.on('data', this.onData.bind(this));
        this.secureConnection = true;

        if (!socket.authorized && this.options.debug) {
            console.log('WARNING: TLS ERROR ('+socket.authorizationError+')');
        }
        callback();
    }.bind(this)));
    pair.on('error', (function(err) {
        console.log(err);
        if (this.socket && !this.socket.destroyed) {
            this.socket.end();
        }
    }.bind(this)));
};

IMAPConnection.prototype.processNotifications = function(data) {
    var notification;
    for (var i=0; i < this.notificationQueue.length; i++) {
        notification = this.notificationQueue[i];

        if (data && ['FETCH', 'STORE', 'SEARCH'].indexOf((data.command || '').toUpperCase()) >= 0) {
            continue;
        }

        this.send(notification);
        this.notificationQueue.splice(i, 1);
        i--;
        continue;
    }
};

/**
 * Compile a command object to a response string and write it to socket.
 * If the command object has a skipResponse property, the command is
 * ignored
 *
 * @param {Object} data Command object
 */
IMAPConnection.prototype.send = function(data) {
    if (!this.socket || this.socket.destroyed) {
        return;
    }

    if (!data.notification && data.tag != '*') {
        // arguments[2] should be the original command
        this.processNotifications(arguments[2]);
    } else {
        // override values etc.
    }

    var args = Array.prototype.slice.call(arguments);
    this.server.outputHandlers.forEach((function(handler) {
        handler.apply(null, [this].concat(args));
    }.bind(this)));

    // No need to display this response to user
    if (data.skipResponse) {
        return;
    }

    var compiled = imapHandler.compiler(data);

    if (this.options.debug) {
        console.log('S: %s', compiled);
    }

    if (this.socket && !this.socket.destroyed) {
        try {
            this.socket.write(new Buffer(compiled + '\r\n', 'binary'));
        } catch(e) {
            console.warn(e.message);
        }
    }
};

IMAPConnection.prototype.scheduleCommand = function(data) {
    var parsed,
        tag = (data.match(/\s*([^\s]+)/) || [])[1] || '*';

    try {
        parsed = imapHandler.parser(data, {literalPlus: this.server.literalPlus});
    } catch (e) {
        console.error(e.message, e.stack);
        this.send({
            tag: '*',
            command: 'BAD',
            attributes:[
                {type: 'SECTION', section: [{type:'ATOM', value:'SYNTAX'}]},
                {type: 'TEXT', value: e.message}
            ]
        }, 'ERROR MESSAGE', null, data, e);

        this.send({
            tag: tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Error parsing command'}
            ]
        }, 'ERROR RESPONSE', null, data, e);

        return;
    }

    if (this.server.getCommandHandler(parsed.command)) {
        this._commandQueue.push({parsed: parsed, data: data});
        this.processQueue();
    } else {
        this.send({
            tag: parsed.tag,
            command: 'BAD',
            attributes:[
                {type: 'TEXT', value: 'Invalid command ' + parsed.command + ''}
            ]
        }, 'UNKNOWN COMMAND', parsed, data);
    }
};

IMAPConnection.prototype.processQueue = function(force) {
    var element;

    if (!force && this._processing) {
        return;
    }

    if (!this._commandQueue.length) {
        this._processing = false;
        return;
    }

    this._processing = true;

    element = this._commandQueue.shift();
    this.server.getCommandHandler(element.parsed.command)(this, element.parsed, element.data, (function() {
        if (!this._commandQueue.length) {
            this._processing = false;
        } else {
            this.processQueue(true);
        }
    }.bind(this)));
};

IMAPConnection.prototype.processMessage = function(message, mailbox) {
    // internaldate should always be a Date object
    message.internaldate = message.internaldate || new Date();
//    if (Object.prototype.toString.call(message.internaldate) == '[object Date]') {
//        message.internaldate = this.server.formatInternalDate(message.internaldate);
//    }
    message.flags = [].concat(message.flags || []);
    message.uid = message.uid || mailbox.uidnext++;

    // Allow plugins to process messages
    this.server.messageHandlers.forEach((function(handler) {
        handler(this, message, mailbox);
    }.bind(this)));
};

IMAPConnection.prototype.processMailbox = function(path, mailbox, namespace, callback) {
    mailbox.path = path;

    mailbox.namespace = namespace;
    mailbox.uid = mailbox.uid || 1;
    mailbox.uidvalidity = mailbox.uidvalidity || this.uidnextCache[path] || 1;
    mailbox.flags = [].concat(mailbox.flags || []);
    mailbox.allowPermanentFlags = 'allowPermanentFlags' in mailbox ? mailbox.allowPermanentFlags : true;
    mailbox.permanentFlags = [].concat(mailbox.permanentFlags || this.systemFlags);

    mailbox.subscribed = 'subscribed' in mailbox ? !!mailbox.subscribed : true;

    imap_utils.toggleFlags(mailbox.flags, ['\\HasChildren', '\\HasNoChildren'],
        mailbox.folders && Object.keys(mailbox.folders).length ? 0 : 1);

    // ensure highest uidnext
    this.storage.msgs_find(this.user, mailbox, null, 1, function(err, messages) {
        if (err) { callback(err); return }

        mailbox.uidnext = (messages.length ? messages[0].uid : 0) + 1;

        callback(err);
    });
};

/**
 * Appends a message to a mailbox
 *
 * @param {Object|String} mailbox Mailbox to append to
 * @param {Array} flags Flags for the message
 * @param {String|Date} internaldate Receive date-time for the message
 * @param {String} mail is a mail object
 * @param {Object} [ignoreConnection] To not advertise new message to selected connection
 *
 */
IMAPConnection.prototype.appendMessage = function(mailbox, flags, internaldate, mail, ignoreConnection, callback) {
    if (typeof mailbox == 'string') {
        mailbox = this.getMailbox(mailbox);
    }

    var message = extend(mail, {
        folder: mailbox['special-use'],
        flags: flags,
        internaldate: internaldate
    });

    this.processMessage(message, mailbox);

    this.storage.msg_insert(message, function(err) {
        if (err) throw err;

        this.storage.msgs_count(this.user, mailbox, function(err, count) {
            this.server.notify({
                tag: '*',
                attributes: [
                    count,
                    {type: 'ATOM', value: 'EXISTS'}
                ]
            }, mailbox, ignoreConnection);

            if (callback) {
                callback(null, message);
            }
        }.bind(this));
    }.bind(this));
};

/**
 * Removes messages with \Deleted flag
 *
 * @param {Boolean} [ignoreSelf] If set to true, does not send any notices to itself
 * @param {Boolean} [ignoreExists] If set to true, does not send EXISTS notice to itself
 * @param {Function} [callback]
 */
IMAPConnection.prototype.expungeDeleted = function(ignoreSelf, ignoreExists, callback) {
    // old copy is required for those sessions that run FETCH before
    // displaying the EXPUNGE notice
    var mailbox = this.selectedMailbox;
    this.storage.msgs_remove(this.user, mailbox, '\\Deleted', function(err, deleted_messages, count) {
        if (err) {callback(err); return}

        for (var i = 1; i <= count; i++) {
            this.server.notify({
                tag: '*',
                attributes: [i, {type: 'ATOM', value: 'EXPUNGE'}]
            }, mailbox, ignoreSelf ? this : false);
        }
        this.storage.msgs_count(this.user, mailbox, function(err, count) {
            this.server.notify({
                tag: '*',
                attributes: [
                    count,
                    {type: 'ATOM', value: 'EXISTS'}
                ],
                // distribute the old mailbox data with the notification
                mailboxCopy: deleted_messages
            }, mailbox, ignoreSelf || ignoreExists ? this : false);

            callback();
        }.bind(this));
    }.bind(this));
};

module.exports = IMAPConnection;
