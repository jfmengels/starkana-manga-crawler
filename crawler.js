var fs = require("fs");
var AdmZip = require("adm-zip");
var path = require("path");
var http = require("follow-redirects").http;
var async = require("async");
var jsdom = require("jsdom");
var rimraf = require("rimraf");
var mkdirp = require("mkdirp");
var request = require("request");
var archiver = require("archiver");

jsdom.defaultDocumentFeatures = {
    FetchExternalResources: [],
    MutationEvents: '2.0',
    ProcessExternalResources: [],
    SkipExternalResources: false
};

function findChapterLink($, chapterItem) {
    var result = {};
    if (chapterItem.url) {
        result.url = chapterItem.url;
        return result;
    }

    var chapterRegex = new RegExp("chapter " + chapterItem.chapter + "$");
    var element = $("#inner_page td")
        .filter(function() {
            var text = $(this).text().trim();
            return chapterRegex.test(text);
        })
        .next()
        .children("a");

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
    try {
        var zip = new AdmZip(zipFile);
        zip.extractAllTo(outputFile, true);
    } catch (error) {
        return cb(error);
    }
    fs.unlink(zipFile, cb);
}

function compressZip(folder, zipFile, cb) {
    // Using archiver for compressing, as using adm-zip is not working
    // (getting archive with empty folders named after each file in the original folder)
    var file = fs.createWriteStream(zipFile),
        archive = archiver("zip");

    archive.on('error', cb);
    file.on("close", function() {
        // Once the archive is created, remove the folder
        rimraf(folder, cb);
    });

    archive.pipe(file);
    archive.directory(folder, false);
    archive.finalize();
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

function findPageImageSrc(pageCrawlJob, cb) {
    jsdom.env({
        url: pageCrawlJob.pageUrl,
        done: function(errors, window) {
            if (errors) {
                return cb(errors);
            }
            var src = window.document.querySelector("#pic img").getAttribute("src");
            return cb(null, src);
        }
    });
}

function downloadPage(pageDownloadJob, cb) {
    http.get(pageDownloadJob.url, function(res) {
        res.pipe(fs.createWriteStream(pageDownloadJob.outputFile))
            .on("error", cb)
            .on("finish", cb);
    });
}

function downloadChapterPerPage(dlJob, config, cb) {
    mkdirp(dlJob.outputFile, function(error) {
        if (error) {
            return cb(error);
        }
        dlJob.chapterUrl = dlJob.pageUrl + "/chapter/" + dlJob.chapter;
        jsdom.env({
            url: dlJob.chapterUrl,
            done: function(errors, window) {
                if (errors) {
                    return cb(errors);
                }

                var numberOfPages = parseInt(window.document.querySelector("#bc2 > strong").textContent),
                    // Creating a job for each page
                    pageCrawlJobs = Array.apply(1, new Array(numberOfPages)).map(function(elt, index) {
                        var page = index + 1;
                        return {
                            page: page,
                            pageUrl: dlJob.chapterUrl + "/" + page
                        };
                    });

                async.eachLimit(pageCrawlJobs, 5, function(pageCrawlJob, cb) {
                    // Getting the source of the image to download
                    findPageImageSrc(pageCrawlJob, function(error, src) {
                        if (error) {
                            return cb(error);
                        }

                        // Once we have the source, download it
                        var splitSrc = src.split("/");
                        downloadPage({
                            page: pageCrawlJob.page,
                            url: src,
                            outputFile: path.resolve(dlJob.outputFile, splitSrc[splitSrc.length - 1])
                        }, cb);
                    });
                }, cb);
            }
        });
    });
}

function downloadChapterAsZip(dlJob, config, cb) {
    mkdirp(path.dirname(dlJob.zipFile), function(error) {
        if (error) {
            return cb(error, dlJob);
        }
        var alreadyCalled = false;

        function callback(error) {
            if (!alreadyCalled) {
                alreadyCalled = true;
                return cb(error, dlJob);
            }
        }

        request
            .get({
                url: dlJob.url,
                timeout: config.starkana.timeoutMs
            })
            .on("error", callback)
            .on("response", function(res) {
                if (res.statusCode !== 200) {
                    return callback(new Error("Unexpected response status code " + res.statusCode));
                }
                res.pipe(fs.createWriteStream(dlJob.zipFile))
                    .on("error", callback)
                    .on("finish", callback);
            });
    });
}



var crawler = {};

if (process.env.NODE_ENV === "test") {
    crawler.private = {
        findChapterLink: findChapterLink,
        listChapters: listChapters,
        addChaptersUntilLast: addChaptersUntilLast,
        extractZip: extractZip,
        findLatestChapterNumber: findLatestChapterNumber,
        progress: progress
    };
}

crawler.createFetchJob = function(jobRequest) {
    var minChapter = jobRequest.chapter,
        maxChapter = jobRequest.maxChapter,
        fetchJob = {
            series: jobRequest.series,
            url: jobRequest.url,
            pageUrl: crawler.getPageUrl(jobRequest)
        };

    if (jobRequest.untilLast) {
        fetchJob.currentChapter = minChapter;
        fetchJob.untilLast = true;
    } else {
        if (!maxChapter) {
            maxChapter = minChapter;
        }
        if (maxChapter < minChapter) {
            var tmp = minChapter;
            minChapter = maxChapter;
            maxChapter = tmp;
        }
        fetchJob.chapters = listChapters(minChapter, maxChapter);
    }
    return fetchJob;
};

crawler.downloadChapter = function(dlJob, config, cb, progressCb) {
    progressCb = progressCb || function() {};

    var downloadProgress = {
        action: "download",
        target: "chapter",
        series: dlJob.series,
        chapter: dlJob.chapter,
    };

    progress(downloadProgress, "start", progressCb);


    function downloadPerPage() {
        downloadChapterPerPage(dlJob, config, function(error) {
            if (error) {
                return cb(error);
            }
            progress(downloadProgress, "end", progressCb);
            if (config.outputFormat === "zip") {
                return compressZip(dlJob.outputFile, dlJob.zipFile, function(error) {
                    if (error) {
                        return cb(error, dlJob);
                    }
                    return cb(null, dlJob);
                });
            }
            return cb(null, dlJob);
        });
    }

    if (config.starkana.shouldUseFallback) {
        return downloadPerPage();
    } else {
        downloadChapterAsZip(dlJob, config, function(error) {
            if (error) {
                if ((error === "timeout" || /Unexpected response status code 5/.test(error.message)) && config.starkana.fallbackToIndividualPagesOnTimeout) {
                    config.starkana.shouldUseFallback = true;
                    progress(downloadProgress, "fallback", progressCb);
                    return downloadPerPage();
                }
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
};

crawler.runJobs = function(fetchJobs, config, cb, progressCb) {
    progressCb = progressCb || function() {};

    function launchDownloadJob(dlJob, cb) {
        return crawler.downloadChapter(dlJob, config, cb, progressCb);
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
                return cb(errors);
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
                        url: link.url,
                        pageUrl: fetchJob.pageUrl
                    };
                })
                .filter(function(item) {
                    return item;
                });
            return cb(null, dlJobs);
        }
    });
};

crawler.getPageUrl = function(job) {
    if (job.pageUrl) {
        return job.pageUrl;
    }
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



crawler.getChapterPageUrl = function(job) {
    var baseUrl = "http://starkana.jp/manga/";
    if (job.pageUrl) {
        return job.pageUrl;
    }
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