var knex = require('knex');

var CONNECTION = process.env.DATABASE_URL || 'postgres://127.0.0.1/elite';

var db = knex({
	client: 'pg',
	connection: CONNECTION
});

module.exports = db;
