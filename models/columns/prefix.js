module.exports = function(prefix, obj) {
	if(!obj) return obj;

	if(Array.isArray(obj)) {
		return obj.map(function(item) {
			return prefix + '.' + item;
		});
	} else {
		var result = {};

		Object.keys(obj).forEach(function(key) {
			result[prefix + '.' + key] = obj[key];
		});

		return result;
	}
};
