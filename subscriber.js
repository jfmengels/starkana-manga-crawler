var subscriber = {};

subscriber.subscribe = function(series, config, url) {
    if (url && series.length > 1) {
        throw Error("Subscription: Can't guess for which series the url is for.");
    }

    var newSubscriptions = series.map(function(s) {
        return {
            name: s,
            url: url
        };
    });
    config.subscriptions = config.subscriptions.concat(newSubscriptions);
};

subscriber.unsubscribe = function(series, config) {
    config.subscriptions = config.subscriptions.filter(function(sub) {
        return series.indexOf(sub.name) > -1;
    });
};

module.exports = subscriber;