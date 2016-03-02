var util = require('util');

module.exports = function(table, array, separator) {
	separator = separator || '_';

	return array.map(function(item) {
		return util.format('%s.%s as %s%s%s', table, item, table, separator, item);
	});
};
