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
        //TODO: this is too hacky. Make this generic.
        if(seriesOption.axisType === "Index Level"){
            return -1;
        }
        return _.findIndex(chart.yAxis, function (axis) {
            return _.reduce(axis.series, function(sum, ser){
                return sum && ser.options.axisType === seriesOption.axisType;
            },true);
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
     * @param tag colTag to get the numToRating map
     * @return {string}
     */
    root.dsc.addAxisToChart = function (chart, name, scope, axisType, tag) {
        var tag = tag || null;
        const axisId = _.uniqueId("yAxis");
        chart.addAxis({
            labels: {
                formatter: function () {
                    if(scope.defaultSecurityAttribute.numToRating && scope.defaultSecurityAttribute.numToRating[tag] &&
                        scope.defaultSecurityAttribute.numToRating[tag][this.value] !== null &&
                        scope.defaultSecurityAttribute.numToRating[tag][this.value] !== undefined)
                        return scope.defaultSecurityAttribute.numToRating[tag][this.value];
                    else if(scope.defaultSecurityAttribute.numToRating && scope.defaultSecurityAttribute.numToRating[tag])
                        return null;
                    return this.value;
                }
            },
            title: {
                text: axisType,
                events: {
                    click: function (event) {
                        dsc.onAxisClick.call(this, event, scope);
                    }
                }
            },
            floor: scope.defaultSecurityAttribute.yAxis ? scope.defaultSecurityAttribute.yAxis.floor : undefined,
            ceiling: scope.defaultSecurityAttribute.yAxis ? scope.defaultSecurityAttribute.yAxis.ceiling : undefined,
            startOnTick: scope.defaultSecurityAttribute.yAxis ? false : true,
            endOnTick: scope.defaultSecurityAttribute.yAxis ? false : true,
            axisType: axisType,
            opposite: chart.options.yAxis.length % 2 == 1,      //check for only the yAxis. xAxis is always datetime.
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
        //Comment out the following line when MenuBuilder - triggerSeriesContextMenu is changed.
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
        if(series){
            const yAxis = series.yAxis;
            const securityId = series.options.securityId;

            if (angular.isFunction(series.remove))
                series.remove();

            dsc.afterSeriesRemove(yAxis, securityId, scope);
        }
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
                if(!isNaN(i))     //This checks if i gets value fastloopAsc and fastloop; filters
                sum += nums[i];
            var n = period;
            if (nums.length < period)
                n = nums.length;
            return (sum / n);
        }
    }
}());
