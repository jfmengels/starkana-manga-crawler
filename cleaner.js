var fs = require("fs");
var crypto = require("crypto");
var async = require("async");

var cleaner = {};

var creditsSampleFileName = "resources/starkana-credits.jpg";

var _creditsCheckSum;

function getCreditsChecksum() {
    if (_creditsCheckSum) {
        return _creditsCheckSum;
    }
    var data = fs.readFileSync(creditsSampleFileName);
    _creditsCheckSum = cleaner.compute(data);
    return _creditsCheckSum;
}

cleaner.compute = function(str) {
    return crypto
        .createHash("md5")
        .update(str, "utf8")
        .digest('hex');
};

cleaner.computeFile = function(file, cb) {
    fs.readFile(file, function(error, data) {
        if (error) {
            return cb(error);
        }
        return cb(null, cleaner.compute(data));
    });
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

cleaner.register = function(registeredFiles, duplicates, fileName, sum) {
    registeredFiles[fileName] = sum;
    if (duplicates[sum]) {
        duplicates[sum].push(fileName);
    } else {
        duplicates[sum] = [fileName];
    }
};

cleaner.getDuplicateFiles = function(duplicates) {
    return Object.keys(duplicates).map(function(key) {
        return duplicates[key];
    }).filter(function(item) {
        return item.length > 1;
    }).reduce(function(a, b) {
        return a.concat(b);
    }, []);
};

cleaner.findDuplicatesAndCredits = function(files, cb) {
    var registeredFiles = {},
        duplicates = {},
        credits = [];
    var creditsChecksum = getCreditsChecksum();
    async.eachLimit(files, 50, function(file, cb) {
        cleaner.computeFile(file, function(error, fileChecksum) {
            if (error) {
                return cb(error);
            }
            if (fileChecksum === creditsChecksum) {
                credits.push(file);
                return cb();
            }
            cleaner.register(registeredFiles, duplicates, file, fileChecksum);
            return cb();
        });
    }, function(error) {
        if (error) {
            return cb(error);
        }
        return cb(null, credits.concat(cleaner.getDuplicateFiles(duplicates)));
    });
};

module.exports = cleaner;