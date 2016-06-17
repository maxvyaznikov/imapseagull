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
				{type: 'TEXT', value: 'DELETE expects 1 mailbox name'}
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
		}, 'DELETE FAILED', parsed, data);
		callback();
		return;

	}

	var path = parsed.attributes[0].value,
		mailbox = connection.getMailbox(path);


	if (!mailbox) {
		connection.send({
			tag: parsed.tag,
			command: 'NO',
			attributes:[
				{type: 'TEXT', value: 'Mailbox does not exist!'}
			]
		}, 'DELETE FAILED', parsed, data);
		callback();
		return;
	}
	if (mailbox['special-use']) {
		connection.send({
			tag: parsed.tag,
			command: 'NO',
			attributes:[
				{type: 'TEXT', value: 'Cannot delete special mailboxes!'}
			]
		}, 'DELETE FAILED', parsed, data);
		callback();
		return;

	}

	connection.storage.delete_folder(connection.user, path, function(){

		connection.indexFolders(function(){


		});

		connection.send({
			tag: parsed.tag,
			command: 'OK',
			attributes: [
				{type: 'TEXT', value: 'completed'}
			]
		}, 'DELETE', parsed, data);

	})



};
