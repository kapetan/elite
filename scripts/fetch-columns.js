var fs = require('fs');
var path = require('path');

var db = require('../db');

var onerror = function(err) {
	if(err) throw err;
};

db
	.select('table_name', 'column_name')
	.from('information_schema.columns')
	.where({ table_schema: 'public' })
	.orderBy('table_name', 'asc')
	.asCallback(function(err, rows) {
		if(err) return onerror(err);

		var json = {};

		rows.forEach(function(row) {
			json[row.table_name] = json[row.table_name] || [];
			json[row.table_name].push(row.column_name);
		});

		json = JSON.stringify(json, null, 2);

		var filename = path.join(__dirname, '..', 'columns.json');

		fs.writeFile(filename, json, function(err) {
			if(err) return onerror(err);
			db.destroy(onerror);
		});
	});
