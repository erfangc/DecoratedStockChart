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
                highstockOptions: "=",
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
                    /**
                     * add a security
                     * @param security
                     */
                    addSecurity: function (security) {
                        // check for redundancy (i.e. a security with the given security's ID already exists)
                        const isRedundant = _.chain(scope.states.securityAttrMap)
                                .map(function (securityAttrPair) {
                                    return securityAttrPair[0].id;
                                }).uniq().value().indexOf(security.id) != -1;

                        if (isRedundant)
                            return;

                        const securityAttrPair = [security, []];
                        scope.states.securityAttrMap.push(securityAttrPair);
                        scope.addAttr(scope.defaultSecurityAttribute, securityAttrPair);
                    },
                    /**
                     * remove a security by ID
                     * @param id
                     */
                    removeSecurity: function (id) {
                        // remove the security with this ID from state
                        const idx = _.findIndex(scope.states.securityAttrMap, function (securityAttrPair) {
                            return securityAttrPair[0].id == id;
                        });
                        if (idx == -1)
                            return;
                        scope.states.securityAttrMap.splice(idx, 1);

                        // remove outstanding series on the Highchart object
                        // * Note we cannot use a regular for loop b/c the Chart.series object re-shuffles after each remove
                        // and we will run into concurrent modification problems
                        _.chain(scope.states.chart.series).filter(function (series) {
                            return series && series.options.securityId == id;
                        }).each(function (series) {
                            series.remove();
                        });

                        // fire callback if provided
                        if (_.isFunction(scope.onSecurityRemove))
                            scope.onSecurityRemove({id: id});
                    }
                };

                // default highstock options
                const highstockOptions = _.extend({
                    chart: {
                        renderTo: "enriched-highstock-1"
                    },
                    title: {
                        text: "Demo"
                    },
                    xAxis: {
                        type: "datetime"
                    },
                    legend: {
                        useHTML: true
                    },
                    series: [],
                    credits: {enabled: false}
                }, scope.highstockOptions);

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
                            }),
                            securityId: origSeries.options.securityId || null
                        };
                    },
                    toMovingVol: function (origSeries) {
                        return {
                            id: origSeries.id + ".30DayMV",
                            name: origSeries.name + " 30 Day Moving Vol",
                            data: origSeries.data.map(function (data) {
                                return [data.x, data.y * Math.random()];
                            }),
                            securityId: origSeries.options.securityId || null
                        };
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
                    securityAttrPair[1].push($item);
                    const series = scope.onAttributeSelect({attr: $item, security: securityAttrPair[0]});
                    series.securityId = securityAttrPair[0].id;
                    series.id = generateSeriesID(securityAttrPair[0], $item);
                    series.onRemove = function () {
                        scope.removeAttr($item, securityAttrPair);
                    };
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
                    const series = scope.states.chart.get(generateSeriesID(securityAttrPair[0], attr));
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
                    scope.apiHandle.api.addSecurity(security);
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
    const series = args.series;
    const disableTransformation = series.options.disableFurtherTransformation;
    const addMA = function () {
        return $("<li><a>Add Moving Average</a></li>").click(function () {
            const transformedSeries = seriesTransformer.toMovingAvg(series);
            transformedSeries.disableFurtherTransformation = true;
            scope.addSeries(transformedSeries);
        });
    };
    const addMV = function () {
        return $("<li><a>Add Moving Volatility</a></li>").click(function () {
            const transformedSeries = seriesTransformer.toMovingVol(series);
            transformedSeries.disableFurtherTransformation = true;
            scope.addSeries(transformedSeries);
        });
    };
    const removeSeries = function () {
        return $("<li><a>Remove</a></li>").click(function () {
            scope.$apply(function () {
                scope.removeSeries(series);
            });
        });
    };
    const moveToNewAxis = function () {
        return $("<li><a><i class=\"fa fa-plus\"></i> Move To New Axis</a></li>").click(function () {
            const chart = scope.states.chart;
            chart.addAxis({
                title: {text: series.name},
                opposite: chart.axes.length % 2 == 0
            });
            // FIXME the only way I know how to move axis is to destroy and recreate the series, figure out a better way if possible
            const seriesOptions = series.options;
            seriesOptions.yAxis = chart.axes.length - 2;
            series.remove();
            scope.addSeries(seriesOptions);
        });
    };
    return disableTransformation ? [moveToNewAxis(), removeSeries()] : [moveToNewAxis(), addMA(), addMV(), removeSeries()];
}

/**
 * attach the proper event listener behavior to legend elements
 * enabling dynamic context menu creation
 * @param args
 */
function attachContextMenuEvents(args) {

    const $ctxMenu = args.ctxMenu;
    const $legendElement = args.legendElement;
    $legendElement.css({
        "user-select": "none"
    });
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
 * @param security
 * @param attr
 * @returns {string}
 */
function generateSeriesID(security, attr) {
    return ["Security", security.id, attr.tag].join(".");
}
