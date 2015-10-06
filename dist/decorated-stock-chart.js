(function () {

    if (typeof String.prototype.endsWith !== 'function') {
        String.prototype.endsWith = function (suffix) {
            return this.indexOf(suffix, this.length - suffix.length) !== -1;
        };
    }

    Date.prototype.getYYYYMMDD = function () {
        var month = this.getMonth() + 1;
        month = month.toString().length == 1 ? "0" + month : month;
        var day = this.getDate();
        day = day.toString().length == 1 ? "0" + day : day;
        return this.getFullYear() + "-" + month + "-" + day;
    };

    const $script = $("script[src]");
    const src = $script[$script.length - 1].src;
    const scriptFolder = src.substr(0, src.lastIndexOf("/") + 1);
    angular.module("decorated-stock-chart", ['ui.bootstrap', 'typeahead-focus']);
    angular.module("decorated-stock-chart")
        .directive("decoratedStockChart", function ($timeout) {
            return {
                restrict: "E",
                scope: {
                    securities: "=",
                    startDate: "@?",
                    endDate: "@?",
                    /**
                     * This is an optional array of objects which can be passed in to define custom button icons and
                     * callbacks which will appear at the top right of the panel
                     */
                    customButtons: "=?",
                    /**
                     * User can optionally pass in in default time periods displayed in panel at top of chart.
                     * This is an array of strings where the strings represent time periods e.g. 3M,2Y,10M
                     */
                    customDefaultTimePeriods: "=?",
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
                    showMoreMarketInfo: "=?",
                    /**
                     * A callback to bring up additional market options if passed in
                     */
                    moreMarketInfoCallback: '&',
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
                link: function (scope, elem, attrs) {
                    scope.id = _.uniqueId();
                    scope.alerts = {
                        customBenchmark: {active: false, messages: []},
                        generalWarning: {active: false, message: ""},
                        dateChangeError: {active: false, message: ""}
                    };
                    scope.customDefaultTimePeriods = scope.customDefaultTimePeriods || ["1M", "3M", "6M", "1Y", "2Y"];
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
                        customBenchmarks: [],
                        menuDisplays: {
                            securityControl: false,
                            benchmarkControl: false,
                            indicatorControl: false,
                            dateControl: false
                        }
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
                                const yAxis = series.yAxis;
                                series.remove();
                                dsc.afterSeriesRemove(yAxis, id, scope);
                            });

                            // fire callback if provided
                            if (_.isFunction(scope.onSecurityRemove))
                                scope.onSecurityRemove({id: id});
                        },
                        addMarketIndicator: function ($item) {
                            scope.isProcessing = true;
                            scope.toggleSlide(false, 'indicator-control');

                            const result = scope.onMarketIndexSelect({
                                attr: $item,
                                options: {dateRange: scope.states.dateRange}
                            });

                            function processSeries(series) {
                                series.id = $item.tag;

                                /**
                                 * instruction on how to properly remove the series
                                 */
                                series.onRemove = function () {
                                    scope.states.marketIndices.splice(scope.states.marketIndices.indexOf($item), 1);
                                    dsc.removeSeriesById(series.id, scope);
                                };

                                // Update the data it if it already exists
                                if (scope.states.chart.get(series.id))
                                    scope.states.chart.get(series.id).setData(series.data);
                                else
                                    scope.addSeries(series);

                                scope.isProcessing = false;

                                if (scope.states.marketIndices.indexOf($item) === -1)
                                    scope.states.marketIndices.push($item);
                            }

                            if (result && angular.isFunction(result.then))
                                result.then(function (series) {
                                    processSeries(series.status ? series.data : series);
                                }, function () {
                                    scope.isProcessing = false;
                                });
                            else
                                processSeries(result);
                        },
                        addCustomBenchmark: function (customBenchmark) {
                            scope.alerts.customBenchmark.messages = [];

                            const result = scope.onCustomBenchmarkSelect({
                                customBenchmark: customBenchmark,
                                options: {dateRange: scope.states.dateRange}
                            });

                            function validate(customBenchmark, result) {
                                if (!customBenchmark.sector || !customBenchmark.wal || !customBenchmark.rating || !customBenchmark.analytic)
                                    scope.alerts.customBenchmark.messages = ["Some fields are missing!"];
                                else if (result.errors)
                                    scope.alerts.customBenchmark.messages = result.errors;
                            }

                            function processSeries(series) {
                                series.id = ['CustomBenchmark',
                                    customBenchmark.sector,
                                    customBenchmark.rating,
                                    customBenchmark.wal,
                                    customBenchmark.analytic.tag].join(".");


                                /**
                                 * instruction on how to properly remove the series
                                 */
                                series.onRemove = function () {
                                    scope.states.customBenchmarks.splice(scope.states.customBenchmarks.indexOf(customBenchmark), 1);
                                    dsc.removeSeriesById(series.id, scope);
                                };

                                // Update the data it if it already exists
                                if (scope.states.chart.get(series.id))
                                    scope.states.chart.get(series.id).setData(series.data);
                                else
                                    scope.addSeries(series);
                                scope.isProcessing = false;
                                if (scope.states.customBenchmarks.indexOf(customBenchmark) === -1)
                                    scope.states.customBenchmarks.push(customBenchmark);
                            }

                            validate(customBenchmark, result);

                            if (scope.alerts.customBenchmark.messages.length > 0) {
                                scope.alerts.customBenchmark.active = true;
                                return false;
                            }
                            else {
                                scope.alerts.customBenchmark.active = false;
                                scope.toggleSlide(false, 'benchmark-control')
                            }

                            scope.isProcessing = true;
                            if (result && angular.isFunction(result.then))
                                result.then(function (series) {
                                    processSeries(series.status ? series.data : series);
                                }, function () {
                                    scope.isProcessing = false;
                                });
                            else
                                processSeries(result);

                            return true;
                        },
                        /**
                         * Change the x axis range of the chart given string representations of start and end
                         * @param start
                         * @param end
                         *
                         * @returns Error message if there is one
                         */
                        changeDateRange: function (start, end) {
                            start = new Date(start);
                            end = new Date(end);
                            // Validate date
                            scope.alerts.dateChangeError = {active: false, message: ""};
                            if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
                                scope.alerts.dateChangeError.active = true;
                                if (!start || isNaN(start.getTime()))
                                    return "Invalid start date";
                                else if (!end || isNaN(end.getTime()))
                                    return "Invalid end date";
                                else if (start >= end)
                                    return "Start date later than end date";
                            }
                            scope.states.dateRange.start = start;
                            scope.states.dateRange.end = end;
                            // Update all security attributes
                            _.each(scope.states.securityAttrMap, function (pair) {
                                _.each(pair[1], function (attribute) {
                                    scope.addAttr(attribute, [pair[0], []]);
                                });
                            });
                            // Update all market indicators
                            _.each(scope.states.marketIndices, scope.apiHandle.api.addMarketIndicator);
                            // Update all benchmarks
                            _.each(scope.states.customBenchmarks, scope.apiHandle.api.addCustomBenchmark);
                            if (scope.states.menuDisplays.dateControl)
                                scope.toggleSlide(!scope.states.menuDisplays.dateControl, 'date-control');
                            scope.states.menuDisplays.dateControl = false;
                        }
                    };

                    // default highstock options
                    const highstockOptions = _.extend({
                        chart: {
                            renderTo: "enriched-highstock-" + scope.id,
                            type: "spline",
                            marginTop: 30,
                            zoomType: 'x',
                            resetZoomButton: {
                                theme: {
                                    display: 'none'
                                }
                            }
                        },
                        title: {
                            text: scope.title || "Untitled",
                            events: {
                                click: function (e) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    dsc.onTitleClick(e, scope, this);
                                }
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
                            type: "datetime",
                            events: {
                                // If we zoom in on the chart, change the date range to those dates
                                afterSetExtremes: function (event) {
                                    if (this.getExtremes().dataMin < event.min || this.getExtremes().dataMax > event.max) {
                                        scope.apiHandle.api.changeDateRange(event.min, event.max);
                                        this.chart.zoomOut();
                                    }
                                }
                            }
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
                            axisType: scope.defaultSecurityAttribute.label,
                            id: _.uniqueId("yAxis")
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
                                axisType: origSeries.options.axisType,
                                data: xy,
                                securityId: origSeries.options.securityId || null
                            };
                        },
                        toBasis: function (origSeries, otherSeries) {
                            /**
                             * we only take basis where 'otherSeries' has data, there is no lookback
                             */
                            const otherData = _.chain(otherSeries.data).map(function (datum) {
                                return [moment(datum.x).format("YYYYMMDD"), datum.y];
                            }).object().value();
                            const data = _.chain(origSeries.data).filter(function (datum) {
                                return otherData[moment(datum.x).format("YYYYMMDD")];
                            }).map(function (datum) {
                                return [datum.x, datum.y - otherData[moment(datum.x).format("YYYYMMDD")]];
                            }).value();
                            return {
                                id: origSeries.options.id + ".basisVs." + otherSeries.options.id,
                                name: "Basis of " + origSeries.name + " - " + otherSeries.name,
                                axisType: origSeries.options.axisType,
                                securityId: origSeries.options.securityId || null,
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
                        // Check to see if this already exists
                        const duplicateFound = _.filter(securityAttrPair[1], function (item) {
                                return angular.equals(item, $item);
                            }).length > 0;
                        if (duplicateFound)
                            return;

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
                            series.axisType = $item.label;
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
                                processSeries(series.status ? series.data : series);
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

                        /**
                         * remove attr from chart
                         */
                        const series = scope.states.chart.get(dsc.generateSeriesID(securityAttrPair[0], attr));

                        /**
                         * remove the series associated with the given attr if found
                         */
                        if (series) {
                            const yAxis = series.yAxis;
                            const securityId = series.options.securityId;
                            series.remove();
                            dsc.afterSeriesRemove(yAxis, securityId, scope);
                        }

                        /**
                         * remove attr from state
                         */
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

                        /**
                         * determine if the series has no data, if so put out a warning
                         */
                        if (!seriesOption.data || seriesOption.data.length == 0) {
                            scope.alerts.generalWarning.active = true;
                            scope.alerts.generalWarning.message = "Added series contains no data!";
                            return;
                        }
                        else
                            scope.alerts.generalWarning.active = false;

                        /**
                         * add series click event listener .. this is different from legendItem click event listener
                         */
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

                        /**
                         * select the best axis to add the new series into
                         */
                        const preferredYAxis = (seriesOption.yAxis == undefined || seriesOption.yAxis == null) ? dsc.resolvePreferredYAxis(chart, seriesOption) : seriesOption.yAxis;
                        if (preferredYAxis === -1) {
                            /**
                             * add a new axis if we cannot find a preferred series
                             */
                            dsc.addAxisToChart(chart, seriesOption.axisType || seriesOption.name, scope, seriesOption.axisType, seriesOption.subType);
                            seriesOption.yAxis = chart.yAxis.length - 1;
                        }
                        else
                            seriesOption.yAxis = preferredYAxis;

                        chart.addSeries(seriesOption);
                        dsc.attachLegendEventHandlers(chart.get(seriesOption.id), scope);
                    };

                    /**
                     * handles removing a given series from the chart
                     * but also performs state syncs
                     *
                     * @param series a Highcharts.Series object (not a series option object literal)
                     */
                    scope.removeSeries = function (series) {

                        const yAxis = series.yAxis;
                        const securityId = series.userOptions.securityId;

                        if (angular.isFunction(series.options.onRemove))
                            series.options.onRemove();
                        else
                            series.remove();
                        dsc.afterSeriesRemove(yAxis, securityId, scope);
                    };

                    scope.toggleSlide = function (show, className) {
                        const camelCaseName = attrs.$normalize(className);
                        scope.states.menuDisplays[camelCaseName] = show;
                        var $ctrl = elem.find("." + className);
                        if (show) {
                            $ctrl.slideDown(500);
                            $ctrl.find("input").first().select();
                        }
                        else
                            $ctrl.slideUp(500);
                        // Since we are using some jQuery, after the end of $timeout a $apply is fired implicitly
                        $timeout(function () {
                        });
                    };

                    /**
                     * turn each series's data into a HTML table
                     * and then export this table to Excel
                     */
                    scope.exportXLS = function () {
                        var html = dsc.seriesToHTML(scope.states.chart.series);
                        if (window.navigator.msSaveBlob)
                            window.navigator.msSaveBlob(new Blob([html]), "time-series-export.xls");
                        else
                            window.open('data:application/vnd.ms-excel,' + encodeURIComponent(html));
                    };

                    /**
                     * Function to call changeDateRange given a string representation of time period (e.g. 3M or 1Y)
                     * @param period as a String
                     */

                    scope.selectTimePeriod = function (period) {
                        if (period.length != 2)
                            return;

                        const start = moment().subtract(parseInt(period),
                            period[period.length - 1].toUpperCase() === "M" ? "month" : "year").toDate();
                        const end = moment().toDate();
                        scope.apiHandle.api.changeDateRange(start, end);
                    };

                    /**
                     * Sort function to sort wal buckets in the benchmark dropdown
                     */
                    scope.sortWalBuckets = function (wal) {
                        return parseInt(wal) || 0;
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

                    // This is to remove any unexpected propagation from dropdowns
                    elem.find(".floating-form").click(function (e) {
                        e.stopPropagation();
                    });
                },
                templateUrl: scriptFolder.endsWith("src/") ? scriptFolder + "/templates/DecoratedStockChart.html" : "DecoratedStockChart.html"
            };
        })
        .directive("dscClickOutside", function () {
            return {
                restrict: "A",
                scope: {
                    openState: '=dscOpenState',
                    closeCallback: '&dscCloseCallback'
                },
                link: function (scope, element) {
                    /*
                     * We use a state variable for clicking outside the element because if we use stopPropagation()
                     * we possibly stop other legitimate events from triggering.
                     */
                    var clickedOutside = true;

                    const documentClickHandler = function () {
                        if (clickedOutside && scope.openState)
                            scope.closeCallback();
                        clickedOutside = true;
                    };
                    $(document).click(documentClickHandler);

                    const elementClickHandler = function () {
                        clickedOutside = false;
                    };
                    element.click(elementClickHandler);

                    // Unbind click listeners when element is removed
                    scope.$on('$destroy', function () {
                        $(document).unbind("click", documentClickHandler);
                        element.unbind("click", elementClickHandler);
                    });
                }
            }
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
                    return "<td>" + (col[x] && col[x] !== undefined && col[x] !== 'undefined' ? col[x] : 0) + "</td>";
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
     * choose the correct yAxis to add a new series into
     * if no preferred axis is found return -1
     * @param chart
     * @param seriesOption
     */
    root.dsc.resolvePreferredYAxis = function (chart, seriesOption) {
        if (!seriesOption.axisType)
            return chart.yAxis.length === 0 ? -1 : 0;
        return _.findIndex(chart.yAxis, function (axis) {
            return axis.userOptions.axisType === seriesOption.axisType;
        });
    };

    /**
     * Add a new axis to the given chart. wires up event handler and such.
     * axis are also labeled with axisType, which enables intelligent axis
     * selection when new series is being added
     *
     * @param chart a Highchart object
     * @param name the name of the axis
     * @param scope the scope object (we need this for the axis click event handler)
     * @param axisType a member of the axisType enum
     * @return {string}
     */
    root.dsc.addAxisToChart = function (chart, name, scope, axisType) {
        const axisId = _.uniqueId("yAxis");
        chart.addAxis({
            title: {
                text: name,
                events: {
                    click: function (event) {
                        dsc.onAxisClick.call(this, event, scope);
                    }
                }
            },
            axisType: axisType,
            opposite: chart.axes.length % 2 == 0,
            id: axisId
        });
        return chart.get(axisId);
    };

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
                    /**
                     * remove any series that is on the axis
                     */
                    while (axis.series && axis.series.length !== 0)
                        scope.removeSeries(axis.series[0]);
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
            //$menuItem.css({"min-width": $input.val().length + "em"});
            return $menuItem;
        }

        $ctxMenu.children(".dropdown-menu")
            .append(editAxisTitle())
            .append(removeAxis());

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
            left = Math.max(event.clientX - $ctxMenu.children().width(), 0);

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
     * @param targetAxis
     * @param scope
     */
    root.dsc.moveAxis = function (series, targetAxis, scope) {
        const origAxis = series.yAxis;
        const seriesOptions = series.options;
        // figure out the position
        seriesOptions.yAxis = _.findIndex(scope.states.chart.yAxis, function (x) {
            return x.userOptions.id == targetAxis.userOptions.id;
        });
        seriesOptions.color = series.color;
        series.remove();
        scope.addSeries(seriesOptions);
        if (dsc.isAxisEmpty(origAxis))
            origAxis.remove();

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
     */
    root.dsc.onTitleClick = function (clickEvent, scope, chart) {

        const $input = $("<input class='form-control' style='position:relative; left: 5%; width: 90%;'/>");
        const $menuItem = $("<li><span></span></li>");
        $menuItem.on('click', dsc.inertClickHandler).children("span").append($input);

        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        $ctxMenu.children(".dropdown-menu").append($menuItem);

        $input
            .on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") { // ENTER
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    chart.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                } else if (keyEvent.keyCode == 27) // ESCAPE
                    $ctxMenu.hide();
            })
            .val(chart.options.title.text);

        const titleLength = Math.min($input.val().length, 20);
        $menuItem.css({"min-width": titleLength + "em"});

        dsc.showCtxMenu($ctxMenu, clickEvent);
        $input.select();
    };
    /**
     * test if the given series is the only one left on the given yAxis
     * @param yAxis
     */
    root.dsc.isAxisEmpty = function (yAxis) {
        return yAxis && yAxis.series.length === 0;
    };

    root.dsc.afterSeriesRemove = function (yAxis, securityId, scope) {

        function hasNoSeries(securityId) {
            const chart = scope.states.chart;
            return _.filter(chart.series, function (series) {
                    return series.userOptions.securityId
                        && series.userOptions.securityId === securityId;
                }).length === 0;
        }

        // figure out if this is the last series on its given axis, if so remove the axis
        if (dsc.isAxisEmpty(yAxis))
            yAxis.remove();
        // figure out if this is the last series for the given security, if so remove the security
        if (securityId && hasNoSeries(securityId))
            scope.apiHandle.api.removeSecurity(securityId);
    };

    root.dsc.removeSeriesById = function (id, scope) {

        const chart = scope.states.chart;
        const series = chart.get(id);
        const yAxis = series.yAxis;
        const securityId = series.options.securityId;

        if (angular.isFunction(series.remove))
            series.remove();

        dsc.afterSeriesRemove(yAxis, securityId, scope);
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
        $(window).click(function () {
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
        _.each(chart.yAxis, function (axis) {
            var $menuItem;
            if (axis.userOptions.id === series.yAxis.userOptions.id)
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "&nbsp;<i class='fa fa-check'></i></a></li>");
            else
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "</a></li>")
                    .click(function () {
                        dsc.moveAxis(series, axis, scope);
                    });
            $dropdown.append($menuItem);
        });
        $dropdown.append($("<li><a><i class=\"fa fa-plus\"></i> Move To New Axis</a></li>").click(function () {
            const axis = dsc.addAxisToChart(chart, series.name, scope, series.userOptions.axisType);
            dsc.moveAxis(series, axis, scope);
        }));
        return $dropdown;
    };

}());
angular.module("decorated-stock-chart").run(["$templateCache", function($templateCache) {$templateCache.put("DecoratedStockChart.html","<div class=\"root\" style=\"position: relative\">\r\n    <div class=\"control flex-main-container\"\r\n         ng-init=\"showSecurityControl = false; showIndicatorControl = false; showBenchmarkControl = false;\">\r\n        <span class=\"flex-sub-container-left\">\r\n            <!-- security & attributes selection -->\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.securityControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.securityControl, \'security-control\')\">\r\n                <span class=\"restrict-dropdown-menu\">\r\n                    <input type=\"text\" ng-model=\"defaultSecurityAttribute\" class=\"form-control\"\r\n                           style=\"width: 12em; display: inline; height:25px;\"\r\n                           typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                           typeahead-focus\r\n                           typeahead-select-on-blur=\"true\"/>\r\n                </span>\r\n                <a><i ng-click=\"toggleSlide(!states.menuDisplays.securityControl, \'security-control\')\"\r\n                      class=\"fa clickable\"\r\n                      ng-class=\"{\'fa-chevron-up\': states.menuDisplays.securityControl, \'fa-chevron-down\': !states.menuDisplays.securityControl}\"></i></a>\r\n                <div class=\"security-control floating-form\" style=\"display: none;top:35px;left:0;\">\r\n                    <div ng-show=\"states.securityAttrMap.length === 0\">\r\n                        <h5>No Security Selected</h5>\r\n                    </div>\r\n                    <div class=\"flex-container\">\r\n                        <span class=\"wrappable-flex-item\" ng-repeat=\"securityAttrPair in states.securityAttrMap\">\r\n                            <!-- selected attributes display -->\r\n                            <span class=\"label label-success\">{{securityAttrPair[0].label}} | <i class=\"fa fa-remove clickable\"\r\n                                                                                                 ng-click=\"apiHandle.api.removeSecurity(securityAttrPair[0].id)\"></i></span>\r\n                            <span class=\"label label-primary\" ng-repeat=\"attr in securityAttrPair[1]\">\r\n                                    {{attr.label}} | <i class=\"fa fa-remove clickable\"\r\n                                                        ng-click=\"removeAttr(attr, securityAttrPair)\"></i>\r\n                            </span>\r\n                            <!-- input to select more attributes-->\r\n                            &nbsp;\r\n                            <input type=\"text\"\r\n                                   placeholder=\"+ Attribute\"\r\n                                   ng-model=\"selected\"\r\n                                   typeahead=\"attr as attr.label for attr in availableSecurityAttributes | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   class=\"form-control\"\r\n                                   style=\"width: 8em; display: inline;\"\r\n                                   typeahead-on-select=\"addAttr($item, securityAttrPair); selected = \'\'\"\r\n                                   typeahead-focus>\r\n\r\n                        </span>\r\n                    </div>\r\n                </div>\r\n            </span>\r\n            <!-- TODO implement these date functionalities -->\r\n            <span style=\"padding-left:25px;\">\r\n                <span class=\"clickable dsc-padding-right\" ng-repeat=\"period in customDefaultTimePeriods\" ng-click=\"selectTimePeriod(period)\"\r\n                      style=\"padding-right:5px;color:#005da0;\">\r\n                    {{period}}\r\n                </span>\r\n                <span style=\"color:#005da0;overflow: hidden\"\r\n                      dsc-click-outside\r\n                      dsc-open-state=\"states.menuDisplays.dateControl\"\r\n                      dsc-close-callback=\"toggleSlide(!states.menuDisplays.dateControl, \'date-control\')\">\r\n                    <i class=\"fa fa-calendar clickable\" ng-click=\"toggleSlide(!states.menuDisplays.dateControl, \'date-control\');\r\n                             start = states.dateRange.start.getYYYYMMDD();\r\n                             end = states.dateRange.end.getYYYYMMDD()\"></i>\r\n                    <div class=\"date-control floating-form\" style=\"display: none;\">\r\n                        <alert ng-show=\"alerts.dateChangeError.active\" close=\"alerts.dateChangeError.active = false\" type=\"danger\" style=\"font-size: 12px;\">\r\n                            {{alerts.dateChangeError.message}}\r\n                            <br/>\r\n                            Format: YYYY-MM-DD\r\n                        </alert>\r\n                        <label>From&nbsp;</label>\r\n                        <div class=\"input-group limited-input\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   datepicker-popup\r\n                                   is-open=\"startDatePickerOpen\"\r\n                                   ng-model=\"start\"\r\n                                   close-text=\"Close\"/>\r\n                            <span class=\"input-group-btn\">\r\n                                <button type=\"button\" class=\"btn btn-default\" ng-click=\"startDatePickerOpen = !startDatePickerOpen\"><i class=\"fa fa-calendar\"></i></button>\r\n                            </span>\r\n                        </div>\r\n                        <label>To&nbsp;</label>\r\n                        <div class=\"input-group limited-input\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   datepicker-popup\r\n                                   is-open=\"endDatePickerOpen\"\r\n                                   ng-model=\"end\"\r\n                                   close-text=\"Close\"/>\r\n                            <span class=\"input-group-btn\">\r\n                                <button type=\"button\" class=\"btn btn-default\" ng-click=\"endDatePickerOpen = !endDatePickerOpen\"><i class=\"fa fa-calendar\"></i></button>\r\n                            </span>\r\n                        </div>\r\n                        <hr/>\r\n                        <button class=\"btn btn-success\"\r\n                                ng-click=\"alerts.dateChangeError.message = apiHandle.api.changeDateRange(start, end);\r\n                                          alerts.dateChangeError.message ? null : showDateControl = !showDateControl;\">\r\n                            <i class=\"fa fa-play\"></i>\r\n                        </button>\r\n                    </div>\r\n                </span>\r\n            </span>\r\n        </span>\r\n        <span class=\"flex-sub-container-right\">\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.indicatorControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.indicatorControl,\'indicator-control\')\">\r\n                <a class=\"clickable\" style=\"text-decoration:none\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.indicatorControl,\'indicator-control\');selected=\'\';\">\r\n                    <span class=\"fake-anchor-tag\">Market Indicators</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.indicatorControl, \'fa-chevron-down\': !states.menuDisplays.indicatorControl}\"></i>\r\n                </a>\r\n                <div class=\"indicator-control floating-form\" style=\"display: none;width:250px;\">\r\n                    <label>\r\n                        Search&nbsp;\r\n                    </label>\r\n                    <span class=\"restrict-dropdown-menu\">\r\n                        <input type=\"text\" placeholder=\"ex: S&P 500, Energy CDS...\" class=\"form-control\"\r\n                                   ng-model=\"selected\"\r\n                                   typeahead=\"attr.label for attr in marketIndexTypeahead({userInput: $viewValue}) | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   typeahead-on-select=\"apiHandle.api.addMarketIndicator($item); selected = \'\';showIndicatorControl = false;\"\r\n                                   typeahead-focus/>\r\n                    </span>\r\n                    <a class=\"clickable\" ng-if=\"showMoreMarketInfo\" ng-click=\"moreMarketInfoCallback()\">Show All</a>\r\n                </div>\r\n            </span>\r\n            <span dsc-click-outside dsc-open-state=\"states.menuDisplays.benchmarkControl\"\r\n                  dsc-close-callback=\"toggleSlide(!states.menuDisplays.benchmarkControl, \'benchmark-control\')\"\r\n                    style=\"padding-right:10px\" ng-init=\"customBenchmark = {}\">\r\n                <a class=\"clickable\" style=\"padding-left:5px;text-decoration:none;\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.benchmarkControl, \'benchmark-control\');customBenchmark = {};\">\r\n                    <span class=\"fake-anchor-tag\">Benchmark</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.benchmarkControl, \'fa-chevron-down\': !states.menuDisplays.benchmarkControl}\"></i>\r\n                </a>\r\n                <div class=\"benchmark-control floating-form\" style=\"display: none;\">\r\n                    <alert ng-show=\"alerts.customBenchmark.active\" close=\"alerts.customBenchmark.active = false\" type=\"danger\" style=\"font-size: 12px;\">\r\n                        There were problems with your input\r\n                        <br/><br/>\r\n                        <ul style=\"list-style:inside;padding-left:0;\">\r\n                            <li ng-repeat=\"message in alerts.customBenchmark.messages\">{{message}}</li>\r\n                        </ul>\r\n                    </alert>\r\n                    <label>\r\n                        Sector&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.sector\"\r\n                                   typeahead=\"sector for sector in customBenchmarkOptions.sectors | filter:$viewValue:$emptyOrMatch | orderBy:\'toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        Rating&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.rating\"\r\n                                   typeahead=\"rating for rating in customBenchmarkOptions.ratings | filter:$viewValue:$emptyOrMatch | orderBy:\'toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        WAL&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.wal\"\r\n                                   typeahead=\"wal for wal in customBenchmarkOptions.wal | filter:$viewValue:$emptyOrMatch | orderBy:sortWalBuckets\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <label>\r\n                        Analytic&nbsp;\r\n                        <span class=\"restrict-dropdown-menu-small\">\r\n                            <input type=\"text\" class=\"form-control length-md\"\r\n                                   ng-model=\"customBenchmark.analytic\"\r\n                                   typeahead=\"attr as attr.label for attr in customBenchmarkOptions.analytics | filter:$viewValue:$emptyOrMatch | orderBy:\'label.toString()\'\"\r\n                                   typeahead-focus\r\n                                   typeahead-select-on-blur=\"true\"/>\r\n                        </span>\r\n                    </label>\r\n                    <button class=\"btn btn-success\" ng-click=\"apiHandle.api.addCustomBenchmark(customBenchmark)\"><i\r\n                            class=\"fa fa-play\"></i></button>\r\n                </div>\r\n            </span>\r\n            <span>\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-click=\"exportXLS()\"><i class=\"fa fa-share-square-o\"></i></span>\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-repeat=\"customButton in customButtons\" ng-click=\"customButton.callback()\">\r\n                    <i class=\"fa\" ng-class=\"customButton.faClass\"></i>\r\n                </span>\r\n            </span>\r\n        </span>\r\n    </div>\r\n    <hr/>\r\n    <div style=\"position:relative\">\r\n        <i ng-show=\"isProcessing\" class=\"fa fa-spinner fa-spin fa-3x spinner\" style=\"position:absolute;top:0;left:0\"></i>\r\n        <!-- this is where the stock chart goes -->\r\n        <div ng-attr-id=\"{{\'enriched-highstock-\'+id}}\" style=\"width:100%;height:100%;\"></div>\r\n        <alert ng-show=\"alerts.generalWarning.active\" style=\"position:absolute;bottom:0;right:0;\"\r\n               close=\"alerts.generalWarning.active = false\" type=\"danger\">\r\n            {{alerts.generalWarning.message}}\r\n        </alert>\r\n    </div>\r\n</div>\r\n");}]);