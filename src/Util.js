/**
 * handles user click on an axis
 * @param event
 * @param scope
 */
function onAxisClick(event, scope) {
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
                    moveAxis(axis.series[0], 0, scope);
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
}

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
            .append(createAxesSubMenu(series, chart, scope));
    };
    return disableTransformation ? [changeAxis(), removeSeries()]
        : [changeAxis(), addMA(), addMV(), removeSeries()];
}

/**
 * moves an series from its current axis to the specified axis
 * @param series
 * @param axis
 * @param scope
 */
function moveAxis(series, axis, scope) {
    const seriesOptions = series.options;
    if (typeof axis == "number")
        seriesOptions.yAxis = axis;
    else
    // figure out the position
        seriesOptions.yAxis = _.findIndex(scope.states.chart.yAxis, function (x) {
            return x.userOptions.id == axis.userOptions.id;
        });
    series.remove();
    scope.addSeries(seriesOptions);
}

/**
 * create a sub dropdown for every axes in the chart
 * each item in the dropdown triggers a migration of the
 * given series to the axis represented by the item
 * @param series
 * @param chart
 * @param scope
 */
// FIXME the only way I know how to move axis is to destroy and recreate the series, figure out a better way if possible
function createAxesSubMenu(series, chart, scope) {
    const $dropdown = $("<ul class='dropdown-menu'></ul>");
    _.chain(chart.axes).filter(function (axis) {
        return !axis.isXAxis;
    }).each(function (axis, idx) {
        const $menuItem = $("<li><a>Y-Axis " + (idx + 1) + " " + axis.options.title.text + "</a></li>")
            .click(function () {
                const seriesOptions = series.options;
                seriesOptions.yAxis = idx;
                series.remove();
                scope.addSeries(seriesOptions);
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
                        onAxisClick.call(this, event, scope);
                    }
                }
            },
            opposite: chart.axes.length % 2 == 0,
            id: axisId
        });
        moveAxis(series, chart.get(axisId), scope);
    }));
    return $dropdown;
}

/**
 * attach the proper event listener behavior to legend elements
 * enabling dynamic context menu creation
 * @param args
 */
function attachContextMenuEvents(args) {

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
            _.each(getMenuItems(args), function (menuItem) {
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
        "<ul class='clickable dropdown-menu multi-level' style='display: block;'></ul>" +
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

/**
 * this is the event handler for the user clicking on the chart title
 * @param clickEvent
 */
function onTitleClick(clickEvent) {
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
