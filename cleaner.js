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
            // Could not open file, ignore it.
            return cb(null, false);
        }
        return cb(null, cleaner.compute(data) === credits);
    });
};

cleaner.register = function(registeredFiles, duplicates, fileName, cb) {
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

cleaner.getDuplicateFiles = function(duplicates) {
    var dup = [];
    for (var key in duplicates) {
        if (duplicates[key].length > 1) {
            dup = dup.concat(duplicates[key]);
        }
    }
    return dup;
};

cleaner.findDuplicatesAndCredits = function(files, cb) {
    var registeredFiles = {},
        duplicates = {},
        credits = [];
    async.eachLimit(files, 50, function(file, cb) {
        cleaner.isCredits(file, function(error, isCredits) {
            if (error) {
                return cb(error);
            }
            if (isCredits) {
                credits.push(file);
                return cb();
            }
            cleaner.register(registeredFiles, duplicates, file, cb);
        });
    }, function(error) {
        if (error) {
            return cb(error);
        }
        return cb(null, credits.concat(cleaner.getDuplicateFiles(duplicates)));
    });
};

module.exports = cleaner;