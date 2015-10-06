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