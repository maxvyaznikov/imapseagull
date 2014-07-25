
var async = require("async");
var step = require("step");
var extend = require("xtend");
var mongojs = require("mongojs");
var events = require('events');
var path = require('path');
var fs = require("fs");
var bcrypt = require('bcrypt-nodejs');
var AppStorage = require('imapseagull-storage-mongo');

var IMAPServer = require('./lib/server');

var connection = process.env.IMAPSEAGULL_CONNECTION || 'mongodb://localhost:27017/localhost?auto_reconnect',
    messages = 'emails_test',
    users = 'users_test',
    db = mongojs(connection, [messages, users]);

var app_tests = {
    port: 143,
    name: 'localhost',
    testuser_email: 'testuser@test.com',
    testuser: null,

    db_messages: db[messages],
    db_users: db[users],

    uidnext: null,
    running: false
};

var MAIL_FIELDS = [
    'text',
    'headers',
    'subject',
    'messageId',
    'priority',
    'from',
    'to',
    'date',
    'attached_files',
    'flags',
    'internaldate',
    'uid'
];

var imap_opts = {
    debug: true,
    plugins: ['ID', 'STARTTLS', 'AUTH-PLAIN', 'SPECIAL-USE', 'NAMESPACE', 'IDLE', 'LOGINDISABLED', 'SASL-IR', 'ENABLE', 'LITERALPLUS', 'UNSELECT', 'CONDSTORE'],
    id: {
        name: app_tests.name,
        version: '1'
    },
    credentials: {
        key: fs.readFileSync(path.join(__dirname, './tests/server.crt')),
        cert: fs.readFileSync(path.join(__dirname, './tests/server.key'))
    },
    secureConnection: false,
    folders: {
        'INBOX': {
            'special-use': '\\Inbox',
            type: 'personal'
        },
        '': {
            folders: {
                'Drafts': {
                    'special-use': '\\Drafts',
                    type: 'personal'
                },
                'Sent': {
                    'special-use': '\\Sent',
                    type: 'personal'
                },
                'Junk': {
                    'special-use': '\\Junk',
                    type: 'personal'
                },
                'Trash': {
                    'special-use': '\\Trash',
                    type: 'personal'
                }
            }
        }
    }
};
var storage_opts = {
    name: app_tests.name,
    debug: true,
    attachments_path: path.join(__dirname, '../attachments'),
    connection: connection,
    messages: messages,
    users: users
};

app_tests.setUp = function(done) {
    app_tests.uidnext = 1;
    if (!app_tests.running) {
        console.log('[STARTED: setUp]');

        new AppStorage(storage_opts, function(err, storage) {
            app_tests.storage = storage.init();

            app_tests.storage.msgs_remove(null, null, null, function(err) { // DB cleared
                if (err) throw new Error(err);

                app_tests.db_users.remove({}, function(err) { // DB cleared
                    if (err) throw new Error(err);

                    console.log('[DB: cleared]');

                    var encrypted_password = 'testpass';
                    bcrypt.genSalt(10, function(err, salt) {
                        if (err) throw new Error(err);
                        bcrypt.hash(encrypted_password, salt, function() {}, function(err, hash) {
                            if (err) throw new Error(err);
                            encrypted_password = hash;

                            app_tests.db_users.insert({ // add test user
                                email: app_tests.testuser_email,
                                password: encrypted_password
                            }, function(err, user) {
                                if (err) throw new Error(err);

                                app_tests.testuser = user;
                                console.log('[DB: testuser added]');

                                var imapServer = IMAPServer(extend(imap_opts, {
                                    storage: app_tests.storage
                                }));

                                imapServer.on('close', function() {
                                    console.log('IMAP server closed');
                                });

                                imapServer.listen(app_tests.port, function() {
                                    app_tests.running = true;

                                    console.log('[FINISHED: setUp]');
                                    done();
                                });
                            });
                        });
                    });
                }.bind(this));
            }.bind(this));
        }.bind(this));
    } else {
        console.log('[FINISHED: setUp // already run]');
        done();
    }
};

function prepareMessage(message) {
    message.user = mongojs.ObjectId(''+ app_tests.testuser._id);
    message.folder = message.folder || '\\Inbox';
    message.flags = message.flags || [];

    message.uid = message.uid || app_tests.uidnext;
    app_tests.uidnext = message.uid + 1;

    message.internaldate = message.internaldate || new Date();
    return message;
}

app_tests.addMessages = function(mailbox_name, messages, done) {
    console.log('[STARTED: addMessages]');
    async.each(messages, function(message, callback) {
        console.log('[DB: new message]');
        if (typeof message === "object") {
            app_tests.storage.parse_raw_msg(function(mail) {
                MAIL_FIELDS.forEach(function(fld) { // only allowed fields
                    if (message[fld]) {
                        mail[fld] = message[fld];
                    }
                });
                app_tests.db_messages.insert(prepareMessage(mail), callback);
            }).end(message.raw);
        } else {
            app_tests.storage.parse_raw_msg(function(mail) {
                app_tests.db_messages.insert(prepareMessage(mail), callback);
            }).end(message);
        }
    }, function(err) {
        if (err) throw new Error(err);
        console.log('[FINISHED: addMessages]');
        done();
    });
};


app_tests.tearDown = function(done) {
    console.log('[STARTED: tearDown]');
    if (app_tests.storage) {
        app_tests.storage.msgs_remove(null, null, null, function () { // DB cleared
            console.log('[FINISHED: tearDown]');
            done();
        }.bind(this));
    } else {
        console.log('[FINISHED: tearDown // no storage]');
        done();
    }
};


app_tests.shutdown = function(test) {
    app_tests.imapServer.close(function() {
        app_tests.running = false;
        test.done();
    });
};

module.exports = app_tests;
