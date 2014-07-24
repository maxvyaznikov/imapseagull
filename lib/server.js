'use strict';

var Stream = require('stream').Stream,
    util = require('util'),
    net = require('net'),
    tls = require('tls'),
    IMAPConnection = require('./connection');

module.exports = function(options) {
    return new IMAPServer(options);
};

function IMAPServer(options) {
    Stream.call(this);

    this.options = options || {};

    if (this.options.secureConnection) {
        this.server = tls.createServer(this.options.credentials, this.createClient.bind(this));
    } else {
        this.server = net.createServer(this.createClient.bind(this));
    }
    this.server.on('error', this.onError);

    this.connectionHandlers = [];
    this.outputHandlers = [];
    this.messageHandlers = [];
    this.fetchHandlers = {};
    this.fetchFilters = [];
    this.searchHandlers = {};
    this.storeHandlers = {};
    this.storeFilters = [];
    this.commandHandlers = {};
    this.capabilities = {};
    this.allowedStatus = ['MESSAGES', 'RECENT', 'UIDNEXT', 'UIDVALIDITY', 'UNSEEN'];
    this.literalPlus = false;
    this.referenceNamespace = false;

    [].concat(this.options.plugins).forEach((function(plugin) {
        switch(typeof plugin) {
            case 'string':
                require('./plugins/' + plugin.toLowerCase())(this);
                break;
            case 'function':
                plugin(this);
                break;
        }
    }.bind(this)));

    this.systemFlags = [].concat(this.options.systemFlags || ['\\Answered', '\\Flagged', '\\Draft', '\\Deleted', '\\Seen']);
    if (!this.options.folders) {
        throw new Error("Can't find a folders");
    }

    this.storage = this.options.storage.init();
}
util.inherits(IMAPServer, Stream);

IMAPServer.prototype.listen = function() {
    var args = Array.prototype.slice.call(arguments);
    this.server.listen.apply(this.server, args);
};

IMAPServer.prototype.onError = function(err) {
    console.error('IMAPServer onError handler:', new Date(), err);
};

IMAPServer.prototype.close = function(callback) {
    this.server.close(callback);
    this.emit('close');
};

IMAPServer.prototype.createClient = function(socket) {
    var connection = new IMAPConnection(this, socket);
    this.connectionHandlers.forEach((function(handler) {
        handler(connection);
    }.bind(this)));
};

IMAPServer.prototype.registerCapability = function(keyword, handler) {
    this.capabilities[keyword] = handler || (function() {
        return true;
    });
};

IMAPServer.prototype.setCommandHandler = function(command, handler) {
    command = (command || '').toString().toUpperCase();
    this.commandHandlers[command] = handler;
};

/**
 * Schedules a notifying message
 *
 * @param {Object} command An object of untagged response message
 * @param {Object|String} mailbox Mailbox the message is related to
 * @param {Object} ignoreConnection if set the selected connection ignores this notification
 */
IMAPServer.prototype.notify = function(command, mailbox, ignoreConnection) {
    command.notification = true;
    this.emit('notify', {
        command: command,
        mailbox: mailbox,
        ignoreConnection: ignoreConnection
    });
};

/**
 * Retrieves a function for an IMAP command. If the command is not cached
 * tries to load it from a file in the commands directory
 *
 * @param {String} command Command name
 * @return {Function} handler for the specified command
 */
IMAPServer.prototype.getCommandHandler = function(command) {
    command = (command || '').toString().toUpperCase();

    var handler;

    // try to autoload if not supported
    if (!this.commandHandlers[command]) {
        try {
            handler = require('./commands/' + command.toLowerCase());
            this.setCommandHandler(command, handler);
        } catch (e) {
            console.error(e.message, e.stack);
        }
    }

    return this.commandHandlers[command] || false;
};
