angular.module('Example', ['decorated-stock-chart']).controller("MainCtrl", function ($scope) {

    $scope.securities = [{id: 1, label: "T"}, {id: 2, label: "VZ"}, {id: 3, label: "GS"}];
    $scope.defaultSecurityAttribute = {tag: "price", label: "Price"};
    $scope.availableSecurityAttributes = [{tag: "price", label: "Price"}, {tag: "volume", label: "Volume"}];
    $scope.onAttributeSelect = function (attr, security) {
        return {
            name: security.label + " " + attr.label,
            data: generateRandomPairs(domain(), [0, 1000])
        };
    };
    $scope.onSecurityRemove = function (id) {
        $scope.message = "Callback Fired: Security with ID = " + id + " was Removed!";
        $("#alert").slideDown(500);
    };
    $scope.closeAlert = function () {
        $("#alert").slideUp(500);
    };
    $scope.apiHandle = {};
    // demo functions
    $scope.addSecurity = function (security) {
        $scope.apiHandle.api.addSecurity(security);
    };

});

/**
 * this returns the last 30 days in Unix epoch
 * @returns {Array}
 */
const domain = function () {
    const x = [];
    const now = moment();
    for (var i = 0; i < 30; i++)
        x.push(now.clone().subtract(i, 'd').valueOf());
    x.reverse();
    return x;
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
