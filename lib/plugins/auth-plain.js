'use strict';

/**
 * @help Adds AUTH=PLAIN capability
 * @help Supports SALS-IR [RFC4959] as well
 */

module.exports = function(server) {

    // Register AUTH=PLAIN capability for non authenticated state
    server.registerCapability('AUTH=PLAIN', function(connection) {
        return connection.state == 'Not Authenticated';
    });

    server.setCommandHandler('AUTHENTICATE PLAIN', function(connection, parsed, data, callback) {

        // Not allowed if already logged in
        if (connection.state != 'Not Authenticated') {
            connection.send({
                tag: parsed.tag,
                command: 'BAD',
                attributes:[
                    {type: 'TEXT', value: 'Already authenticated, identity change not allowed'}
                ]
            }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
            return callback();
        }

        // If this is the old style api, send + and wait for password
        if (!parsed.attributes) {

            // Temporarily redirect client input to this function
            connection.inputHandler = function(str) {

                // Stop listening to any other user input
                connection.inputHandler = false;

                var input = new Buffer(str, 'base64').toString().split('\x00'),
                    username = input[1] || '',
                    remote_password = input[2] || '';

                if (username === '' || remote_password === '') {
                    connection.send({
                        tag: parsed.tag,
                        command: 'BAD',
                        attributes:[
                            {type: 'TEXT', value: 'Login failed: empty username or password'}
                        ]
                    }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
                    return callback();
                }

                connection.storage.user_get(username, function(err, user) {
                    connection.storage.user_has_password(user, remote_password, function(err_checkout, result) {
                        if (!err && !err_checkout && result) {
                            connection.state = 'Authenticated';
                            connection.user = user;

                            connection.send({
                                tag: parsed.tag,
                                command: 'OK',
                                attributes:[
                                    {type: 'TEXT', value: 'User logged in'}
                                ]
                            }, 'AUTHENTICATE PLAIN SUCCESS', parsed, data);
                        } else {
                            connection.send({
                                tag: parsed.tag,
                                command: 'NO',
                                attributes:[
                                    {type: 'TEXT', value: 'Login failed: authentication failure'}
                                ]
                            }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
                        }
                        callback(null);
                    });
                });
            };

            // Send a + to the client
            if (connection.socket && !connection.socket.destroyed) {
                connection.socket.write('+\r\n');
            }

        } else if (parsed.attributes.length == 1 &&
            // second argument must be Base64 string as ATOM
            parsed.attributes[0].type == 'ATOM') {

            if (!server.capabilities['SASL-IR'] || !server.capabilities['SASL-IR'](connection)) {
                connection.send({
                    tag: parsed.tag,
                    command: 'BAD',
                    attributes:[
                        {type: 'TEXT', value: 'SASL-IR must be enabled to send Initial Response with the request'}
                    ]
                }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
                return callback();
            }

            var input = new Buffer(parsed.attributes[0].value, 'base64').toString().split('\x00'),
                username = input[1] || '',
                remote_password = input[2] || '';

            connection.storage.user_get(username, function(err, user) {
                connection.storage.user_has_password(user, remote_password, function(err_checkout, result) {
                    if (!err && !err_checkout && result) {
                        connection.state = 'Authenticated';
                        connection.user = user;
						connection.onAuthenticated(user);

                        connection.send({
                            tag: parsed.tag,
                            command: 'OK',
                            attributes:[
                                {type: 'TEXT', value: 'User logged in'}
                            ]
                        }, 'AUTHENTICATE PLAIN SUCCESS', parsed, data);
                    } else {
                        connection.send({
                            tag: parsed.tag,
                            command: 'NO',
                            attributes:[
                                {type: 'TEXT', value: 'Login failed: authentication failure'}
                            ]
                        }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
                    }
                });
            });
        } else {
            // Not correct AUTH=PLAIN
            connection.send({
                tag: parsed.tag,
                command: 'BAD',
                attributes:[
                    {type: 'TEXT', value: 'Invalid attributes for AUTHENTICATE PLAIN'}
                ]
            }, 'AUTHENTICATE PLAIN FAILED', parsed, data);
        }

        return callback();
    });
};
