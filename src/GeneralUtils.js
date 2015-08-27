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
