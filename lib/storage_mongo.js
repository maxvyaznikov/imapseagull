
var bcrypt = require('bcrypt-nodejs');
var mongojs = require('mongojs');
var uuid = require('node-uuid');
var path = require('path');
var fs = require('fs');
var extend = require('xtend');
var MailComposer = require('mailcomposer').MailComposer;
var MailParser = require('mailparser').MailParser;


function MongoDecorator(cfg, callback) {
    this._cfg = cfg;
    this.debug = cfg.debug;
    this.attachments_path = cfg.attachments_path;
    this.server_name = cfg.name;

    callback(null, this);
    return this
}

MongoDecorator.prototype.init = function() {
    this._db = mongojs(this._cfg.connection, [this._cfg.messages, this._cfg.users]);

    this._messages = this._db[this._cfg.messages];
    this._users = this._db[this._cfg.users];
    return this
};

/**
 * Short usage:
 * parse_raw_msg(function(mail) { ... }).end(raw);
 *
 * @param callback (Function) will be called when message is parsed
 * @return MailParser object to stream data
 *
 * Parsed mail object (like return by https://github.com/andris9/mailparser):
 *     headers - unprocessed headers in the form of - {key: value} - if there were multiple fields with the same key then the value is an array
 *     from - an array of parsed From addresses - [{address:'sender@example.com',name:'Sender Name'}] (should be only one though)
 *     to - an array of parsed To addresses
 *     cc - an array of parsed Cc addresses
 *     bcc - an array of parsed 'Bcc' addresses
 *     subject - the subject line
 *     references - an array of reference message id values (not set if no reference values present)
 *     inReplyTo - an array of In-Reply-To message id values (not set if no in-reply-to values present)
 *     priority - priority of the e-mail, always one of the following: normal (default), high, low
 *     text - text body
 *     html - html body
 *     date - date field as a Date() object. If date could not be resolved or is not found this field is not set. Check the original date string from headers.date
 *     attachments - an array of attachments,
 *          attachment object contains:
 *                   filePath: '/tmp/1234',
 *                   cid: '123123123123@localhost',
 *                   fileName: 'image.png',
 *                   length: 126,
 *                   contentType: 'image/png'
 */
MongoDecorator.prototype.parse_raw_msg = function(callback) {
    var mailparser = new MailParser({
        defaultCharset: 'UTF-8',
        streamAttachments: true,
        forceEmbeddedImages: true
    });
    mailparser.attached_files = [];
    mailparser.on('attachment', (function(attachment){
        var full_path = path.join(this.attachments_path, attachment.generatedFileName),
            output = fs.createWriteStream(full_path);
        attachment.stream.pipe(output);
        mailparser.attached_files.push({
            filePath: full_path,
            fileName: attachment.generatedFileName,
            cid: attachment.contentId,
            length: attachment.length,
            contentType: attachment.contentType
        });
    }.bind(this)));
    mailparser.on('end', function(mail) {
        mail.attached_files = mailparser.attached_files;
        delete mail.attachments;
        callback(mail);
    });
    return mailparser;
};

var fields_to_exclude = ['content-type', 'content-transfer-encoding', 'subject', 'from', 'to'];
MongoDecorator.prototype.build_raw_msg = function(message, callback) {
    if (message.raw) {
        return callback(null, message.raw);
    }
    var mailcomposer = new MailComposer();
    // TODO: useDKIM
    mailcomposer.setMessageOption({
        subject: message.subject,
        from: message.headers && message.headers['from'] || message.from && message.from.address || message.from, // message.from,
        to: message.headers && message.headers['to'] || message.to && message.to.address || message.to, // message.to,
        text: message.text,
        html: message.html
    });
    for (var name in message.headers) {
        if (message.headers.hasOwnProperty(name) && fields_to_exclude.indexOf(name) < 0) {
            mailcomposer.addHeader(name, message.headers[name]);
        }
    }
    if (message.attached_files) {
        message.attached_files.forEach(function(attachment) {
            mailcomposer.addAttachment(attachment);
        });
    }
    return mailcomposer.buildMessage(function(err, raw) {
        message.raw = raw; //cache result
        callback(err, raw);
    });
};

/**
 *
 * @param {Object} user should contain at least an _id
 * @param {Object|string} [folder]
 * @param {Array} [flags] leave null if don't want to use
 * @param {int} [limit] leave null if don't want to use
 * @param {func} [callback]
 */
MongoDecorator.prototype.msgs_find = function(user, folder, flags, limit, callback) {
    var query = {};
    if (user) {
        query.user = user._id;
    }
    if (folder) {
        query.folder = folder['special-use'] || folder;
    }
    if (flags) {
        query.flags = flags;
    }
    if (limit) {
        this._messages.find(query).sort({uid: -1}).limit(limit, callback);
    } else {
        this._messages.find(query).sort({uid: -1}, callback);
    }
};

/**
 * TODO: increase uidnext into folder of IMAPServer somehow
 *
 * @param message should have structure described in comments  to IMAPServer.prototype.parse_raw_msg
 * @param callback
 */
MongoDecorator.prototype.msg_insert = function(message, callback) {
    console.log('Inserting new message: %s -> %s', JSON.stringify(message.from), JSON.stringify(message.to));
    if (message && message._id) {
        delete message._id;
    }
    this._messages.insert(message, callback);
};

MongoDecorator.prototype.msg_update = function(message, callback) {
    console.log('Updating message: %s -> %s', JSON.stringify(message.from), JSON.stringify(message.to));
    if (this.debug && !message._id) {
        console.trace("Variable 'message._id' is not set");
    }
    this._messages.update({
        _id: message._id
    }, message, callback);
};


MongoDecorator.prototype.msgs_count = function(user, folder, callback) {
    var query = {};
    if (user) {
        query.user = user._id;
    }
    if (folder) {
        query.folder = folder['special-use'] || folder;
    }
    this._messages.count(query, callback);
};

/**
 *
 * @param {Object} user should contain at least an _id
 * @param folder
 * @param flags
 * @param {function} [callback] will be called with arguments: {String} err, {Array} deleted_messages, {Number} count
 */
MongoDecorator.prototype.msgs_remove = function(user, folder, flags, callback) {
    var query = {};
    if (user) {
        query.user = user._id;
    }
    if (folder) {
        query.folder = folder['special-use'] || folder;
    }
    if (flags) {
        query.flags = flags;
    }
    this._messages.find(query, function(err, deleted_messages) {
        if (err) {callback(err); return}

        this._messages.remove(query, function(err, opt) {
            callback(err, deleted_messages, opt && opt.n || 0);
        });
    }.bind(this));
};


/**
 *
 * @param {String/Array} username - string username of array of usernames
 * @param {function} [callback] will be called with arguments: {String} err, {Array} deleted_messages, {Number} count
 */
MongoDecorator.prototype.user_get = function(username, callback) {
    var query = {};
    if (Object.prototype.toString.call(username) == '[object Array]') {
        query.email = {$in: username}
    } else {
        query.email = username.indexOf('@') >= 0 ? username : username + '@' + this.server_name
    }
    this._users.find(query).limit(1, function(err, users) {
        callback(err, users && users.length && users[0] || null)
    });
};

/**
 *
 * @param user {Object} is a result of `user_get` function
 * @param remote_password {String}
 * @param callback {Function}
 * @returns boolean
 */
MongoDecorator.prototype.user_has_password = function(user, remote_password, callback) {
    if (!remote_password || !user) {
        callback(null, false);
    } else {
        bcrypt.compare(remote_password, user.password, callback);
    }
//    callback(null, remote_password && user && user.password === remote_password)
};

module.exports = MongoDecorator;
