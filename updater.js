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

updater.findLatestChapterInFolder = function(seriesName, folder, cb) {
    fs.readdir(path.resolve(folder, seriesName), function(error, files) {
        if (error) {
            return cb(null, -1);
        }
        var chapterNumbers = files
            .filter(function(item) {
                return item.indexOf(seriesName) > -1;
            })
            .map(function(item) {
                return parseFloat(item.substring(seriesName.length + 1));
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

updater.getCurrentChapterInFolders = function(seriesName, folders, cb) {
    async.map(folders, function(folder, cb) {
        updater.findLatestChapterInFolder(seriesName, folder, cb);
    }, function(error, latestsInFolder) {
        if (error) {
            return cb(error);
        }
        return cb(null, Math.max.apply(null, latestsInFolder));
    });
};

updater.updateWithCurrentChapter = function(seriesList, folders, config, cb) {
    async.forEach(seriesList, function(series, cb) {
        updater.getCurrentChapterInFolders(series.name, folders, function(error, latest) {
            if (error) {
                return cb(error);
            }
            series.currentChapter = Math.max(latest, config.cacheData[series.name] || -1);
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

        crawler.runJobs(jobs, config, cb, progressCb);
    });
};


// Cache operations
updater.updateCache = function(config, series, cb) {
    if (config.zero && series.length === 0) {
        config.cacheData = {};
    }
    var folders = [config.outputDirectory].concat(config.readDirectories),
        subscriptions = config.subscriptions;

    if (series.length !== 0) {
        subscriptions = subscriptions.filter(function(s) {
            return series.indexOf(s.name) !== -1;
        });
    }
    async.forEach(subscriptions, function(series, cb) {
        // For each series, find out the progress in the folders we are looking at
        updater.getCurrentChapterInFolders(series.name, folders, function(error, latest) {
            if (error) {
                return cb(error);
            }

            if (!config.zero) { // If using cache, see if the cache's value is higher
                latest = Math.max(latest, config.cacheData[series.name] || -1);
            }
            if (latest !== -1) {
                config.cacheData[series.name] = latest;
            }
            return cb();
        });
    }, cb);
};


module.exports = updater;