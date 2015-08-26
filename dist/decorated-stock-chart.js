(function () {
    angular.module("decorated-stock-chart", ['ui.bootstrap'])
        .directive("decoratedStockChart", function ($timeout) {
            return {
                scope: {
                    securities: "=",
                    startDate: "@?",
                    endDate: "@?",
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
                     * Object of passed in user date representaitons (string or number) transformed to Date objects
                     * @type {{start: Date, end: Date}}
                     */
                    scope.dateObjs = {
                        start: scope.startDate && scope.endDate ?
                            new Date(scope.startDate == parseInt(scope.startDate) ? parseInt(scope.startDate) : scope.startDate) : null,
                        end: scope.startDate && scope.endDate ?
                            new Date(scope.endDate == parseInt(scope.endDate) ? parseInt(scope.endDate) : scope.endDate) : null
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
                        },
                        /**
                         * Change the x axis range of the chart given string representations of start and end
                         * @param start
                         * @param end
                         *
                         * @returns true if there was an error
                         */
                        changeDateRange: function(start, end){
                            // Validate date
                            if( !start || !end || start >= end){
                                return true;
                            }
                            scope.states.chart.xAxis[0].setExtremes(new Date(start).getTime(), new Date(end).getTime());
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
                                }
                            },
                            id: "yAxis.1"
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
                        toSimpleMA: function (origSeries, numDays) {
                            const sma = dsc.SMAFactory(numDays);
                            const xy = _.chain(origSeries.data).map(function (datum) {
                                return [datum.x, sma(datum.y)];
                            }).value();

                            return {
                                id: origSeries.options.id + "." + numDays + "DaySMA",
                                name: origSeries.name + " " + numDays + " Day SMA",
                                data: xy,
                                securityId: origSeries.options.securityId || null
                            };
                        },
                        toBasis: function (series, otherSeries) {
                            /**
                             * we only take basis where 'otherSeries' has data, there is no lookback
                             */
                            const otherData = _.chain(otherSeries.data).map(function (datum) {
                                return [moment(datum.x).format("YYYYMMDD"), datum.y];
                            }).object().value();
                            const data = _.chain(series.data).filter(function (datum) {
                                return otherData[moment(datum.x).format("YYYYMMDD")];
                            }).map(function (datum) {
                                return [datum.x, datum.y - otherData[moment(datum.x).format("YYYYMMDD")]];
                            }).value();
                            return {
                                id: series.options.id + ".basisVs." +otherSeries.options.id,
                                name: "Basis of " + series.name + " - " + otherSeries.name,
                                securityId: series.options.securityId || null,
                                data: data
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
                    scope.$ctxMenu = dsc.buildContextMenuContainer(elem);

                    /**
                     * add series objects to the underlying highstock
                     * attach various event listeners
                     * @param seriesOption
                     */
                    scope.addSeries = function (seriesOption) {
                        const chart = scope.states.chart;
                        if (chart.get(seriesOption.id))
                            return;
                        chart.addSeries(seriesOption);
                        dsc.attachLegendEventHandlers(chart.get(seriesOption.id), scope);
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

                    scope.changeDate = function(){
                        if( !scope.states.startDate || !scope.states.endDate || scope.states.startDate >= scope.states.endDate){
                            return true;
                        }
                        scope.states.chart.xAxis[0].update(setDefinedDateRange(scope.states.startDate, scope.states.endDate).xAxis);
                        return false;
                    };

                    $timeout(function () {
                        /**
                         * initialization & initial rendering
                         */
                        scope.states.chart = new Highcharts.Chart(highstockOptions);
                        _.each(scope.securities, function (security) {
                            scope.apiHandle.api.addSecurity(security);
                        });
                        scope.apiHandle.api.changeDateRange(scope.dateObjs.start, scope.dateObjs.end);
                    });
                },
                templateUrl: "DecoratedStockChart.html"
            };
        });
}());

/**
 * this module exposes the 'dsc' object which contains utility and helper functions for the main angular directive
 */
(function () {
    const root = this; // this == window
    const dsc = root.dsc || {};
    root.dsc = dsc;

    /**
     * attaches event listener that triggers a context menu appearance when legend item is right-clicked
     * @param series
     * @param scope
     */
    root.dsc.attachLegendEventHandlers = function (series, scope) {
        $(series.legendItem.element)
            .css({"user-select": "none"})
            .mousedown(function (event) {
                if (event.button == 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    return dsc.triggerSeriesContextMenu(event, {
                        series: series,
                        scope: scope
                    });
                }
            })
    };

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
                .click(dsc.inertClickHandler);
            $menuItem.children("span").append($input);
            return $menuItem;
        }

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
     * a click event handler that does nothing and prevents propagation
     * @param e
     */
    root.dsc.inertClickHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
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
    };

    /**
     * generator function for SMA. Credit: Rosetta Code
     * @param period MA of this period will be taken by the resulting function
     * @returns {Function}
     */
    root.dsc.SMAFactory = function (period) {
        var nums = [];
        return function (num) {
            nums.push(num);
            if (nums.length > period)
                nums.splice(0, 1);  // remove the first element of the array
            var sum = 0;
            for (var i in nums)
                sum += nums[i];
            var n = period;
            if (nums.length < period)
                n = nums.length;
            return (sum / n);
        }
    }
}());

(function () {
    const root = this; // this == window
    const dsc = root.dsc || {};
    root.dsc = dsc;

    /**
     * create the reusable context menu
     * this menu becomes visible when user right-clicks
     * the legend. The menu items in this menu is dynamically generated
     * at the time the right-click event is generated
     *
     * @param elem the parent element to attach the generated context menu
     * @returns {*|jQuery}
     */
    root.dsc.buildContextMenuContainer = function (elem) {
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
     * event handler for trigger a context menu that is series specific
     * (i.e. right-clicking on a legend or clicking on a series)
     * this code executed when the legend is right-clicked, therefore
     * this is when we mutate the DOM (not before)

     * @param event the mouse click event
     * @param args additional args, containing the series and the scope
     * @returns {boolean}
     */
    root.dsc.triggerSeriesContextMenu = function (event, args) {
        const $ctxMenu = args.scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        _.each(dsc.buildMenuItems(args), function (menuItem) {
            $ctxMenu.children(".dropdown-menu").append(menuItem);
        });
        $ctxMenu.css({
            top: event.clientY + "px",
            left: event.clientX + "px"
        });
        $ctxMenu.show();
        return false;
    };

    /**
     * resolve the correct context menu items given the series
     * @param args
     * @returns {*[]}
     */
    root.dsc.buildMenuItems = function (args) {
        const scope = args.scope;
        const seriesTransformer = scope.seriesTransformer;
        const series = args.series;
        const disableTransformation = series.options.disableFurtherTransformation;
        const chart = scope.states.chart;

        /**
         * creates menu item and submenus for transformer functions (i.e. moving avgs etc)
         * @param transformFn
         * @param text
         * @returns {*|jQuery}
         */
        function transformerMenuItemGenerator(transformFn, text) {
            const $input = $("<input type='text' placeholder='Day(s)' class='form-control' style='position: relative; width: 80%; left: 10%;'/>");
            return $("<li class='dropdown-submenu'><a>" + text + "</a></li>")
                .click(function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    $input.focus();
                })
                .append($("<li class='dropdown-menu'><span></span></li>")
                    .click(dsc.inertClickHandler)
                    .append($input.on('keydown', function (keyEvent) {
                        if (keyEvent.keyCode == 13) {
                            if (isNaN(parseInt($input.val())) || $input.val() == '')
                                return;
                            const transformedSeries = transformFn(series, parseInt($input.val()));
                            transformedSeries.disableFurtherTransformation = true;
                            scope.addSeries(transformedSeries);
                            scope.$ctxMenu.hide();
                        }
                    })));
        }

        const addMA = transformerMenuItemGenerator.bind(null, seriesTransformer.toSimpleMA, "Add Simple MA");

        const basis = function () {
            return $("<li class='dropdown-submenu'><a>Show Basis vs. </a></li>")
                .append(dsc.buildSeriesSubMenu({
                    scope: scope,
                    onClick: function (event, otherSeries) {
                        const transformedSeries = seriesTransformer.toBasis(series, otherSeries);
                        scope.addSeries(transformedSeries);
                    },
                    currentSeries: series
                }));
        };

        function changeType() {
            const $subMenu = $("<ul class='dropdown-menu'></ul>");
            _.chain([['Line', 'spline', 'line-chart'], ['Area', 'areaspline', 'area-chart'], ['Column', 'column', 'bar-chart']])
                .filter(function (type) {
                    return type[1] !== series.type;
                })
                .each(function (type) {
                    $("<li><a><i class='fa fa-" + type[2] + "'></i>&nbsp;" + type[0] + "</a></li>")
                        .click(function () {
                            series.update({type: type[1]});
                            // for some chart update wipes out legend event handler
                            // so we reattach them here
                            dsc.attachLegendEventHandlers(series, scope);
                        }).appendTo($subMenu);
                });
            return $("<li class='dropdown-submenu'><a>Change Chart Type</a></li>").append($subMenu);
        }

        const removeSeries = function () {
            return $("<li><a>Remove</a></li>").click(function () {
                scope.$apply(function () {
                    scope.removeSeries(series);
                });
            });
        };
        const changeAxis = function () {
            return $("<li class='dropdown-submenu'><a>Change Axis</a></li>")
                .append(dsc.buildAxesSubMenu(series, chart, scope));
        };
        return disableTransformation ? [changeAxis(), basis(), changeType(), removeSeries()]
            : [changeAxis(), addMA(), addMV(), basis(), changeType(), removeSeries()];
    };

    /**
     * create a sub dropdown for every series in the chart. the functionality of
     * clicking on the menu items in this dropdown will be provided as callbacks
     * since there could be multiple behaviors
     *
     * if args contain a 'currentSeries' property, which is assumed to be of the type Highchart.Series,
     * then this series will not be included in the resulting submenu
     *
     * @param args
     */
    root.dsc.buildSeriesSubMenu = function (args) {
        const chart = args.scope.states.chart;
        const callback = args.onClick;
        const currentSeries = args.currentSeries;
        const $subMenu = $("<ul class='dropdown-menu'></ul>");
        const filteredSeries = _.filter(chart.series, function (series) {
            return currentSeries && series.options.id !== currentSeries.options.id;
        });
        if (filteredSeries.length == 0)
            $subMenu.append("<li><a>No Other Series to Compare To</a></li>");
        else
            _.each(filteredSeries, function (series) {
                $("<li><a>" + series.name + "</a></li>")
                    .click(function (event) {
                        callback(event, series);
                    }).appendTo($subMenu);
            });

        return $subMenu;
    };

    /**
     * create a sub dropdown for every axes in the chart
     * each item in the dropdown triggers a migration of the
     * given series to the axis represented by the item
     * @param series
     * @param chart
     * @param scope
     */
    root.dsc.buildAxesSubMenu = function (series, chart, scope) {
        const $dropdown = $("<ul class='dropdown-menu'></ul>");
        _.chain(chart.yAxis)
            .filter(function (axis) {
                // do not show the axis that the series currently belongs to already
                return axis.userOptions.id !== series.yAxis.userOptions.id;
            })
            .each(function (axis) {
                const $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "</a></li>")
                    .click(function () {
                        dsc.moveAxis(series, axis, scope);
                    });
                $dropdown.append($menuItem);
            });
        const axisId = "yAxis." + (chart.yAxis.length + 1);
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
}());
angular.module("decorated-stock-chart").run(["$templateCache", function($templateCache) {$templateCache.put("DecoratedStockChart.html","<div class=\"root\" style=\"position: relative\">\r\n    <i ng-show=\"isProcessing\" style=\"position: absolute; left: 50%; z-index: 5\" class=\"fa fa-spinner fa-spin fa-3x\"></i>\r\n\r\n    <div class=\"control flex-container\"\r\n         ng-init=\"showSecurityControl = false; showIndicatorControl = false; showBenchmarkControl = false;\">\r\n        <!-- security & attributes selection -->\r\n            <span class=\"wrappable-flex-item\">\r\n                <input type=\"text\" ng-model=\"defaultSecurityAttribute\" class=\"form-control\"\r\n                       style=\"width: 8em; display: inline;\"\r\n                       typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue | limitTo:8\"/>\r\n            <a><i ng-click=\"toggleSlide(!showSecurityControl, \'security-control\'); showSecurityControl = !showSecurityControl\"\r\n                  class=\"fa clickable\"\r\n                  ng-class=\"{\'fa-chevron-up\': showSecurityControl, \'fa-chevron-down\': !showSecurityControl}\"></i></a>\r\n        </span>\r\n        <!-- TODO implement these date functionalities -->\r\n        <span class=\"wrappable-flex-item\">\r\n            <a class=\"clickable\">1M</a>\r\n            &nbsp;\r\n            <a class=\"clickable\">3M</a>\r\n            &nbsp;\r\n            <a class=\"clickable\">6M</a>\r\n            &nbsp;\r\n            <a class=\"clickable\">1Y</a>\r\n            &nbsp;\r\n            <a class=\"clickable\">2Y</a>\r\n            &nbsp;\r\n            <span ng-init=\"showDateControl = false\">\r\n                <a class=\"clickable\"\r\n                   ng-click=\"toggleSlide(!showDateControl, \'date-control\'); showDateControl = !showDateControl; dateChangeError = false\"><i\r\n                        class=\"fa fa-calendar\"></i></a>\r\n                <div class=\"date-control floating-form\" style=\"display: none;\">\r\n                    <label>From&nbsp;<input type=\"date\" class=\"form-control\"\r\n                                            style=\"display: inline; width: 12em;\" ng-model=\"dateObjs.start\"/></label>\r\n                    <label>To&nbsp;<input type=\"date\" class=\"form-control\"\r\n                                          style=\"display: inline; width: 12em;\" ng-model=\"dateObjs.end\"/></label>\r\n                    <button class=\"btn btn-success\" ng-click=\"dateChangeError = apiHandle.api.changeDateRange(dateObjs.start, dateObjs.end)\"><i class=\"fa fa-play\"></i></button>\r\n                    <p ng-show=\"dateChangeError\">Invalid date range.  Please check and try again.</p>\r\n                </div>\r\n            </span>\r\n        </span>\r\n        <span class=\"wrappable-flex-item\">\r\n            <span class=\"flex-container\">\r\n                <span class=\"menu-container\">\r\n                    <a class=\"clickable\"\r\n                       ng-click=\"toggleSlide(!showIndicatorControl,\'indicator-control\'); showIndicatorControl = !showIndicatorControl\">\r\n                        <i class=\"fa fa-plus\"></i>&nbsp;Macro Indicator &amp; Market Index\r\n                    </a>\r\n                    <div class=\"indicator-control floating-form\" style=\"display: none; left: -100%\">\r\n                        <label>\r\n                            Search&nbsp;\r\n                            <input type=\"text\" placeholder=\"ex: S&P 500, Financial CDS ...\" class=\"form-control\"\r\n                                   style=\"width: 26em;\"/>\r\n                            <!-- TODO implement searching for macro indicators etc through callback -->\r\n                        </label>\r\n                    </div>\r\n                </span>\r\n                <span> &nbsp; </span>\r\n                <span class=\"menu-container\">\r\n                    <a class=\"clickable\"\r\n                       ng-click=\"toggleSlide(!showBenchmarkControl, \'benchmark-control\'); showBenchmarkControl = !showBenchmarkControl\">\r\n                        <i class=\"fa fa-plus\"></i>&nbsp;Custom Benchmark\r\n                    </a>\r\n                    <div class=\"benchmark-control floating-form\" style=\"display: none; left: -100%;\">\r\n                        <!-- TODO implement constructing custom benchmark time series -->\r\n                        <label>\r\n                            Sector&nbsp;\r\n                            <input type=\"text\" class=\"form-control\"/>\r\n                        </label>\r\n                        <label>\r\n                            Rating&nbsp;\r\n                            <input type=\"text\" class=\"form-control\"/>\r\n                        </label>\r\n                        <label>\r\n                            WAL&nbsp;\r\n                            <input type=\"text\" class=\"form-control\"/>\r\n                        </label>\r\n                        <label>\r\n                            Analytic&nbsp;\r\n                            <input type=\"text\" class=\"form-control\"/>\r\n                        </label>\r\n                        <button class=\"btn btn-success\"><i class=\"fa fa-play\"></i></button>\r\n                    </div>\r\n                </span>\r\n            </span>\r\n        </span>\r\n    </div>\r\n    <div class=\"security-control floating-form\" style=\"display: none;\">\r\n        <div ng-show=\"states.securityAttrMap.length === 0\">\r\n            <h5>No Security Selected</h5>\r\n        </div>\r\n        <div class=\"flex-container\">\r\n            <div class=\"wrappable-flex-item\" ng-repeat=\"securityAttrPair in states.securityAttrMap\">\r\n                <!-- selected attributes display -->\r\n                    <span class=\"label label-success\">{{securityAttrPair[0].label}} | <i class=\"fa fa-remove clickable\"\r\n                                                                                         ng-click=\"apiHandle.api.removeSecurity(securityAttrPair[0].id)\"></i></span>\r\n                    <span class=\"label label-primary\" ng-repeat=\"attr in securityAttrPair[1]\">\r\n                            {{attr.label}} | <i class=\"fa fa-remove clickable\"\r\n                                                ng-click=\"removeAttr(attr, securityAttrPair)\"></i>\r\n                    </span>\r\n                <!-- input to select more attributes-->\r\n                &nbsp;\r\n                <input type=\"text\"\r\n                       placeholder=\"+ Attribute\"\r\n                       ng-disabled=\"securityAttrPair[1].length >= 2\"\r\n                       ng-model=\"selected\"\r\n                       typeahead=\"attr.label for attr in availableSecurityAttributes | filter:$viewValue | limitTo:8\"\r\n                       class=\"form-control\"\r\n                       style=\"width: 8em; display: inline;\"\r\n                       typeahead-on-select=\"addAttr($item, securityAttrPair); selected = \'\'\">\r\n\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <hr/>\r\n    <div ng-attr-id=\"{{\'enriched-highstock-\'+id}}\" class=\"row\">\r\n        <!-- this is where the stock chart goes -->\r\n    </div>\r\n</div>\r\n");}]);