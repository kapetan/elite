var db = require('../db');

var onerror = function(err) {
	if(err) throw err;
};

db.schema
	.createTable('users', function(table) {
		table.increments('id');
		table.string('name').notNullable();
		table.string('email')
			.unique()
			.notNullable();
		table.string('password').notNullable();
		table.timestamps();
	})
	.createTable('leagues', function(table) {
		table.increments('id');
		table.string('name').notNullable();
		table.timestamps();
	})
	.createTable('league_owners', function(table) {
		table.increments('id');
		table.integer('user_id').notNullable();
		table.foreign('user_id').references('users.id');
		table.integer('league_id').notNullable();
		table.foreign('league_id').references('leagues.id');
		table.unique(['league_id', 'user_id']);
		table.timestamps();
	})
	.createTable('league_participants', function(table) {
		table.increments('id');
		table.integer('user_id').notNullable();
		table.foreign('user_id').references('users.id');
		table.integer('league_id').notNullable();
		table.foreign('league_id').references('leagues.id');
		table.unique(['league_id', 'user_id']);
		table.timestamps();
	})
	.createTable('matches', function(table) {
		table.increments('id');
		table.integer('league_id').notNullable();
		table.foreign('league_id').references('leagues.id');
		table.timestamps();
	})
	.createTable('match_participants', function(table) {
		table.increments('id');
		table.integer('score')
			.notNullable()
			.defaultTo(0);
		table.integer('match_id').notNullable();
		table.foreign('match_id').references('matches.id');
		table.integer('user_id').notNullable();
		table.foreign('user_id').references('users.id');
		table.timestamps();
	})
	.asCallback(function(err) {
		if(err) return onerror(err);
		db.destroy(onerror);
	});
