var fs 			= require("fs");
var http 		= require("follow-redirects").http;
var charm 		= require("charm")();
var mkdirp 		= require("mkdirp");
var cheerio 	= require("cheerio");

var program = require('commander');
var line = 0;

program
  .version('0.0.1')
  .option('-s, --series [series]', 'Series')
  .option('-c, --chapter [chapter]', 'chapter')
  .option('-C, --maxChapter [maxChapter]', 'Chapter up to which to download')
  .parse(process.argv);

function gracefulExit(message) {
	console.log(message);
	process.exit(0);
}

if(!program.series) {
	gracefulExit("Missing series argument.");
}
if(!program.chapter) {
	gracefulExit("Missing chapter argument.");
}

// Utility function that downloads a URL and invokes
// cb with the data.
function downloadHTML(url, cb) {
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
}

function createOption(series, chapter, maxChapter) {
	var self = this;
	self.series = series;
	self.chapter = chapter;
	self.outputFile = function() {
		return self.series + "/" + self.series + " - " + self.chapter + ".zip";
	};
	self.htmlFile = function() {
		return "http://starkana.com/manga/" + self.series.substring(0, 1) + "/" + self.series.replace(" ", "_") + "/chapter/" + self.chapter;
	};
	self.maxChapter = maxChapter || chapter;
	return this;
}

function downloadChapter() {
	downloadHTML(options.htmlFile(), function(error, data) {
	    if (error) {
	    	return gracefulExit(error);
	    }
	    var $ = cheerio.load(data);
	    if ($("body > center:nth-child(1) > h1").text().indexOf("404") > -1) {
	    	return gracefulExit("Could not find " + options.series + " " + options.chapter);
	    }
	    var downloadUrl = $("#inner_page > div:nth-child(2) > a").attr("href");
	    if(!downloadUrl) {
	    	return gracefulExit("No downloadUrl: " + downloadUrl + "\n" + data);
	    }

	    var file = fs.createWriteStream(options.outputFile());
	    http.get(downloadUrl, function(res) {
	    	var timeout = null;
	    	var totalSize = parseInt(res.headers["content-length"], 10);
	    	var req = res.pipe(file);
	    	req.on("error", gracefulExit);

	    	var size = 0;

	    	res.on("end", function() {
	    		write(options.chapter + ": " + totalSize + " / " + totalSize + " - 100%");
	    		clearTimeout(timeout);
	    		charm.down(1);
	    		charm.left(100);
	    		if (options.chapter < options.maxChapter) {
	    			options.chapter++;
	    			downloadChapter();
	    		}
	    	});

	    	res.on("data", function(chunk) {
	    		size += chunk.length;
	    	});

	    	function write(message) {
	    		charm.left(100);
	    		charm.write(message);	    		
	    	}

	    	function updateProgress() {
	    		write(options.chapter + ": " + size + " / " + totalSize + " - " + Math.floor(size/totalSize*100) + "%");
	    		timeout = setTimeout(updateProgress, 100);
	    	}
	    	updateProgress();
	    });
	});
}

charm.pipe(process.stdout);

var options = createOption(program.series, program.chapter, program.maxChapter);
mkdirp(options.series, function (error) {
    if (error) {
    	return gracefulExit(error);
	}
	downloadChapter();
});