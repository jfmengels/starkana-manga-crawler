var fs = require("fs");
var path = require("path");
var http = require("follow-redirects").http;
var async = require("async");
var jsdom = require("jsdom");
var mkdirp = require("mkdirp");
var AdmZip = require("adm-zip");

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
    var currentChapterSelector = $("#inner_page td:contains('chapter " + job.currentChapter + "')"),
        delimiter = 'chapter ';

    if (job.currentChapter < 1) {
        currentChapterSelector = $("#inner_page td:contains('chapter ')").last();
    }

    function chapterNumber(element) {
        var chapterText = element.text();
        return parseFloat(chapterText.slice(chapterText.indexOf(delimiter) + delimiter.length));
    }

    job.chapters = currentChapterSelector.closest('table').prevUntil('.c_h1').find('tr')
        .map(function() {
            return {
                chapter: chapterNumber($(this).find("td a.download-link")),
                url: $(this).find("td a.odi").attr("href")
            };
        })
        .get()
        .reverse();

    // Add first chapter if there are no chapters yet
    if (job.currentChapter < 1) {
        var firstChapterElement = currentChapterSelector.next().children("a"),
            chapterText = currentChapterSelector.text();

        chapterText = chapterText.slice(chapterText.indexOf(delimiter) + delimiter.length);

        job.chapters.unshift({
            chapter: chapterNumber(currentChapterSelector),
            url: firstChapterElement.attr("href")
        });
    }
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

function progress(message, type, cb) {
    message.type = type;
    return cb(message);
}





var crawler = {};

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

crawler.runJobs = function(fetchJobs, config, cb, progressCb) {
    if (!progressCb) {
        progressCb = function() {};
    }

    function launchDownloadJob(dlJob, cb) {
        var downloadProgress = {
            action: "download",
            target: "chapter",
            series: dlJob.series,
            chapter: dlJob.chapter,
        };

        progress(downloadProgress, "start", progressCb);
        crawler.downloadChapterAsZip(dlJob, function(error) {
            if (error) {
                return cb(error, dlJob);
            }
            progress(downloadProgress, "end", progressCb);
            if (config.outputFormat === "zip") {
                return cb(null, dlJob);
            }
            extractZip(dlJob.zipFile, dlJob.outputFile, function(error) {
                return cb(error, dlJob);
            });
        });
    }

    var hasFinishedFetching = false,
        results = [];

    var downloadQueue = async.queue(launchDownloadJob, 5);

    downloadQueue.drain = function() {
        if (hasFinishedFetching) {
            return cb(null, results);
        }
    };

    async.eachLimit(fetchJobs, 5, function(fetchJob, cb) {
        var checkProgress = {
            action: "check",
            target: "series",
            series: fetchJob.series
        };

        progress(checkProgress, "start", progressCb);
        crawler.findDownloadJobs(fetchJob, config, function(error, dlJobs) {
            if (error) {
                return cb(error);
            }
            progress(checkProgress, "end", progressCb);

            if (dlJobs.length === 0) {
                return cb();
            }
            progressCb({
                action: "queue",
                type: "add",
                series: fetchJob.series,
                newJobs: dlJobs.map(function(job) {
                    return job.chapter;
                })
            });
            downloadQueue.push(dlJobs, function(error, dlJob) {
                if (error) {
                    return cb(error);
                }
                results.push(dlJob);
            });
            return cb();
        });
    }, function(error) {
        if (error) {
            return cb(error);
        }
        // If queue is empty, return cb
        hasFinishedFetching = true;
        if (downloadQueue.idle()) {
            return cb(null, results);
        }
    });
};

crawler.findDownloadJobs = function(fetchJob, config, cb, progressCb) {
    if (!progressCb) {
        progressCb = function() {};
    }
    jsdom.env({
        url: crawler.getPageUrl(fetchJob),
        scripts: ["http://code.jquery.com/jquery.js"],
        done: function(errors, window) {
            if (errors) {
                return cb(errors.join("\n"));
            }
            if (fetchJob.untilLast) {
                addChaptersUntilLast(fetchJob, window.$);
            }

            var dlJobs = fetchJob.chapters
                .map(function(chapterItem) {
                    var series = fetchJob.series,
                        chapter = chapterItem.chapter,
                        outputFile = path.resolve(config.outputDirectory, series, series + " " + chapter),
                        link = findChapterLink(window.$, chapterItem);

                    if (link.isMissing || link.isRemoved) {
                        progressCb({
                            action: "download",
                            target: "chapter",
                            type: link.isMissing ? "missing" : "removed",
                            series: series,
                            chapter: chapter,
                        });
                        return null;
                    }

                    return {
                        series: series,
                        chapter: chapter,
                        outputFile: outputFile,
                        zipFile: outputFile + ".zip",
                        url: link.url
                    };
                })
                .filter(function(item) {
                    return item;
                });
            return cb(null, dlJobs);
        }
    });
};

crawler.downloadChapterAsZip = function(dlJob, cb) {
    mkdirp(path.dirname(dlJob.zipFile), function(error) {
        if (error) {
            return cb(error, dlJob);
        }
        http.get(dlJob.url, function(res) {
            var alreadyCalled = false;

            function callback(error) {
                if (!alreadyCalled) {
                    alreadyCalled = true;
                    return cb(error, dlJob);
                }
            }
            res.pipe(fs.createWriteStream(dlJob.zipFile))
                .on("error", callback)
                .on("finish", callback);
        });
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