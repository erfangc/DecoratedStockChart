angular.module('Example', ['decorated-stock-chart']).controller("MainCtrl", function ($scope, $q, $timeout) {

    /**
     * security related behavior
     */
    $scope.securities = [
        {id: 1, label: "T", mean: 0.08, stddev: 0.17, initPrice: 32},
        {id: 2, label: "VZ", mean: 0.05, stddev: 0.15, initPrice: 45},
        {id: 3, label: "GS", mean: 0.03, stddev: 0.23, initPrice: 184}];
    $scope.addSecurity = function (security) {
        $scope.apiHandle.api.addSecurity(security);
    };
    $scope.defaultSecurityAttribute = {tag: "price", label: "Price"};
    $scope.onSecurityRemove = function (id) {
        $scope.message = "Callback Fired: Security with ID = " + id + " was Removed!";
        $("#alert").slideDown(500);
    };
    $scope.availableSecurityAttributes = [{tag: "return", label: "Return"}, {
        tag: "price",
        label: "Price"
    }, {tag: "volume", label: "Volume"}];
    $scope.onAttributeSelect = function (attr, security, options) {
        return {
            name: security.label + " " + attr.label,
            data: simulate(domain(options), attr, security)
        };
    };

    /**
     * market index simulated behavior
     */
    $scope.marketIndexTypeahead = function (userInput) {
        const d = $q.defer();
        $timeout(function () {
            d.resolve([{tag: "snp_500", label: "S&P 500"}, {tag: "fin_cds", label: "Financial CDS"}]);
        }, 100);
        return d.promise;
    };
    $scope.onMarketIndexSelect = function (attr, options) {
        return {
            name: attr.label,
            data: simulate(domain(options), attr, {mean: 0.07, stddev: 0.13, initPrice: 100}, true)
        };
    };

    /**
     * custom benchmark simulated behavior
     */
    $scope.customBenchmarkOptions = {
        sectors: ['Sector A', 'Sector B'],
        wal: [1,3,5,7,10,30],
        ratings:['A','AA','B','C'],
        analytics: [{tag: "price", label: "Price"}, {tag: "volume", label: "Volume"}, {tag: "return", label: "Return"}]
    };
    $scope.onCustomBenchmarkSelect = function (customBenchmark, options) {
        return {
            name: [customBenchmark.sector, customBenchmark.wal, customBenchmark.rating, customBenchmark.analytic.tag].join(" "),
            data: simulate(domain(options), customBenchmark.analytic, {mean: 0.07, stddev: 0.13, initPrice: 100}, true)
        };
    };

    $scope.apiHandle = {};

    $scope.closeAlert = function () {
        $("#alert").slideUp(500);
    };

});

// small fix for when cue tip would popup with the title of the chart for no reason ... really distracting
$(document).ready(function () {
    $('[title]').mouseover(function () {
        $this = $(this);
        $this.data('title', $this.attr('title'));
        // Using null here wouldn't work in IE, but empty string will work just fine.
        $this.attr('title', '');
    }).mouseout(function () {
        $this = $(this);
        $this.attr('title', $this.data('title'));
    });
});

/**
 * this returns the last 1 business year in Unix epoch
 * @returns {Array}
 */
const domain = function (options) {
    const x = [];
    const now = options ? moment(options.dateRange.end) : moment();
    const numDays = options ? now.diff(moment(options.dateRange.start), 'days') + 1 : 255;
    for (var i = 0; i < numDays; i++)
        x.push(now.clone().subtract(i, 'd').valueOf());
    x.reverse();
    return x;
};

const yearFrac = 1 / Math.sqrt(255);

/**
 * simulate a normal dist by summing i.i.d
 * @return {number}
 */
function nextGaussian() {
    return ((Math.random() + Math.random() + Math.random() + Math.random() + Math.random() + Math.random()) - 3) / 3;
}

/**
 * return a increment of an naive Brownian motion
 * @param drift
 * @param vol
 * @return {number}
 */
function nextRandomWalk(drift, vol) {
    return nextGaussian() * vol + drift * yearFrac;
}

/**
 * generates the range for a time-series
 * @param domain
 * @param attr
 * @param security
 * @param isMktIdx
 */
function simulate(domain, attr, security, isMktIdx) {

    /**
     * if the requested attribute is Volume, then return really large numbers
     */
    if (attr.tag === 'volume')
        return _.map(domain, function (x) {
            return [x, nextGaussian() * 1e9];
        });

    function genReturnLikeSeries(isReturn) {
        const range = [];
        for (var i = 0; i < domain.length; i++) {
            if (i >= 1)
                range[i] = range[i - 1] * (1 + nextRandomWalk(security.mean, security.stddev));
            else
                range[i] = isReturn ? 1 : security.initPrice;
        }
        return range;
    }

    return _.zip(domain, attr.tag === 'price' || isMktIdx ? genReturnLikeSeries(false) : genReturnLikeSeries(true));
}

