var parallel = require('run-parallel');

var db = require('../db');
var seed = require('./seed.json');
var User = require('../models/user');
var League = require('../models/league');
var Match = require('../models/match');

var onerror = function(err) {
	if(err) throw err;
};

var toObject = function(array) {
	return array.reduce(function(acc, item) {
		acc[item.email] = item;
		return acc;
	}, {});
};

var onusers = function(err, users) {
	if(err) return onerror(err);

	users = toObject(users);

	var leagues = seed.leagues.map(function(league) {
		return function(next) {
			var owners = league.owners.map(function(owner) {
				return users[owner];
			});

			var participants = league.participants.map(function(participant) {
				return users[participant];
			});

			League.create(league, owners, participants, next);
		};
	});

	parallel(leagues, function(err, leagues) {
		onleagues(err, users, leagues);
	});
};

var onleagues = function(err, users, leagues) {
	if(err) return onerror(err);

	var matches = seed.matches.map(function(match) {
		return function(next) {
			var participants = match.participants.map(function(participant) {
				return { user: users[participant.user], score: participant.score };
			});

			var league = leagues[match.league];

			Match.create(participants, league, next);
		};
	});

	parallel(matches, function(err) {
		if(err) return onerror(err);
		db.destroy(onerror);
	});
};

var users = seed.users.map(function(user) {
	return function(next) {
		User.create(user, next);
	};
});

parallel(users, onusers);
