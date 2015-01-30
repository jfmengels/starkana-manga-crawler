var fs = require("fs");
var path = require("path");
var async = require("async");
var http = require("follow-redirects").http;
var mkdirp = require("mkdirp");
var jsdom = require("jsdom");
var AdmZip = require("adm-zip");

var crawler = {};

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

crawler.findChapterLink = function($, chapter) {
    var element = $("#inner_page td a.download-link[href$='/" + chapter + "']").closest('td').next().children("a");
    if (!element.length) {
        return null;
    }
    return element.attr("href");
};

crawler.downloadChapter = function($, config, job, chapter, cb) {
    var url = crawler.findChapterLink($, chapter),
        result = {
            series: job.series,
            chapter: job.chapter,
            zipFile: path.resolve(config.outputDirectory, job.series, job.series + " " + chapter + ".zip")
        };
    // TODO Don't write to file unless config.outputFormat is "zip"

    if (!url) {
        result.isMissing = true
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
        res.pipe(file);
        res.on("error", callback)
            .on("end", callback);
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
                // var $ = cheerio.load(data);
                var $ = window.$;
                async.eachLimit(job.chapters, 5, function(chapter, cb) {
                    crawler.downloadChapter($, config, job, chapter, function(error, result) {
                        if (error) {
                            return cb(error);
                        }
                        if (result.isMissing) {
                            return cb(null, result);
                        }
                        if (config.outputFormat === "zip") {
                            return cb(null, result.zipFile);
                        }

                        result.outputFile = result.zipFile.replace(".zip", "");
                        var zip = new AdmZip(result.zipFile);
                        zip.extractAllTo(result.outputFile, true);
                        fs.unlink(result.zipFile, function(error) {
                            if (error) {
                                return cb(error);
                            }
                            return cb(null, result);
                        })
                    });
                }, function(error, result) {
                    if (error) {
                        return cb(error);
                    }
                    return cb(null, result);
                });
            }
        });
    });
};

module.exports = crawler;