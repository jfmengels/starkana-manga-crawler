module.exports = {
	convertSeriesToObject: function(seriesList) {
		var result = {};
		seriesList.forEach(function(series) {
			result[series.name] = series;
		});
		return result;
	},

	pick: function(object, keys) {
		var result = {};
		keys.forEach(function(key) {
			result[key] = object[key];
		});
		return result;
	}
};