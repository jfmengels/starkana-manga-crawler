var should = require("should"),
    extend = require("extend"),
    crawler = require("../crawler.js");

describe("crawler", function() {


    describe("#createFetchJob()", function() {
        it("should create a job with a certain set of chapters", function() {
            var jobRequest = {
                series: "The Breaker",
                chapter: 10,
                maxChapter: 15,
                url: "T/The_Breaker_(Manhwa)"
            };

            var fetchJob = crawler.createFetchJob(jobRequest);
            fetchJob.should.have.property("series", "The Breaker");
            fetchJob.should.have.property("chapters").with.lengthOf(6);
            fetchJob.should.have.property("url", jobRequest.url);
            fetchJob.chapters.map(function(chapterJob) {
                return chapterJob.chapter;
            }).should.eql([10, 11, 12, 13, 14, 15]);
        });

        it("create a \"until last\" job", function() {
            var jobRequest = {
                series: "One Piece",
                chapter: 750,
                untilLast: true
            };

            var fetchJob = crawler.createFetchJob(jobRequest);
            fetchJob.should.have.property("series", "One Piece");
            fetchJob.should.have.property("currentChapter", 750);
            fetchJob.should.have.property("untilLast", true);
            should.not.exist(fetchJob.url);
        });
    });



    describe("#getPageUrl()", function() {
        var urlRegex = /^https?:\/\/starkana\.(\w+)\/manga\/([A-Z0-9]\/.*)$/;

        it("should convert simple series name", function() {
            var pageUrl = crawler.getPageUrl({
                series: "Naruto"
            });

            pageUrl.should.be.a.String.and.match(urlRegex);
            urlRegex.exec(pageUrl)[2].should.equal("N/Naruto");
        });

        it("should escape special characters", function() {
            var pageUrl = crawler.getPageUrl({
                series: "History's Strongest Disciple Kenichi"
            });

            pageUrl.should.be.a.String.and.match(urlRegex);
            urlRegex.exec(pageUrl)[2].should.equal("H/Historys_Strongest_Disciple_Kenichi");
        });

        it("should use url in job when present", function() {
            var pageUrl = crawler.getPageUrl({
                series: "The Breaker",
                url: "T/The_Breaker_(Manhwa)"
            });

            pageUrl.should.be.a.String.and.match(urlRegex);
            urlRegex.exec(pageUrl)[2].should.equal("T/The_Breaker_(Manhwa)");
        });
    });


    describe("private #progress()", function() {
        it("should send a message with a given type", function() {
            function callback(originalMessage, type) {
                return function(message) {
                    should.exist(message);
                    message.should.eql(extend({}, originalMessage, {
                        type: type
                    }));
                };
            }

            function launchTest(message, type) {
                var cb = callback(extend({}, message), type);
                crawler.private.progress(message, type, cb);
            }

            var message = {
                ok: true
            };
            launchTest(message, "start");
            message.should.have.property("type", "start");
            launchTest(message, "end");
            message.should.have.property("type", "end");
        });
    });
});