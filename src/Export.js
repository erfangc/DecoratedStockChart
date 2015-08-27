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
        const categories = _.chain(series).map(function (s) {
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
        const body = _.map(categories, function (cat) {
            return "<tr>" +
                "<td style='background-color: #999999'>" + moment(cat).format("YYYY-MM-DD") + "</td>" +
                _.map(matrix, function (col) {
                    return "<td>" + col[cat] || 0 + "</td>";
                }).join("")
                + "</tr>";
        }).join("\n");

        return "<table>" +
            headers +
            body +
            "</table>";
    }
}());
