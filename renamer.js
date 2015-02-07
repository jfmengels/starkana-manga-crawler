var fs = require("fs");
var path = require("path");
var async = require("async");
var naturalSort = require("javascript-natural-sort");

function computeRenameOrder(unprogrammed) {
    var programmed = [],
        unprogrammedOldNames = unprogrammed.map(function(file) {
            return file.oldName;
        });

    while (unprogrammed.length > 0) {
        for (var index in unprogrammed) {
            var file = unprogrammed[index];
            if (unprogrammedOldNames.indexOf(file.newName) === -1) {
                programmed.push(file);

                var unprogrammedIndex = unprogrammedOldNames.indexOf(file.oldName);
                unprogrammed.splice(unprogrammedIndex, 1);
                unprogrammedOldNames.splice(unprogrammedIndex, 1);
            }
        }
    }
    return programmed;
}

function filterFilesAndDirs(items, cb) {
    var calledError = false;
    async.filter(items, function(item, innerCb) {
        fs.stat(item, function(error, stat) {
            if (error) {
                calledError = true;
                // Call outer callback directly
                return cb(error);
            }
            return innerCb(stat.isDirectory());
        });
    }, function(dirs) {
        if (!calledError) {
            var files = items.filter(function(item) {
                return dirs.indexOf(item) === -1;
            });
            return cb(null, dirs, files);
        }
    });
}

var renamer = {};

renamer.renameFiles = function(job, cb) {
    var padding = new Array(3).join('0');
    var files = job.files;
    files.sort(naturalSort);

    var queue = files.map(function(file) {
        var index = padding + (files.indexOf(file) + 1),
            newName = job.folder + "/" + path.basename(job.folder) + ' - ' + index.substring(index.length - 3) + path.extname(file);

        return {
            oldName: file,
            newName: newName
        };
    }).filter(function(queueItem) {
        return queueItem.oldName !== queueItem.newName;
    });

    var filesInOrder = computeRenameOrder(queue);

    async.eachSeries(filesInOrder, function(file, cb) {
        fs.rename(file.oldName, file.newName, cb);
    }, cb);
};

renamer.renameFolder = function(folder, config, cb) {
    fs.readdir(folder, function(error, items) {
        if (error) {
            return cb(error);
        }

        items = items.map(function(item) {
            return folder + "/" + item;
        });

        filterFilesAndDirs(items, function(error, dirs, files) {
            if (error) {
                return cb(error);
            }
            async.parallel([
                function doFiles(cb) {
                    if (!config.onlyNodeDirs || dirs.length === 0) {
                        renamer.renameFiles({
                            files: files,
                            folder: folder
                        }, cb);
                    }
                },
                function doDirs(cb) {
                    renamer.renameFolders(dirs, config, cb);
                }
            ], cb);
        });
    });
};

renamer.renameFolders = function(folders, config, cb) {
    if (!folders || !folders.length) {
        return cb();
    }
    async.eachLimit(folders, 5, function(folder, cb) {
        renamer.renameFolder(folder, config, cb);
    }, cb);
};

module.exports = renamer;