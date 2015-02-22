# starkana-manga-crawler

Manga downloader module and cli tool based on starkana.com.

# install

Using [npm](http://npmjs.org):

```
npm install starkana-manga-crawler      # For the module
npm install starkana-manga-crawler -g   # For the cli
```

# module

The module has multiple parts, `crawler`, `updater`, `cleaner`, `renamer` and `subscriber`.

## crawler

This is the most useful sub-module when you only want to do simple operations like specific chapter downloads.

### crawler.runJobs(fetchJobs, config, cb, progressCb)

This method starts fetch jobs in parallel, which will create (if successful and needed) download jobs that it will put in an internal queue and downloaded in parallel of the fetching.

__Arguments__
* `fetchJobs`: Array of jobs to run, of the form
```js
// To download "One Piece" all chapters available on the website after chapter 750. It will not download chapter 750.
var jobs = [
    {
        series: "One Piece",
        currentChapter: 750,
        untilLast: true
    },
    // To download "The Breaker" chapters 750 to 755.
    {
        series: "The Breaker",
        chapters: [750, 751, 752, 753, 754, 755],
        url: "T/The_Breaker_(Manhwa)/"
    }
];
```

`url` is optional, and will help determining the url of the series page. Should not contain "http://starkana.com/manga/" as it will be prepended to the url. It won't be needed for series like "Naruto" or "One Piece" (leave it undefined), but might for some with odd characters or for manhwas (ex: The Breaker --> "T/The_Breaker_(Manhwa)/"). See crawler.getPageUrl() for more details.

Alternatively, you can create fetch jobs using crawler.createFetchJob() for more ease.

* `config`: Object containing all the configuration and options needed to run the jobs.
  - `outputDirectory`: Directory in which downloaded items items will go in. When downloading Naruto's first chapter, it will be go to "<outputDirectory>/Naruto/Naruto 1". Default outputDirectory is the current directory.
  - `outputFormat`: "folder" (default) or "zip". Determines whether the downloaded resource gets extracted or stays compressed.
* `cb`: cb(error) if an error occurs somewhere in the process, or with cb(null, results) after all fetch and download jobs have ended, where results is an array of items of the form
```js
[
  {
      series: "One Piece",
      chapter: 1,
      outputFile: "/some/output/directory/One Piece/One Piece 1", // Folder in which the files should appear
      zipFile: "/some/output/directory/One Piece/One Piece 1.zip", // Zip file in which the chapters are downloaded, potentially removed at the end of the operation
      url: "http://starkana.com/download/manga/XXXX" // url the chapter has been downloaded be from
  }, {
      series: "One Piece",
      chapter: 2,
      outputFile: "/some/output/directory/One Piece/One Piece 2",
      zipFile: "/some/output/directory/One Piece/One Piece 2.zip",
      url: "http://starkana.com/download/manga/YYYY"
  }, ...
]
```

Items can also have `isMissing` set to true if the chapter is not available, or `isRemoved` when the series is unavailable with this module (for a yet unknown reason).

* `progressCb`: optional. progressCb(progressData) will be called for a few different type of events. Take them into account ignore them as you see fit.
```js
[
    {
        action: "string" // "check" | "queue" | download",
        type: "string" // "start" | "end", only if action === "check" or "download"
        target: "string" // "series" | "chapter",
        series: "One Piece",
        chapter: 400, // only if action === "download" && target === "chapter"
        newJobs: [ 400, 401 ] // only if action === "queue"
    }
]
```

`action` values indicates what has just started/ended.
* "check": a fetch job has been started/ended for a series, collecting download jobs to be queued.
* "queue": A number of download jobs have just been queued.
* "download": A number of download jobs have just started/ended.
__Example__

```js
var crawler = require('starkana-manga-crawler').crawler;

var config = {
  outputDirectory: "/this/folder/here"
};

// Using jobs defined in one of the examples up above
crawler.runJobs(jobs, config, function(error, results) {
    if (error) {
        return console.error(error);
    }
    console.log(results);
}, console.log);
```

### crawler.createFetchJob(jobRequest)

Create a job that can be ran later using crawler.runJobs().

__jobRequest fields:__

* `series`: The name of the series to download (ex: "One Piece").
* `chapter`: First chapter to download (unless `untilLast` is true, then it will be the next one). If neither `untilLast` and `maxChapter` are defined, this will be the only chapter. If `untilLast` is true, all su
* `untilLast`: If set to true, the job will cover the download of the first chapter following `chapter` until the last available one.
* `maxChapter`: optional. If left undefined, only minChapter will be downloaded. Will be oerridden if untilLast is defined.

Arguments

arr - An array to iterate over.
iterator(item, callback) - A function to apply to each item in arr. The iterator is passed a callback(err) which must be called once it has completed. If no error has occurred, the callback should be run without arguments or with an explicit null argument.
callback(err) - A callback which is called when all iterator functions have finished, or an error occurs.

__Example__

```js
var crawler = require('starkana-manga-crawler').crawler;

var jobs = [
    crawler.createFetchJob({
        series: "The Breaker",
        minChapter: 10,
        maxChapter: 15,
        url: "T/The_Breaker_(Manhwa)/"
    }),
    crawler.createFetchJob({
        series: "Naruto",
        minChapter: 690,
        untilLast: true
    }),
];

// Then run those jobs using crawler.runJobs
```

### crawler.getPageUrl(job)

Returns the url for a series page.

__job fields:__

* `series`: The name of the series to download (ex: "One Piece").
* `url`: Optional. If defined, will use this sub-url instead of a guessed one.Should not contain "http://starkana.jp/manga/" as it will be prepended to the url.
It won't be needed for series like "Naruto" or "One Piece" (leave it undefined), but might for some with odd characters or for manhwas (ex: The Breaker --> "T/The_Breaker_(Manhwa)/").
Take a look at crawler.getPageUrl() for more details.

__Example__

```js
crawler.getPageUrl({
    series: "History's Strongest Disciple Kenichi"
});
// --> http://starkana.jp/manga/H/Historys_Strongest_Disciple_Kenichi

crawler.getPageUrl({
    series: "The Breaker",
    url: "T/The_Breaker_(Manhwa)"
});
// --> http://starkana.jp/manga/T/The_Breaker_(Manhwa)
```


## updater

Coming soon.

## cleaner

Coming soon.

## renamer

Coming soon.

## subscriber

Coming soon.

# CLI command

Coming soon.
