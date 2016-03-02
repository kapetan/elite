var knex = require('knex');

var db = knex({
	client: 'pg',
	connection: {
		host: '127.0.0.1',
		database: 'elite'
	}
});

module.exports = db;
