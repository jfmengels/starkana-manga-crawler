var fs = require("fs");
var path = require("path");
var async = require("async");

var utils = require("./utils");
var crawler = require("./crawler");

function selectSeries(selectedSeries, config) {
    // Filtering + adding series
    if (selectedSeries.length === 0) {
        return config.subscriptions;
    }

    var seriesList = config.subscriptions;

    var seriesObject = utils.convertSeriesToObject(seriesList);

    // Filtering out series in the subscriptions
    var subscriptions = seriesList.filter(function(s) {
        return selectedSeries.indexOf(s.name) > -1;
    });

    // Adding those in the filter that are not in the subscriptions
    return subscriptions.concat(selectedSeries
        .filter(function(s) {
            return !seriesObject[s];
        })
        .map(function(name) {
            return {
                name: name
            };
        })
    );
}


var updater = {};

updater.findLatestChapterInFolder = function(folder, series, cb) {
    fs.readdir(path.resolve(folder, series.name), function(error, files) {
        if (error) {
            return cb(null, -1);
        }
        var chapterNumbers = files
            .filter(function(item) {
                return item.indexOf(series.name) > -1;
            })
            .map(function(item) {
                return parseFloat(item.substring(series.name.length + 1));
            })
            .filter(function(item) {
                return !isNaN(item);
            });

        if (chapterNumbers.length === 0) {
            chapterNumbers = [-1];
        }
        return cb(null, Math.max.apply(null, chapterNumbers));
    });
};

updater.updateWithCurrentChapter = function(seriesList, folders, config, cb) {
    async.forEach(seriesList, function(series, cb) {
        async.map(folders, function(folder, cb) {
            updater.findLatestChapterInFolder(folder, series, cb);
        }, function(error, latestsInFolder) {
            if (error) {
                return cb(error);
            }
            if (config.cacheData[series.name]) {
                latestsInFolder.push(config.cacheData[series.name]);
            }
            series.currentChapter = Math.max.apply(null, latestsInFolder);
            return cb();
        });
    }, cb);
};

updater.update = function(selectedSeries, config, cb, progressCb) {
    var updateResults = [],
        seriesList = selectSeries(selectedSeries, config),
        foldersToLookInto = [config.outputDirectory].concat(config.readDirectories);

    updater.updateWithCurrentChapter(seriesList, foldersToLookInto, config, function(error) {
        if (error) {
            return cb(error);
        }

        // Remove chapter whose progress we don't know, unless forced.
        if (!config.force) {
            seriesList = seriesList.filter(function(s) {
                return s.currentChapter !== -1;
            });
        }

        var jobs = seriesList.map(function(s) {
            return crawler.createJob({
                series: s.name,
                currentChapter: s.currentChapter,
                url: s.url,
                untilLast: true
            });
        });

        async.eachSeries(jobs, function(job, cb) {
            crawler.runJob(config, job, function(error, results) {
                if (error) {
                    return cb(error);
                }
                updateResults = updateResults.concat(results);
                return cb();
            }, progressCb);
        }, function(error) {
            if (error) {
                return cb(error);
            }
            return cb(null, updateResults);
        });
    });
};

module.exports = updater;