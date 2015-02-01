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
    var dirs = results
        .filter(function(item) {
            return !item.isMissing && item.outputFile;
        })
        .map(function(item) {
            return item.outputFile;
        });
    if (dirs.length === 0) {
        return cb();
    }
    fileLister.listFiles(dirs, function(error, list) {
        if (error) {
            return cb(error);
        }
        cleaner.findDuplicatesAndCredits(list, function(error, filesToRemove) {
            if (error) {
                return cb(error);
            }
            async.each(filesToRemove, fs.unlink, cb);
        });
    });
}

function listChapters(start, end) {
    var list = [],
        current = start;
    while (current <= end) {
        list[current - start] = current;
        current += 1;
    }
    return list;
}

function extractZip(zipFile, outputFile, cb) {
    var zip = new AdmZip(zipFile);
    zip.extractAllTo(outputFile, true);

    fs.unlink(zipFile, cb);
}

function findLatestChapterNumber($) {
    var element = $("#inner_page td:contains('chapter')").first(),
        delimiter = "chapter";

    if (!element.length) {
        return null;
    }
    var text = element.text().trim();
    text = text.substring(text.indexOf(delimiter) + delimiter.length + 1);
    return parseInt(text);
}





crawler.createJob = function(jobRequest) {
    var minChapter = jobRequest.chapter,
        maxChapter = jobRequest.maxChapter;

    if (jobRequest.untilLast) {
        return {
            series: jobRequest.series,
            chapters: [minChapter],
            untilLast: true,
            url: jobRequest.url
        };
    }

    if (!maxChapter) {
        maxChapter = minChapter;
    }
    if (maxChapter < minChapter) {
        var tmp = minChapter;
        minChapter = maxChapter;
        maxChapter = tmp;
    }
    return {
        series: jobRequest.series,
        chapters: listChapters(minChapter, maxChapter),
        url: jobRequest.url
    };
};

crawler.downloadChapter = function($, config, job, chapter, cb) {
    var url = findChapterLink($, chapter),
        result = {
            series: job.series,
            chapter: chapter,
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

crawler.getPageUrl = function(job) {
    var baseUrl = "http://starkana.jp/manga/";
    if (job.url) {
        return baseUrl + job.url;
    }

    // Starkana separates series based on the first character in their name.
    // On odd names (starting with number, dots, etc.), that category will be "0".
    var series = job.series,
        firstChar = series.charAt(0);
    if (!firstChar.match(/[a-z]/i)) {
        firstChar = "0";
    }
    // Url example: "http://starkana.jp/manga/O/One_Piece" for One Piece
    return baseUrl + firstChar + "/" + series.replace(/\s/g, "_");
};

crawler.runJob = function(config, job, cb, progressCb) {
    if (!progressCb) {
        progressCb = function() {};
    }
    progressCb({
        action: "check",
        target: "series",
        type: "start",
        series: job.series
    });
    mkdirp(path.resolve(config.outputDirectory, job.series), function(error) {
        if (error) {
            return cb(error);
        }
        jsdom.env({
            url: crawler.getPageUrl(job),
            scripts: ["http://code.jquery.com/jquery.js"],
            done: function(errors, window) {
                if (errors) {
                    return cb(errors.join("\n"));
                }
                var $ = window.$,
                    results = [];

                if (job.untilLast) {
                    job.chapters = listChapters(job.chapters[0], findLatestChapterNumber($));
                }

                if (job.chapters.length === 0) {
                    return cb(null, []);
                }

                progressCb({
                    action: "download",
                    target: "series",
                    type: "start",
                    series: job.series
                });
                async.eachLimit(job.chapters, 5, function(chapter, cb) {
                    function callback(error, result) {
                        if (error) {
                            return cb(error);
                        }
                        results.push(result);
                        return cb();
                    }

                    progressCb({
                        action: "download",
                        target: "chapter",
                        type: "start",
                        series: job.series,
                        chapter: chapter,
                    });
                    crawler.downloadChapter($, config, job, chapter, function(error, result) {
                        function endProgress() {
                            progressCb({
                                action: "download",
                                target: "chapter",
                                type: "end",
                                series: job.series,
                                chapter: chapter,
                            });
                        }
                        if (error) {
                            return callback(error);
                        }
                        if (result.isMissing || config.outputFormat === "zip") {
                            endProgress();
                            return callback(null, result);
                        }

                        result.outputFile = result.zipFile.replace(".zip", "");
                        extractZip(result.zipFile, result.outputFile, function(error) {
                            endProgress();
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
                    progressCb({
                        action: "download",
                        target: "series",
                        type: "end",
                        series: job.series
                    });
                    if (!config.clean) {
                        return cb(null, results);
                    }
                    progressCb({
                        action: "cleanup",
                        target: "series",
                        type: "start",
                        series: job.series
                    });
                    return clean(results, function(error) {
                        progressCb({
                            action: "cleanup",
                            target: "series",
                            type: "end",
                            series: job.series
                        });
                        return cb(error, results);
                    });
                });
            }
        });
    });
};

crawler.findLatestChapterNumber = function(series, cb) {
    jsdom.env({
        url: crawler.getPageUrl(series),
        scripts: ["http://code.jquery.com/jquery.js"],
        done: function(errors, window) {
            if (errors) {
                return cb(errors.join(""));
            }
            return cb(null, findLatestChapterNumber(window.$));
        }
    });
};

module.exports = crawler;