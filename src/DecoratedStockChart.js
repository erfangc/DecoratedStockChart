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
