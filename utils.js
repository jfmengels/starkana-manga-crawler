module.exports = {
	convertSeriesToObject: function(seriesList) {
		var result = {};
		seriesList.forEach(function(series) {
			result[series.name] = series;
		});
		return result;
	}
};