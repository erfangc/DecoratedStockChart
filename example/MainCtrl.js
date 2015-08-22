angular.module('Example', ['DecoratedStockChart']).controller("MainCtrl", function ($scope) {

    $scope.securities = [{id: 1, label:"T"}, {id: 2, label:"VZ"}, {id: 3, label:"GS"}];
    $scope.defaultSecurityAttribute = "Price";
    $scope.availableSecurityAttributes = ["Price", "Volume"];
    $scope.onAttributeSelect = function (attr, security) {
        return {
            id: "securitySeries."+security.id+"."+attr,
            securityId: security.id,
            name: security.label + " " + attr,
            data: generateRandomPairs(domain(), [0, 100])
        };
    };
    $scope.apiHandle = {};
});

const domain = function () {
    return _.map(["2015-01-01", "2015-01-02", "2015-01-03", "2015-01-04","2015-01-05"], function (date) {
        return moment(date).valueOf();
    })
};

/**
 * bounded random function to generate Y value for the given domain
 * @param domain
 * @param range
 */
function generateRandomPairs(domain, range) {
    return _.map(domain, function (x) {
        return [x, Math.floor(Math.random() * range[1]) + range[0]];
    });
}
