var subscriber = {};

subscriber.subscribe = function(series, config, url) {
    if (url && series.length > 1) {
        throw Error("Subscription: Can't guess for which series the url is for.");
    }
    var currentSubscriptions = config.subscriptions.map(function(s) {
        return s.name;
    });
    console.log(currentSubscriptions);

    var newSubscriptions = series
        .filter(function(s) {
            return currentSubscriptions.indexOf(s) === -1;
        })
        .map(function(s) {
            return {
                name: s,
                url: url
            };
        });
    config.subscriptions = config.subscriptions.concat(newSubscriptions);
};

subscriber.unsubscribe = function(series, config) {
    config.subscriptions = config.subscriptions.filter(function(sub) {
        return series.indexOf(sub.name) === -1;
    });
};

module.exports = subscriber;