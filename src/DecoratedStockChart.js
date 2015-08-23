angular.module("DecoratedStockChart", ['ui.bootstrap'])
    .directive("decoratedStockChart", function () {
        return {
            scope: {
                securities: "=",
                /**
                 * a list of available security attributes that the user can choose from
                 */
                availableSecurityAttributes: "=",
                /**
                 * the default attribute to plot for newly added securities
                 */
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
                    series: [],
                    credits: {enabled: false}
                };

                /**
                 * the seriesTransformer object exposes
                 * methods to transform the series that is passed in
                 */
                scope.seriesTransformer = {
                    toMovingAvg: function (origSeries) {
                        return {
                            id: origSeries.id + ".30DayMA",
                            name: origSeries.name + " 30 Day Moving Average",
                            data: origSeries.data.map(function (data) {
                                return [data.x, data.y * Math.random()];
                            })
                        }
                    },
                    toMovingVol: function (origSeries) {
                        return {
                            id: origSeries.id + ".30DayMV",
                            name: origSeries.name + " 30 Day Moving Vol",
                            data: origSeries.data.map(function (data) {
                                return [data.x, data.y * Math.random()];
                            })
                        }
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
                    series.onRemove = function () {
                        scope.removeAttr($item, securityAttrPair);
                    };
                    // add to chart
                    scope.addSeries(series);
                };

                /**
                 * handles removing a series when the user remove an attr for a specific security
                 * no callback is invoked because removing a series does not require external communication
                 * @param securityAttrPair
                 * @param attr
                 */
                scope.removeAttr = function (attr, securityAttrPair) {
                    // remove attr from chart
                    const series = scope.states.chart.get(generateSeriesID(securityAttrPair, attr));
                    if (series)
                        series.remove();
                    // remove attr from state
                    securityAttrPair[1].splice(securityAttrPair[1].indexOf(attr), 1);
                };

                /**
                 * create a reusable context menu to be displayed
                 * at the user's discretion
                 */
                const $ctxMenu = createCtxMenu(elem);

                /**
                 * add series objects to the underlying highstock
                 * attach various event listeners
                 * @param s
                 */
                scope.addSeries = function (s) {
                    scope.states.chart.addSeries(s);
                    const series = scope.states.chart.get(s.id);
                    const $legend = $(series.legendItem.element);
                    attachContextMenuEvents({
                        series: series,
                        scope: scope,
                        legendElement: $legend,
                        ctxMenu: $ctxMenu
                    });
                };

                /**
                 * handles removing a given series from the chart
                 * but also performs state syncs
                 *
                 * @param s a Highcharts.Series object (not a series option object literal)
                 */
                scope.removeSeries = function (s) {
                    if (s.options.onRemove)
                        s.options.onRemove();
                    else
                        s.remove();
                };

                scope.toggleSecurityControl = function (showSecurityControl) {
                    if (showSecurityControl)
                        elem.find(".security-control").slideDown(500);
                    else
                        elem.find(".security-control").slideUp(500);
                };

                /**
                 * initialization & initial rendering
                 */
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

/**
 * resolve the correct context menu items given the series
 * @param args
 * @returns {*[]}
 */
function getMenuItems(args) {
    const scope = args.scope;
    const seriesTransformer = scope.seriesTransformer;
    const addMA = function () {
        return $("<li><a>Add Moving Average</a></li>").click(function () {
            const series = seriesTransformer.toMovingAvg(args.series);
            scope.addSeries(series);
        });
    };
    const addMV = function () {
        return $("<li><a>Add Moving Volatility</a></li>").click(function () {
            const series = seriesTransformer.toMovingVol(args.series);
            scope.addSeries(series);
        });
    };
    const removeSeries = function () {
        return $("<li><a>Remove</a></li>").click(function () {
            scope.$apply(function () {
                scope.removeSeries(args.series);
            });
        });
    };
    return [addMA(), addMV(), removeSeries()];
}

/**
 *
 * creates a context menu for the given args
 * @param args
 * @constructor
 */
function attachContextMenuEvents(args) {

    const $ctxMenu = args.ctxMenu;
    const $legendElement = args.legendElement;

    /**
     * this code executed when the legend is right-clicked, therefore
     * this is when we mutate the DOM (not before)
     */
    $legendElement.mousedown(function (e) {
        if (e.button == 2) {
            e.preventDefault();
            e.stopPropagation();
            $ctxMenu.find(".dropdown-menu li").remove();
            _.each(getMenuItems(args), function (menuItem) {
                $ctxMenu.find(".dropdown-menu").append(menuItem);
            });
            $ctxMenu.css({
                top: e.clientY + "px",
                left: e.clientX + "px"
            });
            $ctxMenu.show();
            return false;
        }
    });

    $legendElement.bind('contextmenu', function () {
        return false;
    });

    return $ctxMenu;
}

/**
 * create the reusable context menu
 * this menu becomes visible when user right-clicks
 * the legend. The menu items in this menu is dynamically generated
 * at the time the right-click event is generated
 *
 * @param elem the parent element to attach the generated context menu
 * @returns {*|jQuery}
 */
function createCtxMenu(elem) {
    const $ctxMenu = $(
        "<div style='position: fixed; z-index: 10;'>" +
        "<ul class='dropdown-menu' style='display: block;'></ul>" +
        "</div>"
    ).hide();
    $ctxMenu.prependTo(elem);
    elem.click(function () {
        $ctxMenu.hide();
    });
    return $ctxMenu;
}

/**
 * generates the Series ID for security time series
 * @param securityAttrPair
 * @param attr
 * @returns {string}
 */
function generateSeriesID(securityAttrPair, attr) {
    return "securitySeries." + securityAttrPair[0].id + "." + attr;
}
