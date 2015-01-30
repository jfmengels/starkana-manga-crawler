var fs = require("fs");
var path = require("path");
var http = require("follow-redirects").http;
var async = require("async");
var jsdom = require("jsdom");
var mkdirp = require("mkdirp");
var AdmZip = require("adm-zip");
var fileLister = require("file-lister");

var cleaner = require("./cleaner");

var crawler = {};

function findChapterLink($, chapter) {
    var element = $("#inner_page td:contains('chapter " + chapter + "')").next().children("a");

    if (!element.length) {
        return null;
    }
    return element.attr("href");
}

function clean(results, cb) {
    var dirs = results.map(function(item) {
        return item.outputFile;
    });
    fileLister.listFiles(dirs, function(error, list) {
        if (error) {
            return cb(error);
        }
        cleaner.findDuplicatesAndCredits(list, function(error, filesToRemove) {
            async.each(filesToRemove, fs.unlink, cb);
        });
    });
}

crawler.createJob = function(series, minChapter, maxChapter) {
    var chapters = [];
    if (!maxChapter) {
        maxChapter = minChapter;
    }
    if (maxChapter < minChapter) {
        var tmp = minChapter;
        minChapter = maxChapter;
        maxChapter = tmp;
    }
    while (minChapter <= maxChapter) {
        chapters.push(minChapter++);
    }
    return {
        series: series,
        chapters: chapters
    };
};

crawler.downloadChapter = function($, config, job, chapter, cb) {
    var url = findChapterLink($, chapter),
        result = {
            series: job.series,
            chapter: job.chapter,
            zipFile: path.resolve(config.outputDirectory, job.series, job.series + " " + chapter + ".zip")
        };

    if (!url) {
        result.isMissing = true;
        return cb(null, result);
    }

    var file = fs.createWriteStream(result.zipFile);

    http.get(url, function(res) {
        var alreadyCalled = false;

        function callback(error) {
            if (!alreadyCalled) {
                alreadyCalled = true;
                return cb(error, result);
            }
        }
        res.pipe(file)
            .on("error", callback)
            .on("finish", callback);
    });
};

crawler.runJob = function(config, job, cb) {
    mkdirp(path.resolve(config.outputDirectory, job.series), function(error) {
        if (error) {
            return cb(error);
        }
        // Url example: "http://starkana.jp/manga/N/Naruto" for Naruto
        var seriesPageUrl = "http://starkana.jp/manga/" + job.series.substring(0, 1) + "/" + job.series;
        jsdom.env({
            url: seriesPageUrl,
            scripts: ["http://code.jquery.com/jquery.js"],
            done: function(errors, window) {
                if (errors) {
                    return cb(errors.join(""));
                }
                var $ = window.$;
                var results = [];
                async.eachLimit(job.chapters, 5, function(chapter, cb) {
                    function callback(error, result) {
                        if (error) {
                            return cb(error);
                        }
                        results.push(result);
                        return cb();
                    }
                    crawler.downloadChapter($, config, job, chapter, function(error, result) {
                        if (error) {
                            return callback(error);
                        }
                        if (result.isMissing) {
                            return callback(null, result);
                        }
                        if (config.outputFormat === "zip") {
                            return callback(null, result.zipFile);
                        }

                        result.outputFile = result.zipFile.replace(".zip", "");
                        var zip = new AdmZip(result.zipFile);
                        zip.extractAllTo(result.outputFile, true);
                        fs.unlink(result.zipFile, function(error) {
                            if (error) {
                                return callback(error);
                            }
                            return callback(null, result);
                        });
                    });
                }, function(error) {
                    if (error) {
                        return cb(error);
                    }
                    if (!config.clean) {
                        return cb(null, results);
                    }
                    return clean(results, function(error) {
                        return cb(error, results);
                    });
                });
            }
        });
    });
};

module.exports = crawler;