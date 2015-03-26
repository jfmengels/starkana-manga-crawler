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


    describe("private functions", function() {
        describe("#progress()", function() {
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
});