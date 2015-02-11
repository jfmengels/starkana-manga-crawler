var fs = require("fs");
var path = require("path");
var async = require("async");

var utils = require("./utils");
var crawler = require("./crawler");

var updater = {};

updater.getCurrentMaxChapter = function(folder, series, cb) {
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

updater.update = function(filter, config, cb, progressCb) {
    var series = config.subscriptions;

    // Filtering + adding series
    if (filter.length > 0) {
        var seriesObject = utils.convertSeriesToObject(series);

        // Filtering out series in the subscriptions
        var subscriptions = series.filter(function(s) {
            return filter.indexOf(s.name) > -1;
        });

        // Adding those in the filter that are not in the subscriptions
        series = subscriptions.concat(filter
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

    var foldersToLookInto = [config.outputDirectory].concat(config.readDirectories);

    async.map(series, function(series, cb) {
        async.map(foldersToLookInto, function(folder, cb) {
            updater.getCurrentMaxChapter(folder, series, cb);
        }, function(error, maxChapterNumbers) {
            if (error) {
                return cb(error);
            }
            var maxChapter = Math.max.apply(null, maxChapterNumbers);
            if (maxChapter === -1 && !config.force) {
                return cb();
            }
            return cb(null, crawler.createJob({
                series: series.name,
                currentChapter: maxChapter,
                untilLast: true,
                url: series.url
            }));
        });
    }, function(error, jobs) {
        if (error) {
            return cb(error);
        }

        // Filter 'undefined' jobs
        jobs = jobs.filter(function(item) {
            return item;
        });
        async.eachSeries(jobs, function(job, cb) {
            crawler.runJob(config, job, cb, progressCb);
        }, cb);
    });
};

module.exports = updater;