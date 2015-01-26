var http = require("follow-redirects").http;
var mkdirp = require("mkdirp");
var cheerio = require("cheerio");
var AdmZip = require("adm-zip");

var crawler = {};

crawler.downloadHTML = function(url, cb) {
    http.get(url, function(res) {
        var data = "";
        res.on("data", function(chunk) {
            data += chunk;
        });
        res.on("end", function() {
            return cb(null, data);
        });
    }).on("error", function(error) {
        return cb(error);
    });
};

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
    // TODO changer to correct selector
    return $("...").attr("href");
};

crawler.downloadChapter = function($, config, job, chapter, cb) {
    var url = crawler.findChapterLink($, chapter),
        outputFile = config.outputDirectory + "/" + job.series + "/" + job.series + " " + chapter + ".zip",
        file = fs.createWriteStream(outputFile);
    // TODO Don't write to file unless config.outputFormat is "zip"

    http.get(url, function(res) {
    	var alreadyCalled = false;
    	function callback(error) {
    		if (!alreadyCalled) {
    			alreadyCalled = true;
    			return cb(error, outputFile);
    		}
    	}
        res.pipe(file)
            .on("error", callback)
            .on("end", callback);
    });
}

crawler.runJob = function(config, job, cb) {
    mkdirp(config.outputDirectory + "/" + job.series, function(error) {
        if (error) {
            return cb(error);
        }
        // Url example: "http://starkana.com/manga/N/Naruto" for Naruto
        crawler.downloadHTML("http://starkana.com/manga/" + job.series.substring(0, 1) + "/" + job.series, function(error, data) {
            if (error) {
                return cb(error);
            }
            var $ = cheerio.load(data);
            async.eachLimit(jobs.chapters, 5, function(chapter, cb) {
                crawler.downloadChapter($, config, job, chapter, function(error, zipFile) {
                	if(error) {
                		return cb(error);
                	}
                	if (config.outputFormat === "zip") {
                		return cb(null, zipFile);
                	}

		            var outputFile = zipFile.replace(".zip", "");
		            var zip = new AdmZip(zipFile);
		            zip.extractAllTo(outputFile, true);
                	return cb(null, outputFile);
                });
            }, cb);
        });
    });
}

module.exports = crawler;