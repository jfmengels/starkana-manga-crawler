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
            return !item.isMissing;
        })
        .map(function(item) {
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
            untilLast: true
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
        chapters: listChapters(minChapter, maxChapter)
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

crawler.getPageUrl = function(series) {
    // Starkana separates series based on the first character in their name.
    // On odd names (starting with number, dots, etc.), that category will be "0".
    var firstChar = series.charAt(0);
    if (!firstChar.match(/[a-z]/i)) {
        firstChar = "0";
    }
    // Url example: "http://starkana.jp/manga/O/One_Piece" for One Piece
    return "http://starkana.jp/manga/" + firstChar + "/" + series.replace(/\s/g, "_");
};

crawler.runJob = function(config, job, cb) {
    mkdirp(path.resolve(config.outputDirectory, job.series), function(error) {
        if (error) {
            return cb(error);
        }
        jsdom.env({
            url: crawler.getPageUrl(job.series),
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
                        if (result.isMissing || config.outputFormat === "zip") {
                            return callback(null, result);
                        }

                        result.outputFile = result.zipFile.replace(".zip", "");
                        extractZip(result.zipFile, result.outputFile, function(error) {
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