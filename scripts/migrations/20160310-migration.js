var db = require('../../db');

var onerror = function(err) {
	if(err) throw err;
};

db.schema
	.createTable('integrations', function(table) {
		table.increments('id');
		table.integer('league_id').notNullable();
		table.foreign('league_id').references('leagues.id');
		table.integer('type_id').notNullable();
		table.unique(['league_id', 'type_id']);
		table.json('data').notNullable();
		table.timestamps();
	})
	.asCallback(function(err) {
		if(err) return onerror(err);
		db.destroy(onerror);
	});
