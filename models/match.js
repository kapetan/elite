var extend = require('xtend/mutable');
var errors = require('httperrors');
var through = require('through2');
var pumpify = require('pumpify');
var collect = require('stream-collector');
var elo = require('elo-rank')();
var values = require('object-values');
var validator = require('is-my-json-valid');
var moment = require('moment');

var db = require('../db');
var columns = require('../columns');
var alias = require('./columns/alias');
var prefix = require('./columns/prefix');
var group = require('./columns/group');
var User = require('./user');

var INITIAL_POINTS = 1200;

var noop = function() {};

var Match = function(data) {
	data.participants.forEach(function(participant) {
		var user = participant.user;
		participant.user = (user instanceof User) ? user : new User(user);
	});

	var self = this;

	data.participants.forEach(function(participant) {
		var current = self.winner;

		self.draw = participant.score === data.participants[0].score;
		self.winner = !self.winner || self.winner.score < participant.score ? participant : self.winner;
		self.loser = self.winner !== participant ? participant : current;
	});

	extend(this, data);

	this.date = moment(data.created_at).format('dddd, DD MMMM');
};

Match.columns = columns.matches;

Match.valid = validator({
	type: 'object',
	additionalProperties: false,
	properties: {
		participants: {
			type: 'array',
			minItems: 2,
			maxItems: 2,
			items: { type: ['string', 'integer'] }
		},
		scores: {
			type: 'array',
			minItems: 2,
			maxItems: 2,
			items: {
				type: 'integer',
				minimum: 0
			}
		}
	},
	required: ['participants', 'scores']
});

Match.find = function(query, callback) {
	Match.all(query, function(err, matches) {
		if(err) return callback(err);
		if(!matches.length) return callback(errors.NotFound('Match not found'));

		callback(null, matches[0]);
	});
};

Match.all = function(query, order, callback) {
	if(!callback && typeof order === 'function') {
		callback = order;
		order = null;
	}
	if(!callback && typeof query === 'function') {
		callback = query;
		query = {};
	}

	var columns = alias('users', User.columns)
		.concat(alias('matches', Match.columns))
		.concat('match_participants.score as users_score');

	var stream = db
		.select(columns)
		.from('matches')
		.innerJoin('match_participants', 'match_participants.match_id', '=', 'matches.id')
		.innerJoin('users', 'users.id', '=', 'match_participants.user_id')
		.where(prefix('matches', query))
		.orderBy('matches.id', order || 'asc')
		.orderBy('users.id', 'asc')
		.stream();

	var current = null;

	var write = function(data, encoding, callback) {
		data = group(data);

		var match = data.matches;
		var user = data.users;

		if(!current || current.id !== match.id) {
			if(current) this.push(new Match(current));

			current = match;
			current.participants = [];
		}

		current.participants.push({
			score: user.score,
			user: user
		});

		callback();
	};

	var flush = function(callback) {
		if(current) this.push(new Match(current));
		callback();
	};

	var transform = through.obj(write, flush);
	var pump = pumpify.obj(stream, transform);

	if(callback) collect(pump, callback);
	return pump;
};

Match.create = function(participants, league, callback) {
	if(participants.length !== 2) {
		return callback(errors.UnprocessableEntity('Wrong number of match participants'));
	}

	var dup = participants.some(function(p, i) {
		return participants.some(function(r, j) {
			return i !== j && p.user.id === r.user.id;
		});
	});

	if(dup) {
		return callback(errors.UnprocessableEntity('Duplicate match participant'));
	}

	db.transaction(function(transaction) {
		var now = new Date();

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

					data.participants = participants;
					callback(null, new Match(data));
				});
		};

		var ids = participants.map(function(participant) {
			return participant.user.id;
		});

		db('league_participants')
			.count('*')
			.transacting(transaction)
			.where({ league_id: league.id })
			.whereIn('user_id', ids)
			.asCallback(function(err, rows) {
				if(err) return onerror(err);

				var count = parseInt(rows[0].count, 10);

				if(count !== participants.length) {
					return onerror(errors.UnprocessableEntity('Match participant not part of league'));
				}

				db
					.insert({
						league_id: league.id,
						created_at: now,
						updated_at: now
					})
					.into('matches')
					.transacting(transaction)
					.returning('*')
					.asCallback(function(err, data) {
						if(err) return onerror(err);
						data = data[0];

						var inserts = participants.map(function(participant) {
							return {
								user_id: participant.user.id,
								match_id: data.id,
								score: participant.score,
								created_at: now,
								updated_at: now
							};
						});

						db
							.insert(inserts)
							.into('match_participants')
							.transacting(transaction)
							.asCallback(function(err) {
								if(err) return onerror(err);
								onsuccess(data);
							});
					});
			});
	})
	.asCallback(noop);
};

Match.rankings = function(league, callback) {
	var stream = Match.all({ league_id: league.id });
	var result = {};

	var write = function(match, encoding, callback) {
		var updates = [];
		var points = match.participants.reduce(function(acc, participant) {
			return acc + participant.score;
		}, 0);

		match.participants.forEach(function(participant) {
			var user = participant.user;
			var score = participant.score;
			var entry = result[user.id];

			if(!entry) {
				entry = {
					user: user,
					gp: 0,
					w: 0,
					d: 0,
					l: 0,
					pf: 0,
					pa: 0,
					pts: INITIAL_POINTS
				};

				result[user.id] = entry;
			}

			entry.gp += 1;
			entry.pf += score;
			entry.pa += (points - score);

			match.participants.forEach(function(opponent) {
				if(opponent === participant) return;

				var draw = opponent.score === score;
				var won = !draw && score > opponent.score;

				if(draw) entry.d++;
				else if(won) entry.w++;
				else entry.l++;

				var pts = result[opponent.id] ? result[opponent.id].pts : INITIAL_POINTS;

				var expected = elo.getExpected(entry.pts, pts);
				var actual = draw ? 0.5 : (won ? 1 : 0);
				var updated = elo.updateRating(expected, actual, entry.pts);

				updates.push([entry, updated]);
			});
		});

		updates.forEach(function(u) {
			u[0].pts = u[1];
		});

		callback();
	};

	var transform = through.obj(write);
	var pump = pumpify(stream, transform);

	collect(pump, function(err) {
		if(err) return callback(err);

		result = values(result).sort(function(a, b) {
			return b.pts - a.pts;
		});

		callback(null, result);
	});
};

module.exports = Match;
