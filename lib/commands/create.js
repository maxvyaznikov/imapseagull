'use strict';

module.exports = function(connection, parsed, data, callback) {

	if (!parsed.attributes ||
		parsed.attributes.length != 1 ||
		!parsed.attributes[0]
	) {

		connection.send({
			tag: parsed.tag,
			command: 'BAD',
			attributes:[
				{type: 'TEXT', value: 'CREATE expects 1 mailbox name'}
			]
		}, 'INVALID COMMAND', parsed, data);
		callback();
	}

	if (['Authenticated', 'Selected'].indexOf(connection.state) < 0) {
		connection.send({
			tag: parsed.tag,
			command: 'BAD',
			attributes:[
				{type: 'TEXT', value: 'Log in first'}
			]
		}, 'CREATE FAILED', parsed, data);
		callback();
	}

	var path = parsed.attributes[0].value,
		mailbox = connection.getMailbox(path);


	if (mailbox) {
		connection.send({
			tag: parsed.tag,
			command: 'NO',
			attributes:[
				{type: 'TEXT', value: 'Mailbox already exists!'}
			]
		}, 'CREATE FAILED', parsed, data);
		callback();
	}

	connection.storage.create_folder(connection.user, path, function(){

		connection.indexFolders(function(){

			connection.send({
				tag: parsed.tag,
				command: 'OK',
				attributes: [
					{type: 'TEXT', value: 'completed'}
				]
			}, 'CREATE', parsed, data);
			
		});

	})



};
