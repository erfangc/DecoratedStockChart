(function () {

    if (typeof String.prototype.endsWith !== 'function') {
        String.prototype.endsWith = function(suffix) {
            return this.indexOf(suffix, this.length - suffix.length) !== -1;
        };
    }

    const $script = $("script[src]");
    const src = $script[$script.length - 1].src;
    const scriptFolder = src.substr(0, src.lastIndexOf("/") + 1);

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
                     * a expression that returns a promise, resolves to an array
                     * of market index metadata objects. for example { label: XXX, tag: xxx }
                     */
                    marketIndexTypeahead: "&",
                    /**
                     * a expression that must return a promise that resolves to a Highchart.Series object
                     * or returns a Highchart.Series object directly
                     */
                    onMarketIndexSelect: "&",
                    /**
                     * a object that contains a array typed property for each of the dimension that
                     * a custom benchmark can be constructed on i.e. [sector, wal, rating, analytic]
                     * ex: {sectors: ['Sector A', 'Sector B', ...}, wal: [1,3,5,7], ... }
                     */
                    customBenchmarkOptions: "=",
                    /**
                     * a expression that must return a promise that resolves to a Highchart.Series object
                     * or returns a Highchart.Series object and must accept an argument 'customBenchmark',
                     * 'options'
                     */
                    onCustomBenchmarkSelect: "&",
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
                    scope.alerts = {
                        customBenchmark: {active: false, message: ""}
                    };
                    scope.states = {
                        /**
                         * (this is obviously not a map ... using array so they can be in order and can be more intuitively
                         * used in ng-repeat. but the structure of crappily named variable is as following:
                         * securityAttrMap has form [[{id: <securityId>, ... },[{tag: <tag>, label: <label>}, ... ]],...]
                         * a map of which security has which attribute enabled
                         */
                        securityAttrMap: [],
                        /**
                         * to hold the Highstock object
                         */
                        chart: null,
                        /**
                         * Object of passed in user date representaitons (string or number) transformed to Date objects
                         * @type {{start: Date, end: Date}}
                         */
                        dateRange: {
                            start: scope.startDate && scope.endDate ?
                                moment(scope.startDate == parseInt(scope.startDate) ? parseInt(scope.startDate) : scope.startDate).toDate() : null,
                            end: scope.startDate && scope.endDate ?
                                moment(scope.endDate == parseInt(scope.endDate) ? parseInt(scope.endDate) : scope.endDate).toDate() : null
                        },
                        marketIndices: [],
                        customBenchmarks: []
                    };

                    // disable default right-click triggered context menu
                    elem.bind('contextmenu', function () {
                        return false;
                    });

                    scope.addMarketIndicator = function ($item) {
                        const result = scope.onMarketIndexSelect({
                            attr: $item,
                            options: {dateRange: scope.states.dateRange}
                        });

                        function processSeries(series) {
                            series.id = $item.tag;
                            // Update the data it if it already exists
                            if (scope.states.chart.get(series.id))
                                scope.states.chart.get(series.id).setData(series.data);
                            else
                                scope.addSeries(series);
                            scope.isProcessing = false;
                            scope.states.marketIndices.push($item);
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

                    scope.addCustomBenchmark = function (customBenchmark) {

                        const error = validate(customBenchmark);
                        if (error) {
                            scope.alerts.customBenchmark.active = true;
                            scope.alerts.customBenchmark.message = error;
                            return;
                        }

                        const result = scope.onCustomBenchmarkSelect({
                            customBenchmark: customBenchmark,
                            options: {dateRange: scope.states.dateRange}
                        });

                        function validate(customBenchmark) {
                            if (!customBenchmark.sector || !customBenchmark.wal || !customBenchmark.rating || !customBenchmark.analytic)
                                return "Must Enter Every Field";
                            return null;
                        }

                        function processSeries(series) {
                            series.id = ['CustomBenchmark',
                                customBenchmark.sector,
                                customBenchmark.rating,
                                customBenchmark.wal,
                                customBenchmark.analytic.tag].join(".");

                            // Update the data it if it already exists
                            if (scope.states.chart.get(series.id))
                                scope.states.chart.get(series.id).setData(series.data);
                            else
                                scope.addSeries(series);
                            scope.isProcessing = false;
                            scope.states.customBenchmarks.push(customBenchmark);
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
                         * @returns boolean if there was an error
                         */
                        changeDateRange: function (start, end) {
                            // Validate date
                            if (!start || !end || start >= end)
                                return true;
                            scope.states.dateRange.start = start;
                            scope.states.dateRange.end = end;
                            // Update all security attributes
                            _.each(scope.states.securityAttrMap, function (pair) {
                                _.each(pair[1], function (attribute) {
                                    scope.addAttr(attribute, [pair[0], []]);
                                });
                            });
                            // Update all market indicators
                            _.each(scope.states.marketIndices, scope.addMarketIndicator);
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
                        tooltip: {
                            formatter: function () {
                                const tooltips = _.map(this.points, function (point) {
                                    return "<div style='display: flex; justify-content: space-between'><span><b>" + point.series.name + ":</b></span><span>&nbsp;" + point.y.toFixed(3) + "</span></div>"
                                }).join("");
                                return "<div>" +
                                    "<div>" + moment(this.x).format("ddd, MMM DD YYYY") + "</div>" +
                                    tooltips +
                                    "</div>";
                            },
                            useHTML: true,
                            shared: true
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
                                id: series.options.id + ".basisVs." + otherSeries.options.id,
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
                        const result = scope.onAttributeSelect({
                            attr: $item,
                            security: securityAttrPair[0],
                            options: {dateRange: scope.states.dateRange}
                        });

                        function processSeries(series) {
                            series.securityId = securityAttrPair[0].id;
                            series.id = dsc.generateSeriesID(securityAttrPair[0], $item);
                            series.onRemove = function () {
                                scope.removeAttr($item, securityAttrPair);
                            };
                            // Update the data it if it already exists
                            if (scope.states.chart.get(series.id))
                                scope.states.chart.get(series.id).setData(series.data);
                            else
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

                        // add series click event listener .. this is different from legendItem click event listener
                        seriesOption.events = {
                            click: function (event) {
                                event.preventDefault();
                                event.stopPropagation();
                                return dsc.triggerSeriesContextMenu(event, {
                                    series: this,
                                    scope: scope
                                });
                            }
                        };
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

                    /**
                     * turn each series's data into a HTML table
                     * and then export this table to Excel
                     */
                    scope.exportXLS = function () {
                        window.open('data:application/vnd.ms-excel,' + encodeURIComponent(dsc.seriesToHTML(scope.states.chart.series)));
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
                templateUrl: scriptFolder.endsWith("src/") ? scriptFolder + "/templates/DecoratedStockChart.html" : "DecoratedStockChart.html"
            };
        });
}());

(function () {
    const root = this; // this == window
    const dsc = root.dsc || {};
    root.dsc = dsc;
    /**
     * takes an array of Highcharts.Series and serialize them into HTML text wrapped in a table
     * @param series
     * @return {string}
     */
    dsc.seriesToHTML = function (series) {
        // construct header row
        const headers = "<tr>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>Date</th>" +
            _.map(series, function (s) {
                return "<th style='background-color: #0069d6; color: #ffffff;'>" + s.name + "</th>";
            }).join("") + "</tr>";
        // construct a union of all X values
        const domain = _.chain(series).map(function (s) {
            return _.map(s.data, function (datum) {
                return datum.x;
            });
        }).flatten().uniq().value();
        // construct an array lookup map for each series, mapping from x->y
        const matrix = _.map(series, function (s) {
            return _.chain(s.data).map(function (datum) {
                return [datum.x, datum.y];
            }).object().value();
        });
        // turn the lookup map into HTML
        const body = _.map(domain, function (x) {
            return "<tr>" +
                "<td style='background-color: #999999'>" + moment(x).format("YYYY-MM-DD") + "</td>" +
                _.map(matrix, function (col) {
                    return "<td>" + col[x] || 0 + "</td>";
                }).join("")
                + "</tr>";
        }).join("\n");

        return "<table>" +
            headers +
            body +
            "</table>";
    }
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

        dsc.showCtxMenu($ctxMenu, event);
        // focus on the edit axis title input
        $ctxMenu.find("input.form-control").select();
    };

    /**
     * show the given context menu by figuring out the proper position
     * so that it does not appear off-screen
     * @param $ctxMenu
     * @param event
     */
    root.dsc.showCtxMenu = function ($ctxMenu, event) {
        $ctxMenu.show();
        const $rootDiv = $('div.root');

        const ctnRight = $rootDiv.position().left + $rootDiv.width();
        const menuRight = event.clientX + $ctxMenu.children().width();

        const ctnBtm = $rootDiv.position().top + $rootDiv.height();
        const menuBtm = event.clientY + $ctxMenu.children().height();

        var left = event.clientX;
        if (menuRight > ctnRight)
            left = event.clientX - $ctxMenu.children().width();

        var top = event.clientY;
        if (menuBtm > ctnBtm)
            top = event.clientY - $ctxMenu.children().height();

        $ctxMenu.css({
            top: top + "px",
            left: left + "px"
        });
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
            "<div style='z-index: 10; position: fixed;'>" +
            "<ul class='clickable dropdown-menu multi-level' style='display: block;'></ul>" +
            "</div>"
        ).hide();
        $ctxMenu.prependTo(elem.children(".root"));
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
        dsc.showCtxMenu($ctxMenu, event);
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
            : [changeAxis(), addMA(), basis(), changeType(), removeSeries()];
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
angular.module("decorated-stock-chart").run(["$templateCache", function($templateCache) {$templateCache.put("DecoratedStockChart.html","<div class=\"root\" style=\"position: relative\">\n    <i ng-show=\"isProcessing\" class=\"fa fa-spinner fa-spin fa-3x spinner\"></i>\n\n    <div class=\"control flex-container\"\n         ng-init=\"showSecurityControl = false; showIndicatorControl = false; showBenchmarkControl = false;\">\n        <!-- security & attributes selection -->\n        <span>\n                <input type=\"text\" ng-model=\"defaultSecurityAttribute\" class=\"form-control\"\n                       style=\"width: 8em; display: inline;\"\n                       typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue | limitTo:8\"/>\n            <a><i ng-click=\"toggleSlide(!showSecurityControl, \'security-control\'); showSecurityControl = !showSecurityControl\"\n                  class=\"fa clickable\"\n                  ng-class=\"{\'fa-chevron-up\': showSecurityControl, \'fa-chevron-down\': !showSecurityControl}\"></i></a>\n        </span>\n        <!-- TODO implement these date functionalities -->\n        <span>\n            <a class=\"clickable\">1M</a>\n            &nbsp;\n            <a class=\"clickable\">3M</a>\n            &nbsp;\n            <a class=\"clickable\">6M</a>\n            &nbsp;\n            <a class=\"clickable\">1Y</a>\n            &nbsp;\n            <a class=\"clickable\">2Y</a>\n            &nbsp;\n            <span ng-init=\"showDateControl = false\">\n                <a class=\"clickable\"\n                   ng-click=\"toggleSlide(!showDateControl, \'date-control\');\n                             showDateControl = !showDateControl;\n                             dateChangeError = false;\n                             start = states.dateRange.start;\n                             end = states.dateRange.end\">\n                    <i class=\"fa fa-calendar\"></i>\n                </a>\n                <div class=\"date-control floating-form\" style=\"display: none;\">\n                    <label>From&nbsp;<input type=\"date\" class=\"form-control\"\n                                            style=\"display: inline; width: 12em;\" ng-model=\"start\"/></label>\n                    <label>To&nbsp;<input type=\"date\" class=\"form-control\"\n                                          style=\"display: inline; width: 12em;\" ng-model=\"end\"/></label>\n                    <button class=\"btn btn-success\"\n                            ng-click=\"dateChangeError = apiHandle.api.changeDateRange(start, end)\">\n                        <i class=\"fa fa-play\"></i>\n                    </button>\n                </div>\n            </span>\n        </span>\n        <span>\n            <span class=\"flex-container\">\n                <span class=\"menu-container\">\n                    <a class=\"clickable\"\n                       ng-click=\"toggleSlide(!showIndicatorControl,\'indicator-control\'); showIndicatorControl = !showIndicatorControl\">\n                        <i class=\"fa fa-plus\"></i>&nbsp;Macro Indicator &amp; Market Index\n                    </a>\n                    <div class=\"indicator-control floating-form\" style=\"display: none;\">\n                        <label>\n                            Search&nbsp;\n                            <input type=\"text\" placeholder=\"ex: S&P 500, Financial CDS ...\" class=\"form-control\"\n                                   style=\"width: 26em;\"\n                                   ng-model=\"selected\"\n                                   typeahead=\"attr.label for attr in marketIndexTypeahead({userInput: $viewValue}) | limitTo:8\"\n                                   typeahead-on-select=\"addMarketIndicator($item); selected = \'\'\"/>\n                        </label>\n                    </div>\n                </span>\n                <span> &nbsp; </span>\n                <span class=\"menu-container\">\n                    <a class=\"clickable\"\n                       ng-click=\"toggleSlide(!showBenchmarkControl, \'benchmark-control\'); showBenchmarkControl = !showBenchmarkControl\">\n                        <i class=\"fa fa-plus\"></i>&nbsp;Custom Benchmark\n                    </a>\n                    <div class=\"benchmark-control floating-form\" style=\"display: none;\"\n                         ng-init=\"customBenchmark = {sector: \'Corporates\', wal: \'All\', rating: \'All\', analytic: {tag: \'oas\', label:\'OAS\' }}\">\n                        <alert ng-show=\"alerts.customBenchmark.active\" close=\"alerts.customBenchmark.active = false\" type=\"danger\">{{alerts.customBenchmark.message}}</alert>\n                        <label>\n                            Sector&nbsp;\n                            <input type=\"text\" class=\"form-control\" style=\"width: initial;\"\n                                   ng-model=\"customBenchmark.sector\"\n                                   typeahead-editable=\"false\"\n                                   typeahead=\"sector for sector in customBenchmarkOptions.sectors | filter:$viewValue | limitTo:8\"/>\n                        </label>\n                        <label>\n                            Rating&nbsp;\n                            <input type=\"text\" class=\"form-control\" style=\"width: initial;\"\n                                   ng-model=\"customBenchmark.rating\"\n                                   typeahead-editable=\"false\"\n                                   typeahead=\"rating for rating in customBenchmarkOptions.ratings | filter:$viewValue | limitTo:8\"/>\n                        </label>\n                        <label>\n                            WAL&nbsp;\n                            <input type=\"text\" class=\"form-control\" style=\"width: initial;\"\n                                   ng-model=\"customBenchmark.wal\"\n                                   typeahead-editable=\"false\"\n                                   typeahead=\"wal for wal in customBenchmarkOptions.wal | filter:$viewValue | limitTo:8\"/>\n                        </label>\n                        <label>\n                            Analytic&nbsp;\n                            <input type=\"text\" class=\"form-control\" style=\"width: initial;\"\n                                   ng-model=\"customBenchmark.analytic\"\n                                   typeahead-editable=\"false\"\n                                   typeahead=\"attr.label for attr in customBenchmarkOptions.analytics | filter:$viewValue | limitTo:8\"/>\n                        </label>\n                        <button class=\"btn btn-success\" ng-click=\"addCustomBenchmark(customBenchmark)\"><i\n                                class=\"fa fa-play\"></i></button>\n                    </div>\n                </span>\n            </span>\n        </span>\n        <span><a class=\"clickable\" ng-click=\"exportXLS()\"><i class=\"fa fa-share-square-o\"></i></a></span>\n    </div>\n    <div class=\"security-control floating-form\" style=\"display: none;\">\n        <div ng-show=\"states.securityAttrMap.length === 0\">\n            <h5>No Security Selected</h5>\n        </div>\n        <div class=\"flex-container\">\n            <div class=\"wrappable-flex-item\" ng-repeat=\"securityAttrPair in states.securityAttrMap\">\n                <!-- selected attributes display -->\n                    <span class=\"label label-success\">{{securityAttrPair[0].label}} | <i class=\"fa fa-remove clickable\"\n                                                                                         ng-click=\"apiHandle.api.removeSecurity(securityAttrPair[0].id)\"></i></span>\n                    <span class=\"label label-primary\" ng-repeat=\"attr in securityAttrPair[1]\">\n                            {{attr.label}} | <i class=\"fa fa-remove clickable\"\n                                                ng-click=\"removeAttr(attr, securityAttrPair)\"></i>\n                    </span>\n                <!-- input to select more attributes-->\n                &nbsp;\n                <input type=\"text\"\n                       placeholder=\"+ Attribute\"\n                       ng-disabled=\"securityAttrPair[1].length >= 2\"\n                       ng-model=\"selected\"\n                       typeahead=\"attr.label for attr in availableSecurityAttributes | filter:$viewValue | limitTo:8\"\n                       class=\"form-control\"\n                       style=\"width: 8em; display: inline;\"\n                       typeahead-on-select=\"addAttr($item, securityAttrPair); selected = \'\'\">\n\n            </div>\n        </div>\n    </div>\n    <hr/>\n    <div ng-attr-id=\"{{\'enriched-highstock-\'+id}}\" class=\"row\">\n        <!-- this is where the stock chart goes -->\n    </div>\n</div>\n");}]);