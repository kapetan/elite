module.exports = function(obj, separator) {
	separator = separator || '_';

	var result = {};

	Object.keys(obj).forEach(function(key) {
		var parts = key.split(separator);
		var prefix = parts.shift();
		var suffix = parts.join(separator);

		result[prefix] = result[prefix] || {};
		result[prefix][suffix] = obj[key];
	});

	return result;
};
