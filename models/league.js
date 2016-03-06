var extend = require('xtend/mutable');
var errors = require('httperrors');
var parallel = require('run-parallel');
var through = require('through2');
var pumpify = require('pumpify');
var collect = require('stream-collector');
var find = require('array-find');

var db = require('../db');
var columns = require('../columns');
var alias = require('./columns/alias');
var prefix = require('./columns/prefix');
var group = require('./columns/group');
var User = require('./user');

var noop = function() {};

var League = function(data) {
	if(!data.participants) data.participants = [];

	data.owners = data.owners.map(function(owner) {
		return (owner instanceof User) ? owner : new User(owner);
	});

	data.participants = data.participants.map(function(participant) {
		return (participant instanceof User) ? participant : new User(participant);
	});

	extend(this, data);
};

League.columns = columns.leagues;

League.find = function(query, callback) {
	League.all(query, function(err, leagues) {
		if(err) return callback(err);
		if(!leagues.length) return callback(errors.NotFound('League not found'));

		callback(null, leagues[0]);
	});
};

League.all = function(query, callback) {
	if(!callback && typeof query === 'function') {
		callback = query;
		query = {};
	}

	var columns = alias('users', User.columns)
		.concat(alias('leagues', League.columns));

	var stream = db
		.select(columns.concat(db.raw('0 as users_type')))
		.from('leagues')
		.innerJoin('league_owners', 'league_owners.league_id', '=', 'leagues.id')
		.innerJoin('users', 'users.id', '=', 'league_owners.user_id')
		.where(prefix('leagues', query))
		.unionAll(function() {
			this
				.select(columns.concat(db.raw('1 as users_type')))
				.from('leagues')
				.innerJoin('league_participants', 'league_participants.league_id', '=', 'leagues.id')
				.innerJoin('users', 'users.id', '=', 'league_participants.user_id')
				.where(prefix('leagues', query));
		})
		.orderBy('leagues_id', 'asc')
		.orderBy('users_type', 'asc')
		.orderBy('users_id', 'asc')
		.stream();

	var current = null;

	var write = function(data, encoding, callback) {
		data = group(data);

		var league = data.leagues;
		var user = data.users;

		if(!current || current.id !== league.id) {
			if(current) this.push(new League(current));

			current = league;
			current.owners = [];
			current.participants = [];
		}

		if(user.type === 0) current.owners.push(user);
		if(user.type === 1) current.participants.push(user);

		callback();
	};

	var flush = function(callback) {
		if(current) this.push(new League(current));
		callback();
	};

	var transform = through.obj(write, flush);
	var pump = pumpify.obj(stream, transform);

	if(callback) collect(pump, callback);
	return pump;
};

League.create = function(data, owners, participants, callback) {
	if(!callback && typeof participants === 'function') {
		callback = participants;
		participants = null;
	}

	participants = participants || [];

	if(!Array.isArray(owners)) owners = [owners];
	if(!Array.isArray(participants)) participants = [participants];

	if(!data || !data.name || !owners.length) return callback(errors.UnprocessableEntity('Invalid league data'));

	db.transaction(function(transaction) {
		var	now = new Date();

		var onerror = function(err) {
			transaction
				.rollback()
				.asCallback(function() {
					callback(err);
				});
		};

		var onsuccess = function(data) {
			transaction
				.commit()
				.asCallback(function(err) {
					if(err) return callback(err);

					data.owners = owners;
					data.participants = participants;
					callback(null, new League(data));
				});
		};

		var relation = function(table, league, users) {
			users = users.map(function(user) {
				return {
					user_id: user.id,
					league_id: league.id,
					created_at: now,
					updated_at: now
				};
			});

			return function(callback) {
				db
					.insert(users)
					.into(table)
					.transacting(transaction)
					.asCallback(callback);
			};
		};

		db
			.insert({
				name: data.name,
				created_at: now,
				updated_at: now
			})
			.into('leagues')
			.transacting(transaction)
			.returning('*')
			.asCallback(function(err, data) {
				if(err) return onerror(err);
				data = data[0];

				parallel([
					relation('league_owners', data, owners),
					relation('league_participants', data, participants)
				], function(err) {
					if(err) return onerror(err);
					onsuccess(data);
				});
			});

	})
	.asCallback(noop);
};

League.addOwner = function(id, user, callback) {
	var now = new Date();

	db
		.insert({
			user_id: user.id,
			league_id: id,
			created_at: now,
			updated_at: now
		})
		.into('league_owners')
		.asCallback(function(err) {
			callback(err);
		});
};

League.deleteOwner = function(id, user, callback) {
	db.transaction(function(transaction) {
		var onerror = function(err) {
			transaction
				.rollback()
				.asCallback(function() {
					callback(err);
				});
		};

		var onsuccess = function() {
			transaction
				.commit()
				.asCallback(function(err) {
					callback(err)
				});
		};

		var count = db.raw('(select count(*) from "league_owners" where "league_id" = ?) > 1', id);

		db
			.del()
			.from('league_owners')
			.where({ user_id: user.id, league_id: id })
			.andWhere(count)
			.transacting(transaction)
			.asCallback(function(err) {
				if(err) return onerror(err);
				onsuccess();
			});
	})
	.asCallback(noop);
};

League.addParticipant = function(id, user, callback) {
	var now = new Date();

	db
		.insert({
			user_id: user.id,
			league_id: id,
			created_at: now,
			updated_at: now
		})
		.into('league_participants')
		.asCallback(function(err) {
			callback(err);
		});
};

League.prototype.findOwner = function(user) {
	var id = user.id ? user.id : parseInt(user, 10);

	return find(this.owners, function(owner) {
		return owner.id === id;
	});
};

League.prototype.findParticipant = function(user) {
	var id = user.id ? user.id : parseInt(user, 10);

	return find(this.participants, function(participant) {
		return participant.id === id;
	});
};

module.exports = League;
