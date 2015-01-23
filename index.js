var fs 			= require("fs");
var http 		= require("follow-redirects").http;
var async 		= require("async");
var charm 		= require("charm")();
var mkdirp 		= require("mkdirp");
var cheerio 	= require("cheerio");

var configFile = "./config.json";
var program = require('commander');

program
  .version('0.0.1')
  .option('-s, --series [series]', 'Series')
  .option('-c, --chapter [chapter]', 'Chapter (or first chapter) to download', '1')
  .option('-C, --maxChapter [maxChapter]', 'Chapter up to which to download')
  .option('-O, --outputDirectory [directory]', 'Setting: Directory in which the files will be downloaded.')
  .option('-S, --save', 'Save settings so that they will automatically be reused on the next call.')
  .parse(process.argv);

function gracefulEnd(message) {
	console.log(message);
	process.exit(0);
}

if(!program.series) {
	gracefulEnd("Missing series argument.");
}
if(!program.chapter) {
	gracefulEnd("Missing chapter argument.");
}

var config = {},
	defaultConfig = {
		outputDirectory: "."
	};

try {
	var configData = fs.readFileSync(configFile);
	config = JSON.parse(configData);
}
catch(e) {}

if(program.outputDirectory) {
	config.outputDirectory = program.outputDirectory;
}

// Manually extending config
for(var i in defaultConfig) {
	config[i] = config[i] || defaultConfig[i];
}

// Save config to file
if(program.save) {
	fs.writeFileSync("./config.json", JSON.stringify(config, null, 4));
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

function createJob(series, chapter, maxChapter) {
	var self = this;
	self.series = series;
	self.chapter = chapter;
	self.maxChapter = maxChapter || chapter;
	self.directory = config.outputDirectory;
	self.outputFile = function() {
		return self.directory + "/" + self.series + "/" + self.series + " " + self.chapter + ".zip";
	};
	self.htmlFile = function() {
		var series = self.series.replace(/\s/g, "_")
								.replace(/\'/g, "");
		return "http://starkana.com/manga/" + self.series.substring(0, 1) + "/" + series + "/chapter/" + self.chapter;
	};
	return this;
}

function downloadChapter(job, cb) {
	if(!cb) {
		cb = function() {}
	}
	downloadHTML(job.htmlFile(), function(error, data) {
	    if (error) {
	    	return gracefulEnd(error);
	    }
	    var $ = cheerio.load(data);
	    if ($("body > center:nth-child(1) > h1").text().indexOf("404") > -1) {
	    	return gracefulEnd("Could not find " + job.series + " " + job.chapter);
	    }
	    if ($("#inner_page > div.ccoi > div:nth-child(1)").text().indexOf("isn't out yet") > -1) {
	    	return gracefulEnd("Chapter " + job.chapter + " of " + job.series + " isn't out yet.");
	    }
	    var downloadUrl = $("#freader-container a.odi").attr("href");
	    if(!downloadUrl) {
	    	return gracefulEnd("No downloadUrl: " + downloadUrl + "\n" + data);
	    }

	    var file = fs.createWriteStream(job.outputFile());
	    http.get(downloadUrl, function(res) {
	    	var timeout = null;
	    	var totalSize = parseInt(res.headers["content-length"], 10);
	    	var req = res.pipe(file);
	    	req.on("error", gracefulEnd);

	    	var size = 0;

	    	res.on("end", function() {
	    		write(job.chapter + ": " + totalSize + " / " + totalSize + " - 100%");
	    		clearTimeout(timeout);
	    		charm.down(1);
	    		charm.left(100);
	    		if (job.chapter < job.maxChapter) {
	    			job.chapter++;
	    			downloadChapter(job);
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
	    		write(job.chapter + ": " + size + " / " + totalSize + " - " + Math.floor(size/totalSize*100) + "%");
	    		timeout = setTimeout(updateProgress, 100);
	    	}
	    	updateProgress();
	    });
	});
}

charm.pipe(process.stdout);

var startJob = createJob(program.series, program.chapter, program.maxChapter);
mkdirp(startJob.directory + "/" + startJob.series, function (error) {
    if (error) {
    	return gracefulEnd(error);
	}
	downloadChapter(startJob);
});