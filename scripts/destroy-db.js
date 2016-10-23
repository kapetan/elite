var db = require('../db');

var onerror = function(err) {
	if(err) throw err;
};

db.schema
	.dropTableIfExists('integrations')
	.dropTableIfExists('match_participants')
	.dropTableIfExists('matches')
	.dropTableIfExists('league_participants')
	.dropTableIfExists('league_owners')
	.dropTableIfExists('leagues')
	.dropTableIfExists('users')
	.asCallback(function(err) {
		if(err) return onerror(err);
		db.destroy(onerror);
	});
