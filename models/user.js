var gravatar = require('gravatar');
var bcrypt = require('bcrypt');
var extend = require('xtend/mutable');
var errors = require('httperrors');
var validator = require('is-my-json-valid');

var db = require('../db');
var columns = require('../columns');

var ROUNDS = 2;

var User = function(data) {
	extend(this, data);

	this.profile = User.profile(data.email);
};

User.columns = columns.users;

User.profile = function(email) {
	return gravatar.url(email, { s: 40, d: 'mm' });
};

User.valid = validator({
	type: 'object',
	additionalProperties: false,
	properties: {
		name: { type: 'string' },
		email: { type: 'string' },
		password: { type: 'string' }
	},
	required: ['name', 'email', 'password']
});

User.find = function(query, callback) {
	User.all(query, function(err, users) {
		if(err) return callback(err);
		if(!users.length) return callback(errors.NotFound('User not found'));

		callback(null, users[0]);
	});
};

User.all = function(query, callback) {
	if(!callback) {
		callback = query;
		query = {};
	}

	db
		.select('*')
		.from('users')
		.where(query)
		.asCallback(function(err, rows) {
			if(err) return callback(err);

			var users = rows.map(function(row) {
				return new User(row);
			});

			callback(null, users);
		});
};

User.create = function(data, callback) {
	if(!User.valid(data)) return callback(errors.UnprocessableEntity('Invalid user data'));

	bcrypt.hash(data.password, ROUNDS, function(err, hash) {
		if(err) return callback(err);

		var now = new Date();

		db
			.insert({
				name: data.name,
				email: data.email,
				password: hash,
				created_at: now,
				updated_at: now
			})
			.into('users')
			.returning('*')
			.asCallback(function(err, data) {
				if(err) return callback(err);
				callback(null, new User(data[0]));
			});
	});
};

User.update = function(id, data, callback) {
	var onhash = function(hash) {
		var update = {};

		if(data.name) update.name = data.name;
		if(data.email) update.email = data.email;
		if(hash) update.password = hash;

		if(!data.name && !data.email && !hash) return User.find({ id: id }, callback);
		else update.updated_at = new Date();

		db('users')
			.update(update)
			.where({ id: id })
			.returning('*')
			.asCallback(function(err, data) {
				if(err) return callback(err);
				callback(null, new User(data[0]));
			});
	};

	if(!data.password) onhash();
	else {
		bcrypt.hash(data.password, ROUNDS, function(err, hash) {
			if(err) return callback(err);
			onhash(hash);
		});
	}
};

User.prototype.authenticate = function(password, callback) {
	bcrypt.compare(password || '', this.password, callback);
};

module.exports = User;
