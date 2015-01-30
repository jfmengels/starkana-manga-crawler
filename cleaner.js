var fs = require("fs");
var crypto = require("crypto");
var async = require("async");

var cleaner = {};

var creditsSampleFileName = "resources/starkana-credits.jpg";

var creditsCheckSum;

function getCreditsChecksum() {
    if (creditsCheckSum) {
        return creditsCheckSum;
    }
    var data = fs.readFileSync(creditsSampleFileName);
    creditsCheckSum = cleaner.compute(data);
    return creditsCheckSum;
}

cleaner.compute = function(str) {
    return crypto
        .createHash("md5")
        .update(str, "utf8")
        .digest('hex');
};

cleaner.isCredits = function(fileName, cb) {
    var credits = getCreditsChecksum();
    fs.readFile(fileName, function(error, data) {
        if (error) {
            return cb(error);
        }
        return cb(null, cleaner.compute(data) === credits);
    });
};

var registeredFiles = {};
var duplicates = {};
cleaner.register = function(fileName, cb) {
    fs.readFile(fileName, function(error, sum) {
        if (error) {
            return cb(error);
        }
        registeredFiles[fileName] = sum;
        if (duplicates[sum]) {
            duplicates[sum].push(fileName);
        } else {
            duplicates[sum] = [fileName];
        }
        return cb();
    });
};

cleaner.getDuplicateFiles = function() {
    var dup = [];
    for (var key in duplicates) {
        if (duplicates[key].length > 1) {
            dup = dup.concat(duplicates[key]);
        }
    }
    return dup;
};

cleaner.findDuplicatesAndCredits = function(files, cb) {
    var results = [];
    async.each(files, function(file, cb) {
        cleaner.isCredits(file, function(error, isCredits) {
            if (error) {
                return cb(error);
            }
            if (isCredits) {
                results.push(file);
                return cb();
            }
            cleaner.register(file, cb);
        });
    }, function(error) {
        if (error) {
            return cb(error);
        }
        return cb(null, results.concat(cleaner.getDuplicateFiles()));
    });
};

module.exports = cleaner;