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
