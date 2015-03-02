var path = require("path");

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
	},

	folderName: function(series, number) {
		return series + " " + number;
	},

	parseNumber: function(item, delimiter) {
		return parseFloat(item.slice(item.indexOf(delimiter) + delimiter.length));
	}
};