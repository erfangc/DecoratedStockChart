angular.module("DecoratedStockChart", ['ui.bootstrap'])
    .directive("decoratedStockChart", function () {
        return {
            scope: {
                securities: "=",
                /**
                 * a list of available security attributes that the user can choose from
                 */
                availableSecurityAttributes: "=",
                defaultSecurityAttribute: "=",
                /**
                 * callback for when the user adds an attribute for a security
                 * expects a Highchart.Series object in return
                 */
                onAttributeSelect: "&",
                /**
                 * callback for when user remove a security entirely from the Chart
                 */
                onSecurityRemove: "&",
                /**
                 * callback for when the user changes the primary attribute
                 * expects an Array of Highchart.Series objects each with securityId populated
                 * @param newAttr Object describing the new attribute
                 */
                onDefaultAttributeChange: "&",
                /**
                 * options object for the underlying Highstock object
                 */
                highStockOptions: "=",
                /**
                 * the API through which this directive exposes behavior to external (parent) components
                 * this component's behavior can be accessed via scope.apiHandle.api
                 */
                apiHandle: "="
            },
            link: function (scope, elem) {
                scope.states = {
                    /**
                     * a map of which security has which attribute enabled
                     */
                    securityAttrMap: [],
                    /**
                     * to hold the Highstock object
                     */
                    chart: null
                };
                /**
                 * define the API exposed to the parent component
                 */
                scope.apiHandle.api = {
                    addSecurity: null, // TODO implement a handler for adding new securities
                    removeSecurity: null // TODO implement a handler for removing security
                };

                // default highstock options
                const highstockOptions = {
                    // TODO fill this out
                    chart: {
                        renderTo: "enriched-highstock-1"
                    },
                    title: {
                        text: "Demo"
                    },
                    xAxis: {
                        type: "datetime"
                    },
                    series: []
                };

                /**
                 * the seriesTransformer object exposes
                 * methods to transform the series that is passed in
                 */
                const seriesTransformer = {

                    toMovingAvg: function (origSeries) {
                        // TODO fill this out
                    },
                    toMovingVol: function (origSeries) {
                        // TODO fill this out
                    }

                };

                /**
                 * the chartMutator object exposes methods
                 * that mutates the `state.chart` of the component
                 */
                const chartMutator = {
                    changeAxis: function (series, axisName) {
                        // TODO implement a way to create / move series to different axis
                    },
                    changeTitle: function (newTitle) {

                    }
                };

                /**
                 * DOM functions exposed on the scope
                 */

                /**
                 * handles type ahead select event
                 * calls the appropriate parent callback to get series object
                 * @param $item
                 * @param securityAttrPair
                 */
                scope.addAttr = function ($item, securityAttrPair) {
                    // add $item to securityAttrPair
                    securityAttrPair[1].push($item);
                    // get series
                    const series = scope.onAttributeSelect({attr: $item, security: securityAttrPair[0]});
                    // add to chart
                    scope.states.chart.addSeries(series);
                };
                /**
                 * handles removing a series when the user remove an attr for a specific security
                 * no callback is invoked because removing a series does not require external communication
                 * @param securityAttrPair
                 * @param attr
                 */
                scope.removeAttr = function (attr, securityAttrPair) {
                    // TODO when security and attr become more than just strings we need a consistent way to determine ID
                    // remove attr from chart
                    scope.states.chart.get("securitySeries." + securityAttrPair[0].id + "." + attr).remove();
                    // remove attr from state
                    securityAttrPair[1].splice(securityAttrPair[1].indexOf(attr),1);
                };

                /**
                 * initialization & initial rendering
                 */
                // TODO initialize the widget!
                scope.states.chart = new Highcharts.Chart(highstockOptions);
                _.each(scope.securities, function (security) {
                    const securityAttrPair = [security, []];
                    scope.states.securityAttrMap.push(securityAttrPair);
                   scope.addAttr(scope.defaultSecurityAttribute, securityAttrPair);
                });


            },
            templateUrl: "../src/DecoratedStockChart.html"
        };
    });