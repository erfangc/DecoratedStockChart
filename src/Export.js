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
                var zHTMLColumn = "";
                if(s.zData){
                    var uniqName = s.name.split(' ');
                    zHTMLColumn = "<th style='background-color: #0069d6; color: #ffffff;'>"+uniqName[0]+" "+uniqName[1]+" "+uniqName[2]+" Volume</th>";
                }
                    return "<th style='background-color: #0069d6; color: #ffffff;'>" + s.name + "</th>" + zHTMLColumn;

            }).join("") + "</tr>";
        // construct a union of all X values
        const domain = _.chain(series).map(function (s) {
            return _.map(s.data, function (datum) {
                return datum.x;
            });
        }).flatten().uniq().sortBy().reverse().value();

        // A flag to show if zData exists for at least one selected attributes
        var zDataExists = false;

        // construct an array lookup map for each series, mapping from x->y
        const matrix = _.map(series, function (s) {
            if(s.zData){
                zDataExists = true;
            }
            return _.chain(s.data).map(function (datum) {
                return (zDataExists === true ? [datum.x, [datum.y,datum.z]] : [datum.x, datum.y]);
            }).object().value();
        });
        // turn the lookup map into HTML
        const body =  _.map(domain, function (x) {
            return "<tr>" +
                "<td style='background-color: #999999'>" + (zDataExists ? moment.utc(x).format('ddd, MMM DD YYYY, h:mm:ss A'):moment.utc(x).format("YYYY-MM-DD")) + "</td>" +
                _.map(matrix, function (col) {
                    if(zDataExists){
                        return "<td>" + (col[x] && _.isArray(col[x]) && col[x][0]!== undefined && col[x][0] !== 'undefined' ? col[x][0] : 0) + "</td>" +
                            "<td>" + (col[x] && _.isArray(col[x]) && col[x][1]!== undefined && col[x][1] !== 'undefined'? col[x][1] : 0) + "</td>";
                    }
                    else{
                        return "<td>" + (col[x] && col[x] !== undefined && col[x] !== 'undefined' ? col[x] : 0) + "</td>";
                    }
                }).join("")
                + "</tr>";
        }).join("\n");

        return "<table>" +
            headers +
            body +
            "</table>";
    }
}());
