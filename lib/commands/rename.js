'use strict';

module.exports = function(connection, parsed, data, callback) {

	if (!parsed.attributes ||
		parsed.attributes.length != 2 ||
		!parsed.attributes[0] ||
		!parsed.attributes[1]
	) {

		connection.send({
			tag: parsed.tag,
			command: 'BAD',
			attributes:[
				{type: 'TEXT', value: 'RENAME expects 1 mailbox name'}
			]
		}, 'INVALID COMMAND', parsed, data);
		callback();
		return;
	}

	if (['Authenticated', 'Selected'].indexOf(connection.state) < 0) {
		connection.send({
			tag: parsed.tag,
			command: 'BAD',
			attributes:[
				{type: 'TEXT', value: 'Log in first'}
			]
		}, 'RENAME FAILED', parsed, data);
		callback();
		return;
	}

	var oldPath = parsed.attributes[0].value,
		oldMailbox = connection.getMailbox(oldPath);

	var newPath = parsed.attributes[1].value,
		newMailbox = connection.getMailbox(newPath);


	if (!oldMailbox) {
		connection.send({
			tag: parsed.tag,
			command: 'NO',
			attributes:[
				{type: 'TEXT', value: 'Mailbox does not exist'}
			]
		}, 'RENAME FAILED', parsed, data);
		callback();
		return;
	}

	if (newMailbox) {
		connection.send({
			tag: parsed.tag,
			command: 'NO',
			attributes:[
				{type: 'TEXT', value: 'Mailbox already exists'}
			]
		}, 'RENAME FAILED', parsed, data);
		callback();
		return;
	}

	connection.storage.rename_folder(connection.user, oldPath, newPath, function(){

		connection.indexFolders(function(){

			connection.send({
				tag: parsed.tag,
				command: 'OK',
				attributes: [
					{type: 'TEXT', value: 'completed'}
				]
			}, 'RENAME', parsed, data);

		});

	})



};
