(function () {
    angular.module("DecoratedStockChart", ['ui.bootstrap'])
        .directive("decoratedStockChart", function ($timeout) {
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
                     * this is the chart title
                     */
                    title: "@",
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
                    scope.id = _.uniqueId();
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

                    // disable default right-click triggered context menu
                    elem.bind('contextmenu', function () {
                        return false;
                    });

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
                            renderTo: "enriched-highstock-" + scope.id,
                            type: "spline"
                        },
                        title: {
                            text: scope.title || "Untitled",
                            events: {
                                click: dsc.onTitleClick
                            }
                        },
                        plotOptions: {
                            spline: {
                                marker: {enabled: false}
                            }
                        },
                        xAxis: {
                            type: "datetime"
                        },
                        yAxis: {
                            title: {
                                text: scope.defaultSecurityAttribute.label,
                                events: {
                                    click: function (event) {
                                        dsc.onAxisClick.call(this, event, scope);
                                    }
                                },
                                id: "yAxis.1"
                            }
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
                        scope.isProcessing = true;
                        const result = scope.onAttributeSelect({attr: $item, security: securityAttrPair[0]});

                        function processSeries(series) {
                            series.securityId = securityAttrPair[0].id;
                            series.id = dsc.generateSeriesID(securityAttrPair[0], $item);
                            series.onRemove = function () {
                                scope.removeAttr($item, securityAttrPair);
                            };
                            scope.addSeries(series);
                            scope.isProcessing = false;
                        }

                        if (result && angular.isFunction(result.then))
                            result.then(function (series) {
                                processSeries(series);
                            }, function () {
                                scope.isProcessing = false;
                            });
                        else
                            processSeries(result);


                    };

                    /**
                     * handles removing a series when the user remove an attr for a specific security
                     * no callback is invoked because removing a series does not require external communication
                     * @param securityAttrPair
                     * @param attr
                     */
                    scope.removeAttr = function (attr, securityAttrPair) {
                        // remove attr from chart
                        const series = scope.states.chart.get(dsc.generateSeriesID(securityAttrPair[0], attr));
                        if (series)
                            series.remove();
                        // remove attr from state
                        securityAttrPair[1].splice(securityAttrPair[1].indexOf(attr), 1);
                    };

                    /**
                     * create a reusable context menu to be displayed
                     * at the user's discretion
                     */
                    scope.$ctxMenu = dsc.createCtxMenu(elem);

                    /**
                     * add series objects to the underlying highstock
                     * attach various event listeners
                     * @param s
                     */
                    scope.addSeries = function (s) {
                        scope.states.chart.addSeries(s);
                        const series = scope.states.chart.get(s.id);
                        const $legend = $(series.legendItem.element);
                        dsc.attachContextMenuEvents({
                            series: series,
                            scope: scope,
                            legendElement: $legend
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

                    scope.toggleSlide = function (show, className) {
                        var $ctrl = elem.find("." + className);
                        if (show) {
                            $ctrl.slideDown(500);
                            $ctrl.find("input").first().select();
                        }
                        else
                            $ctrl.slideUp(500);
                    };

                    $timeout(function () {
                        /**
                         * initialization & initial rendering
                         */
                        scope.states.chart = new Highcharts.Chart(highstockOptions);
                        _.each(scope.securities, function (security) {
                            scope.apiHandle.api.addSecurity(security);
                        });
                    });


                },
                templateUrl: "../src/DecoratedStockChart.html"
            };
        });
}());

/**
 * this module exposes the 'dsc' object which contains utility and helper functions for the main angular directive
 */
(function () {
    const root = this; // this == window
    const dsc = {};
    root.dsc = dsc;

    /**
     * handles user click on an axis
     * @param event
     * @param scope
     */
    root.dsc.onAxisClick = function (event, scope) {
        event.preventDefault();
        event.stopPropagation();

        const axis = this;
        // empty existing context menu - add axis specific menu items
        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();

        function removeAxis() {
            return $("<li><a><i class='fa fa-remove'></i>&nbsp;Remove Axis</a></li>")
                .click(function () {
                    while (axis.series.length > 0)
                        dsc.moveAxis(axis.series[0], 0, scope);
                    axis.remove();
                });
        }

        function editAxisTitle() {
            const $input = $("<input type='text' class='form-control' style='position:relative; left: 10%; width: 80%;'/>");
            $input.val(axis.axisTitle.textStr);
            $input.on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    axis.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                }
            });
            const $menuItem = $("<li><span></span></li>")
                .click(function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
            $menuItem.children("span").append($input);
            return $menuItem;
        };

        $ctxMenu.children(".dropdown-menu")
            .append(editAxisTitle());
        if (scope.states.chart.yAxis.length > 1
            && axis.userOptions.id != scope.states.chart.yAxis[0].userOptions.id)
            $ctxMenu.children(".dropdown-menu").append(removeAxis());
        $ctxMenu.css({
            top: event.clientY + "px",
            left: event.clientX + "px"
        });
        // focus on the edit axis title input
        $ctxMenu.show();
        $ctxMenu.find("input.form-control").select();
    };

    /**
     * resolve the correct context menu items given the series
     * @param args
     * @returns {*[]}
     */
    root.dsc.getMenuItems = function (args) {
        const scope = args.scope;
        const seriesTransformer = scope.seriesTransformer;
        const series = args.series;
        const disableTransformation = series.options.disableFurtherTransformation;
        const chart = scope.states.chart;
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
        const changeAxis = function () {
            return $("<li class='dropdown-submenu'><a>Change Axis</a></li>")
                .append(dsc.createAxesSubMenu(series, chart, scope));
        };
        return disableTransformation ? [changeAxis(), removeSeries()]
            : [changeAxis(), addMA(), addMV(), removeSeries()];
    };

    /**
     * moves an series from its current axis to the specified axis
     * @param series
     * @param axis
     * @param scope
     */
    root.dsc.moveAxis = function (series, axis, scope) {
        const seriesOptions = series.options;
        if (typeof axis == "number")
            seriesOptions.yAxis = axis;
        else
        // figure out the position
            seriesOptions.yAxis = _.findIndex(scope.states.chart.yAxis, function (x) {
                return x.userOptions.id == axis.userOptions.id;
            });
        seriesOptions.color = series.color;
        series.remove();
        scope.addSeries(seriesOptions);
    };

    /**
     * create a sub dropdown for every axes in the chart
     * each item in the dropdown triggers a migration of the
     * given series to the axis represented by the item
     * @param series
     * @param chart
     * @param scope
     */
    root.dsc.createAxesSubMenu = function (series, chart, scope) {
        const $dropdown = $("<ul class='dropdown-menu'></ul>");
        _.each(chart.yAxis, function (axis, idx) {
            const $menuItem = $("<li><a>Y-Axis " + (idx + 1) + " " + axis.options.title.text + "</a></li>")
                .click(function () {
                    dsc.moveAxis(series, idx, scope);
                });
            $dropdown.append($menuItem);
        });
        const axisId = "yAxis." + chart.yAxis.length;
        $dropdown.append($("<li><a><i class=\"fa fa-plus\"></i> Move To New Axis</a></li>").click(function () {
            chart.addAxis({
                title: {
                    text: series.name,
                    events: {
                        click: function (event) {
                            dsc.onAxisClick.call(this, event, scope);
                        }
                    }
                },
                opposite: chart.axes.length % 2 == 0,
                id: axisId
            });
            dsc.moveAxis(series, chart.get(axisId), scope);
        }));
        return $dropdown;
    };

    /**
     * attach the proper event listener behavior to legend elements
     * enabling dynamic context menu creation
     * @param args
     */
    root.dsc.attachContextMenuEvents = function (args) {

        const $ctxMenu = args.scope.$ctxMenu;
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
                _.each(dsc.getMenuItems(args), function (menuItem) {
                    $ctxMenu.children(".dropdown-menu").append(menuItem);
                });
                $ctxMenu.css({
                    top: e.clientY + "px",
                    left: e.clientX + "px"
                });
                $ctxMenu.show();
                return false;
            }
        });

        return $ctxMenu;
    };

    /**
     * create the reusable context menu
     * this menu becomes visible when user right-clicks
     * the legend. The menu items in this menu is dynamically generated
     * at the time the right-click event is generated
     *
     * @param elem the parent element to attach the generated context menu
     * @returns {*|jQuery}
     */
    root.dsc.createCtxMenu = function (elem) {
        const $ctxMenu = $(
            "<div style='position: fixed; z-index: 10;'>" +
            "<ul class='clickable dropdown-menu multi-level' style='display: block;'></ul>" +
            "</div>"
        ).hide();
        $ctxMenu.prependTo(elem);
        elem.click(function () {
            $ctxMenu.hide();
        });
        return $ctxMenu;
    };

    /**
     * generates the Series ID for security time series
     * @param security
     * @param attr
     * @returns {string}
     */
    root.dsc.generateSeriesID = function (security, attr) {
        return ["Security", security.id, attr.tag].join(".");
    };

    /**
     * this is the event handler for the user clicking on the chart title
     * @param clickEvent
     */
    root.dsc.onTitleClick = function (clickEvent) {
        const chart = this;
        const $container = $(this.container);
        if ($container.find("input.form-control").length != 0)
            return;
        const $input = $("<input class='form-control floating-input' placeholder='Type a New Title, Hit Enter to Confirm, ESC to Cancel'/>");
        $input
            .on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") { // ENTER
                    chart.setTitle({text: $input.val()});
                    $input.remove();
                } else if (keyEvent.keyCode == 27) // ESCAPE
                    $input.remove();
            })
            .css({
                top: $(clickEvent.target).position().top,
                left: "1%",
                width: "98%"
            }).appendTo($container);
        $input.focus();
    }

}());
