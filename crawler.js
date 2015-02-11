var fs = require("fs");
var path = require("path");
var http = require("follow-redirects").http;
var async = require("async");
var jsdom = require("jsdom");
var mkdirp = require("mkdirp");
var AdmZip = require("adm-zip");
var extend = require("extend");
var fileLister = require("file-lister");

var cleaner = require("./cleaner");
var renamer = require("./renamer");

var crawler = {};

function findChapterLink($, chapterItem) {
    var result = {};
    if (chapterItem.url) {
        result.url = chapterItem.url;
        return result;
    }
    var element = $("#inner_page td:contains('chapter " + chapterItem.chapter + "')").next().children("a");

    if (!element.length) {
        result.isMissing = true;
        if ($("#inner_page span").first().text() === "Removed") {
            result.isRemoved = true;
        }
        return result;
    }
    result.url = element.attr("href");
    return result;
}

function clean(results, config, cb) {
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
            async.each(filesToRemove, fs.unlink, function(error) {
                if (error) {
                    return cb(error);
                }
                if (config.rename && config.outputFormat === "folder") {
                    return renamer.renameFolders(dirs, {
                        onlyNodedirs: true
                    }, cb);
                }
                return cb();
            });
        });
    });
}

function listChapters(start, end) {
    var list = [],
        current = start;
    while (current <= end) {
        list[current - start] = {
            chapter: current
        };
        current += 1;
    }
    return list;
}

function addChaptersUntilLast(job, $) {
    console.log($("#inner_page td:contains('chapter " + job.currentChapter + "')").closest('table').prevUntil('.c_h1').find('tr'))
    job.chapters = $("#inner_page td:contains('chapter " + job.currentChapter + "')").closest('table').prevUntil('.c_h1').find('tr')
        .map(function() {
            var delimiter = 'chapter ',
                chapterText = $(this).find("td a.download-link").text();

            chapterText = chapterText.slice(chapterText.indexOf(delimiter) + delimiter.length);
            return {
                chapter: parseFloat(chapterText),
                url: $(this).find("td a.odi").attr("href")
            };
        })
        .get()
        .reverse();
}

function extractZip(zipFile, outputFile, cb) {
    var zip = new AdmZip(zipFile);
    zip.extractAllTo(outputFile, true);

    fs.unlink(zipFile, cb);
}

function findLatestChapterNumber($) {
    var element = $("#inner_page td:contains('chapter')").first(),
        delimiter = "chapter ";

    if (!element.length) {
        return null;
    }
    var text = element.text().trim();
    text = text.substring(text.indexOf(delimiter) + delimiter.length);
    return parseInt(text);
}





crawler.createJob = function(jobRequest) {
    var minChapter = jobRequest.chapter,
        maxChapter = jobRequest.maxChapter;

    if (jobRequest.untilLast) {
        return {
            series: jobRequest.series,
            currentChapter: jobRequest.currentChapter,
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

crawler.downloadChapter = function($, config, job, chapterItem, cb) {
    var link = findChapterLink($, chapterItem),
        result = {
            series: job.series,
            chapter: chapterItem.chapter,
            zipFile: path.resolve(config.outputDirectory, job.series, job.series + " " + chapterItem.chapter + ".zip")
        };

    if (!link.url) {
        extend(result, link);
        return cb(null, result);
    }

    var file = fs.createWriteStream(result.zipFile);

    http.get(link.url, function(res) {
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
    var seriesName = series
        .replace(/\s/g, "_")
        .replace(/'/g, "");
    return baseUrl + firstChar + "/" + seriesName;
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
                addChaptersUntilLast(job, $);
            }
            console.log(job.chapters)

            if (job.chapters.length === 0) {
                return cb(null, []);
            }

            progressCb({
                action: "download",
                target: "series",
                type: "start",
                series: job.series
            });
            mkdirp(path.resolve(config.outputDirectory, job.series), function(error) {
                if (error) {
                    return cb(error);
                }
                async.eachLimit(job.chapters, 5, function(chapterItem, cb) {
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
                        chapter: chapterItem.chapter,
                    });
                    crawler.downloadChapter($, config, job, chapterItem, function(error, result) {
                        function endProgress() {
                            progressCb({
                                action: "download",
                                target: "chapter",
                                type: "end",
                                series: job.series,
                                chapter: chapterItem.chapter,
                            });
                        }
                        if (error) {
                            return callback(error);
                        }
                        if (result.isRemoved) {
                            progressCb({
                                action: "download",
                                target: "chapter",
                                type: "removed",
                                series: job.series,
                                chapter: chapterItem.chapter,
                            });
                        } else if (result.isMissing) {
                            progressCb({
                                action: "download",
                                target: "chapter",
                                type: "missing",
                                series: job.series,
                                chapter: chapterItem.chapter,
                            });
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
                    return clean(results, config, function(error) {
                        progressCb({
                            action: "cleanup",
                            target: "series",
                            type: "end",
                            series: job.series
                        });
                        return cb(error, results);
                    });
                });
            });
        }
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