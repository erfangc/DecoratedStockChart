
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
 * create a sub dropdown for every axes in the chart
 * each item in the dropdown triggers a migration of the
 * given series to the axis represented by the item
 * @param series
 * @param chart
 */
// TODO implement this method!
function createAxesSubMenu(series, chart) {
    const $dropdown = $(
        "<div style='position: fixed; z-index: 10;'>" +
        "<ul class='dropdown-menu' style='display: block;'></ul>" +
        "</div>"
    );
    _.each(chart.axes, function (axis) {
        const $menuItem = $("<li><a>"+axis+"</a></li>");
        $dropdown.find(".dropdown-menu").append($menuItem);
    });
    return $dropdown;
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

/**
 * this is the event handler for the user clicking on the chart title
 * @param clickEvent
 */
function onTitleClick(clickEvent) {
    const chart = this;
    const $container = $(this.container);
    if ($container.find("input.form-control").length != 0)
        return;

    const $input = $("<input class='form-control floating-input' placeholder='Enter a New Title'/>");
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
            left: 0,
            width: "100%"
        }).appendTo($container);
    $input.focus();
};
