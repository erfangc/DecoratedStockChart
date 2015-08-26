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
                .click(inertClickHandler);
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
        _.each(dsc.getMenuItems(args), function (menuItem) {
            $ctxMenu.children(".dropdown-menu").append(menuItem);
        });
        $ctxMenu.css({
            top: event.clientY + "px",
            left: event.clientX + "px"
        });
        $ctxMenu.show();
        return false;
    };

    function inertClickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
    }

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
                    .click(inertClickHandler)
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

        const addMA = transformerMenuItemGenerator.bind(null, seriesTransformer.toMovingAvg, "Add Moving Average");
        const addMV = transformerMenuItemGenerator.bind(null, seriesTransformer.toMovingVol, "Adding Moving Vol");

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
    };

    /**
     * generator function for SMA. Credit: Rosetta Code
     * @param period MA of this period will be taken by the resulting function
     * @returns {Function}
     */
    root.dsc.simpleMAGenerator = function (period) {
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
